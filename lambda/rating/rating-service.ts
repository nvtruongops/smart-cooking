import { RecipeRating, Recipe } from '../shared/types';
import { logStructured } from '../shared/utils';
import { AppError } from '../shared/responses';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBHelper } from '../shared/dynamodb';
import { IngredientEnrichmentService } from './ingredient-enrichment';

const AUTO_APPROVAL_THRESHOLD = 4.0;
const MIN_RATINGS_FOR_AUTO_APPROVAL = 3;

export interface SubmitRatingParams {
  recipeId: string;
  userId: string;
  rating: number;
  comment?: string;
  historyId?: string;
}

export interface SubmitRatingResult {
  rating: RecipeRating;
  average_rating: number;
  rating_count: number;
  auto_approved: boolean;
  message: string;
}

export class RatingService {
  /**
   * Submit a rating for a recipe
   * - Validates recipe exists
   * - Prevents duplicate ratings from same user
   * - Updates average rating
   * - Triggers auto-approval if threshold met
   * - Sends notification if auto-approved
   */
  static async submitRating(params: SubmitRatingParams): Promise<SubmitRatingResult> {
    const { recipeId, userId, rating, comment, historyId } = params;

    // Validate recipe exists
    const recipe = await this.getRecipeById(recipeId);
    if (!recipe) {
      throw new AppError(404, 'recipe_not_found', 'Recipe not found');
    }

    // Check if user already rated this recipe
    const existingRating = await this.getUserRatingForRecipe(userId, recipeId);
    if (existingRating) {
      throw new AppError(409, 'already_rated', 'You have already rated this recipe');
    }

    // Check if user has cooked this recipe (for verified_cook flag)
    const isVerifiedCook = historyId ? await this.verifyUserCookedRecipe(userId, recipeId, historyId) : false;

    // Create rating
    const ratingId = uuidv4();
    const now = new Date().toISOString();

    const newRating: RecipeRating = {
      rating_id: ratingId,
      recipe_id: recipeId,
      user_id: userId,
      history_id: historyId,
      rating,
      comment,
      is_verified_cook: isVerifiedCook,
      created_at: now,
      updated_at: now,
    };

    // Save rating to DynamoDB
    await DynamoDBHelper.put({
      PK: `RECIPE#${recipeId}`,
      SK: `RATING#${now}#${ratingId}`,
      GSI1PK: `USER#${userId}`,
      GSI1SK: `RATING#${now}#${ratingId}`,
      entity_type: 'RATING',
      ...newRating,
    });

    // Calculate new average rating
    const ratingStats = await this.calculateAverageRating(recipeId);

    // Update recipe with new average rating
    await this.updateRecipeRating(recipeId, ratingStats.average_rating, ratingStats.rating_count);

    // Check for auto-approval
    let autoApproved = false;
    let message = 'Rating submitted successfully';

    if (!recipe.is_approved && ratingStats.rating_count >= MIN_RATINGS_FOR_AUTO_APPROVAL && ratingStats.average_rating >= AUTO_APPROVAL_THRESHOLD) {
      await this.autoApproveRecipe(recipeId);
      autoApproved = true;
      message = `Rating submitted successfully. Recipe auto-approved with average rating of ${ratingStats.average_rating.toFixed(2)}!`;

      // Send notification to recipe owner
      if (recipe.user_id) {
        await this.sendAutoApprovalNotification(recipe.user_id, recipeId, ratingStats.average_rating);
      }
    }

    logStructured('INFO', 'Rating submitted and processed', {
      ratingId,
      recipeId,
      userId,
      rating,
      averageRating: ratingStats.average_rating,
      ratingCount: ratingStats.rating_count,
      autoApproved,
    });

    return {
      rating: newRating,
      average_rating: ratingStats.average_rating,
      rating_count: ratingStats.rating_count,
      auto_approved: autoApproved,
      message,
    };
  }

  /**
   * Get all ratings for a recipe with pagination
   */
  static async getRecipeRatings(recipeId: string, limit: number = 20, startKey?: string) {
    const recipe = await this.getRecipeById(recipeId);
    if (!recipe) {
      throw new AppError(404, 'recipe_not_found', 'Recipe not found');
    }

    const result = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `RECIPE#${recipeId}`,
        ':sk': 'RATING#',
      },
      Limit: limit,
      ExclusiveStartKey: startKey ? JSON.parse(Buffer.from(startKey, 'base64').toString()) : undefined,
      ScanIndexForward: false, // Most recent first
    });

    return {
      average_rating: recipe.average_rating || 0,
      rating_count: recipe.rating_count || 0,
      ratings: result.Items,
      last_evaluated_key: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Get all ratings submitted by a user
   */
  static async getUserRatings(userId: string, limit: number = 20, startKey?: string) {
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'RATING#',
      },
      Limit: limit,
      ExclusiveStartKey: startKey ? JSON.parse(Buffer.from(startKey, 'base64').toString()) : undefined,
      ScanIndexForward: false,
    });

    return {
      ratings: result.Items,
      last_evaluated_key: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined,
    };
  }

  /**
   * Calculate average rating for a recipe
   */
  private static async calculateAverageRating(recipeId: string): Promise<{ average_rating: number; rating_count: number }> {
    const result = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `RECIPE#${recipeId}`,
        ':sk': 'RATING#',
      },
    });

    if (result.Count === 0) {
      return { average_rating: 0, rating_count: 0 };
    }

    const totalRating = result.Items.reduce((sum: number, item: any) => sum + (item.rating || 0), 0);
    const averageRating = totalRating / result.Count;

    return {
      average_rating: Math.round(averageRating * 100) / 100, // Round to 2 decimal places
      rating_count: result.Count,
    };
  }

  /**
   * Update recipe with new rating statistics
   */
  private static async updateRecipeRating(recipeId: string, averageRating: number, ratingCount: number) {
    await DynamoDBHelper.update(
      `RECIPE#${recipeId}`,
      'METADATA',
      'SET average_rating = :avg, rating_count = :count, updated_at = :now',
      {
        ':avg': averageRating,
        ':count': ratingCount,
        ':now': new Date().toISOString(),
      }
    );
  }

  /**
   * Auto-approve a recipe based on rating threshold
   * Also enriches MASTER INGREDIENTS with new ingredients from this recipe
   */
  private static async autoApproveRecipe(recipeId: string) {
    const now = new Date().toISOString();

    await DynamoDBHelper.update(
      `RECIPE#${recipeId}`,
      'METADATA',
      'SET is_approved = :approved, is_public = :public, approval_type = :type, approved_at = :now, updated_at = :now',
      {
        ':approved': true,
        ':public': true, // Make recipe public when approved
        ':type': 'auto_rating',
        ':now': now,
      }
    );

    logStructured('INFO', 'Recipe auto-approved', {
      recipeId,
      approvedAt: now,
    });

    // 🎯 NEW: Enrich MASTER INGREDIENTS with new ingredients from this recipe
    try {
      const enrichmentResult = await IngredientEnrichmentService.enrichFromApprovedRecipe(recipeId);
      
      if (enrichmentResult.newIngredients > 0) {
        logStructured('INFO', 'MASTER INGREDIENTS enriched from approved recipe', {
          recipeId,
          totalIngredients: enrichmentResult.totalIngredients,
          newIngredients: enrichmentResult.newIngredients,
          existingIngredients: enrichmentResult.existingIngredients,
          addedIngredientIds: enrichmentResult.addedIngredientIds,
        });
      } else {
        logStructured('INFO', 'No new ingredients to add to MASTER', {
          recipeId,
          totalIngredients: enrichmentResult.totalIngredients,
        });
      }
    } catch (error) {
      // Don't fail the approval if enrichment fails
      logStructured('ERROR', 'Failed to enrich MASTER INGREDIENTS', {
        recipeId,
        error: String(error),
      });
    }
  }

  /**
   * Send notification to recipe owner about auto-approval
   */
  private static async sendAutoApprovalNotification(userId: string, recipeId: string, averageRating: number) {
    const notificationId = uuidv4();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

    await DynamoDBHelper.put({
      PK: `USER#${userId}`,
      SK: `NOTIFICATION#${now}#${notificationId}`,
      GSI1PK: `USER#${userId}#UNREAD`,
      GSI1SK: now,
      entity_type: 'NOTIFICATION',
      notification_id: notificationId,
      user_id: userId,
      type: 'recipe_approved',
      target_type: 'recipe',
      target_id: recipeId,
      content: `Your recipe has been auto-approved with an average rating of ${averageRating.toFixed(1)} stars!`,
      is_read: false,
      created_at: now,
      ttl,
    });

    logStructured('INFO', 'Auto-approval notification sent', {
      userId,
      recipeId,
      notificationId,
    });
  }

  /**
   * Get recipe by ID
   */
  private static async getRecipeById(recipeId: string): Promise<Recipe | null> {
    const result = await DynamoDBHelper.get(`RECIPE#${recipeId}`, 'METADATA');
    return result as Recipe | null;
  }

  /**
   * Check if user already rated this recipe
   */
  private static async getUserRatingForRecipe(userId: string, recipeId: string): Promise<RecipeRating | null> {
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'RATING#',
      },
    });

    // Check if any rating is for this recipe
    const userRating = result.Items.find((item: any) => item.recipe_id === recipeId);
    return userRating as RecipeRating | null;
  }

  /**
   * Verify that user has cooked this recipe
   */
  private static async verifyUserCookedRecipe(userId: string, recipeId: string, historyId: string): Promise<boolean> {
    const result = await DynamoDBHelper.get(`USER#${userId}`, `COOKING#${historyId}`);
    return result !== null && result !== undefined && result.recipe_id === recipeId && result.status === 'completed';
  }
}
