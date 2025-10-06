/**
 * Recipe Service
 * Handles all recipe-related business logic
 */

import { v4 as uuidv4 } from 'uuid';
import { DynamoDBHelper } from '../shared/dynamodb';
import { AppError } from '../shared/responses';
import { logStructured } from '../shared/utils';
import {
  CreateRecipeRequest,
  UpdateRecipeRequest,
  RecipeMetadata,
  RecipeIngredient,
  RecipeInstruction,
  Recipe,
  ListRecipesRequest,
  ListRecipesResponse,
  SearchRecipesRequest,
  SearchRecipesResponse
} from './types';

export class RecipeService {
  /**
   * Create a new recipe with metadata, ingredients, and instructions
   */
  static async createRecipe(userId: string, request: CreateRecipeRequest): Promise<{ recipe_id: string }> {
    const recipeId = uuidv4();
    const timestamp = new Date().toISOString();

    // Calculate total time
    const totalTime = (request.prep_time_minutes || 0) + (request.cook_time_minutes || 0);

    // Create recipe metadata
    const metadata: RecipeMetadata = {
      recipe_id: recipeId,
      title: request.title,
      description: request.description,
      cooking_method: request.cooking_method,
      cuisine_type: request.cuisine_type,
      meal_type: request.meal_type,
      difficulty_level: request.difficulty_level,
      prep_time_minutes: request.prep_time_minutes,
      cook_time_minutes: request.cook_time_minutes,
      total_time_minutes: totalTime,
      servings: request.servings,
      calories_per_serving: request.calories_per_serving,
      is_approved: false,
      approval_status: 'pending',
      rating_count: 0,
      created_by: userId,
      source: request.source || 'user_created',
      created_at: timestamp,
      updated_at: timestamp
    };

    // Save metadata to DynamoDB
    await this.saveRecipeMetadata(recipeId, userId, metadata);

    // Save ingredients
    if (request.ingredients && request.ingredients.length > 0) {
      await this.saveRecipeIngredients(recipeId, request.ingredients);
    }

    // Save instructions
    if (request.instructions && request.instructions.length > 0) {
      await this.saveRecipeInstructions(recipeId, request.instructions);
    }

    logStructured('INFO', 'Recipe created successfully', { recipeId, userId });

    return { recipe_id: recipeId };
  }

  /**
   * Save recipe metadata to DynamoDB
   */
  private static async saveRecipeMetadata(
    recipeId: string,
    userId: string,
    metadata: RecipeMetadata
  ): Promise<void> {
    await DynamoDBHelper.put({
      PK: `RECIPE#${recipeId}`,
      SK: 'METADATA',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `RECIPE#${metadata.created_at}`,
      GSI2PK: `METHOD#${metadata.cooking_method}`,
      GSI2SK: `RATING#${metadata.average_rating || 0}#${metadata.created_at}`,
      entity_type: 'recipe_metadata',
      ...metadata
    });
  }

  /**
   * Save recipe ingredients to DynamoDB
   */
  private static async saveRecipeIngredients(
    recipeId: string,
    ingredients: RecipeIngredient[]
  ): Promise<void> {
    const items = ingredients.map((ingredient, index) => ({
      PutRequest: {
        Item: {
          PK: `RECIPE#${recipeId}`,
          SK: `INGREDIENT#${String(index + 1).padStart(3, '0')}`,
          entity_type: 'recipe_ingredient',
          ...ingredient
        }
      }
    }));

    // Batch write ingredients (max 25 items per batch)
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      await DynamoDBHelper.batchWrite(batch);
    }
  }

  /**
   * Save recipe instructions to DynamoDB
   */
  private static async saveRecipeInstructions(
    recipeId: string,
    instructions: RecipeInstruction[]
  ): Promise<void> {
    const items = instructions.map((instruction) => ({
      PutRequest: {
        Item: {
          PK: `RECIPE#${recipeId}`,
          SK: `INSTRUCTION#${String(instruction.step_number).padStart(3, '0')}`,
          entity_type: 'recipe_instruction',
          ...instruction
        }
      }
    }));

    // Batch write instructions (max 25 items per batch)
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      await DynamoDBHelper.batchWrite(batch);
    }
  }

  /**
   * Get recipe by ID with full details (metadata, ingredients, instructions)
   */
  static async getRecipeById(recipeId: string, userId?: string): Promise<Recipe> {
    // Get metadata
    const metadataItem = await DynamoDBHelper.get(`RECIPE#${recipeId}`, 'METADATA');

    if (!metadataItem) {
      throw new AppError(404, 'recipe_not_found', 'Recipe not found');
    }

    const metadata = metadataItem as RecipeMetadata;

    // Check authorization for non-approved recipes
    if (!metadata.is_approved && metadata.created_by !== userId) {
      throw new AppError(403, 'access_denied', 'You do not have permission to view this recipe');
    }

    // Get ingredients
    const ingredientsResult = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `RECIPE#${recipeId}`,
        ':sk': 'INGREDIENT#'
      }
    });

    const ingredients = ingredientsResult.Items as RecipeIngredient[];

    // Get instructions
    const instructionsResult = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `RECIPE#${recipeId}`,
        ':sk': 'INSTRUCTION#'
      }
    });

    const instructions = instructionsResult.Items as RecipeInstruction[];

    return {
      metadata,
      ingredients: ingredients || [],
      instructions: instructions || []
    };
  }

  /**
   * Update recipe metadata
   */
  static async updateRecipe(userId: string, request: UpdateRecipeRequest): Promise<Recipe> {
    const { recipe_id, ...updates } = request;

    // Get metadata first to check ownership
    const metadataItem = await DynamoDBHelper.get(`RECIPE#${recipe_id}`, 'METADATA');

    if (!metadataItem) {
      throw new AppError(404, 'recipe_not_found', 'Recipe not found');
    }

    const metadata = metadataItem as RecipeMetadata;

    if (metadata.created_by !== userId) {
      throw new AppError(403, 'access_denied', 'You can only update your own recipes');
    }

    // Now get full recipe details
    const existingRecipe = await this.getRecipeById(recipe_id, userId);

    const timestamp = new Date().toISOString();

    // Build update expression
    const updateFields: string[] = [];
    const attributeValues: any = {
      ':updated_at': timestamp
    };
    const attributeNames: any = {};

    if (updates.title) {
      updateFields.push('#title = :title');
      attributeValues[':title'] = updates.title;
      attributeNames['#title'] = 'title';
    }

    if (updates.description !== undefined) {
      updateFields.push('description = :description');
      attributeValues[':description'] = updates.description;
    }

    if (updates.cooking_method) {
      updateFields.push('cooking_method = :cooking_method');
      attributeValues[':cooking_method'] = updates.cooking_method;
    }

    if (updates.cuisine_type !== undefined) {
      updateFields.push('cuisine_type = :cuisine_type');
      attributeValues[':cuisine_type'] = updates.cuisine_type;
    }

    if (updates.meal_type !== undefined) {
      updateFields.push('meal_type = :meal_type');
      attributeValues[':meal_type'] = updates.meal_type;
    }

    if (updates.difficulty_level !== undefined) {
      updateFields.push('difficulty_level = :difficulty_level');
      attributeValues[':difficulty_level'] = updates.difficulty_level;
    }

    if (updates.prep_time_minutes !== undefined) {
      updateFields.push('prep_time_minutes = :prep_time_minutes');
      attributeValues[':prep_time_minutes'] = updates.prep_time_minutes;
    }

    if (updates.cook_time_minutes !== undefined) {
      updateFields.push('cook_time_minutes = :cook_time_minutes');
      attributeValues[':cook_time_minutes'] = updates.cook_time_minutes;
    }

    if (updates.servings !== undefined) {
      updateFields.push('servings = :servings');
      attributeValues[':servings'] = updates.servings;
    }

    if (updates.calories_per_serving !== undefined) {
      updateFields.push('calories_per_serving = :calories_per_serving');
      attributeValues[':calories_per_serving'] = updates.calories_per_serving;
    }

    if (updates.image_url !== undefined) {
      updateFields.push('image_url = :image_url');
      attributeValues[':image_url'] = updates.image_url;
    }

    // Calculate new total time if prep or cook time changed
    if (updates.prep_time_minutes !== undefined || updates.cook_time_minutes !== undefined) {
      const prepTime = updates.prep_time_minutes ?? existingRecipe.metadata.prep_time_minutes ?? 0;
      const cookTime = updates.cook_time_minutes ?? existingRecipe.metadata.cook_time_minutes ?? 0;
      updateFields.push('total_time_minutes = :total_time_minutes');
      attributeValues[':total_time_minutes'] = prepTime + cookTime;
    }

    if (updateFields.length > 0) {
      updateFields.push('updated_at = :updated_at');
      const updateExpression = `SET ${updateFields.join(', ')}`;

      await DynamoDBHelper.update(
        `RECIPE#${recipe_id}`,
        'METADATA',
        updateExpression,
        attributeValues,
        Object.keys(attributeNames).length > 0 ? attributeNames : undefined
      );
    }

    // Update ingredients if provided
    if (updates.ingredients) {
      // Delete old ingredients
      const oldIngredients = await DynamoDBHelper.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `RECIPE#${recipe_id}`,
          ':sk': 'INGREDIENT#'
        }
      });

      if (oldIngredients.Items && oldIngredients.Items.length > 0) {
        const deleteItems = oldIngredients.Items.map(item => ({
          DeleteRequest: {
            Key: { PK: item.PK, SK: item.SK }
          }
        }));

        for (let i = 0; i < deleteItems.length; i += 25) {
          const batch = deleteItems.slice(i, i + 25);
          await DynamoDBHelper.batchWrite(batch);
        }
      }

      // Save new ingredients
      await this.saveRecipeIngredients(recipe_id, updates.ingredients);
    }

    // Update instructions if provided
    if (updates.instructions) {
      // Delete old instructions
      const oldInstructions = await DynamoDBHelper.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `RECIPE#${recipe_id}`,
          ':sk': 'INSTRUCTION#'
        }
      });

      if (oldInstructions.Items && oldInstructions.Items.length > 0) {
        const deleteItems = oldInstructions.Items.map(item => ({
          DeleteRequest: {
            Key: { PK: item.PK, SK: item.SK }
          }
        }));

        for (let i = 0; i < deleteItems.length; i += 25) {
          const batch = deleteItems.slice(i, i + 25);
          await DynamoDBHelper.batchWrite(batch);
        }
      }

      // Save new instructions
      await this.saveRecipeInstructions(recipe_id, updates.instructions);
    }

    logStructured('INFO', 'Recipe updated successfully', { recipe_id, userId });

    // Return updated recipe
    return await this.getRecipeById(recipe_id, userId);
  }

  /**
   * Delete recipe (only by owner)
   */
  static async deleteRecipe(userId: string, recipeId: string): Promise<void> {
    // Get metadata first to check ownership
    const metadataItem = await DynamoDBHelper.get(`RECIPE#${recipeId}`, 'METADATA');

    if (!metadataItem) {
      throw new AppError(404, 'recipe_not_found', 'Recipe not found');
    }

    const metadata = metadataItem as RecipeMetadata;

    if (metadata.created_by !== userId) {
      throw new AppError(403, 'access_denied', 'You can only delete your own recipes');
    }

    // Get all items for this recipe
    const allItems = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `RECIPE#${recipeId}`
      }
    });

    // Delete all items
    if (allItems.Items && allItems.Items.length > 0) {
      const deleteItems = allItems.Items.map(item => ({
        DeleteRequest: {
          Key: { PK: item.PK, SK: item.SK }
        }
      }));

      for (let i = 0; i < deleteItems.length; i += 25) {
        const batch = deleteItems.slice(i, i + 25);
        await DynamoDBHelper.batchWrite(batch);
      }
    }

    logStructured('INFO', 'Recipe deleted successfully', { recipeId, userId });
  }

  /**
   * List recipes with optional filters
   */
  static async listRecipes(userId: string, request: ListRecipesRequest): Promise<ListRecipesResponse> {
    const limit = request.limit || 20;
    let queryParams: any;

    if (request.filter_by_user) {
      // Get user's recipes
      queryParams = {
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`
        },
        ScanIndexForward: false,
        Limit: limit
      };
    } else if (request.cooking_method) {
      // Filter by cooking method
      queryParams = {
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `METHOD#${request.cooking_method}`
        },
        ScanIndexForward: false,
        Limit: limit
      };

      if (request.filter_by_approved) {
        queryParams.FilterExpression = 'is_approved = :approved';
        queryParams.ExpressionAttributeValues[':approved'] = true;
      }
    } else {
      // Get all approved recipes
      queryParams = {
        IndexName: 'GSI2',
        FilterExpression: 'is_approved = :approved AND entity_type = :type',
        ExpressionAttributeValues: {
          ':approved': true,
          ':type': 'recipe_metadata'
        },
        Limit: limit
      };
    }

    if (request.start_key) {
      queryParams.ExclusiveStartKey = JSON.parse(request.start_key);
    }

    const result = request.cooking_method || request.filter_by_user
      ? await DynamoDBHelper.query(queryParams)
      : await DynamoDBHelper.scan(queryParams);

    const recipes = result.Items as RecipeMetadata[];

    return {
      recipes: recipes || [],
      last_evaluated_key: result.LastEvaluatedKey
        ? JSON.stringify(result.LastEvaluatedKey)
        : undefined,
      count: result.Count || 0
    };
  }

  /**
   * Search recipes with advanced filtering, sorting, and pagination
   */
  static async searchRecipes(request: SearchRecipesRequest): Promise<SearchRecipesResponse> {
    const limit = request.limit || 20;
    const offset = request.offset || 0;

    // Build filter expression
    const filterExpressions: string[] = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    // Always filter for approved recipes and recipe_metadata entity type
    filterExpressions.push('is_approved = :approved');
    filterExpressions.push('entity_type = :entity_type');
    expressionAttributeValues[':approved'] = true;
    expressionAttributeValues[':entity_type'] = 'recipe_metadata';

    // Search query (title or description contains query string)
    if (request.q && request.q.trim().length > 0) {
      const searchTerm = request.q.trim().toLowerCase();
      filterExpressions.push('(contains(#title, :search) OR contains(#description, :search))');
      expressionAttributeNames['#title'] = 'title';
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':search'] = searchTerm;
    }

    // Cuisine type filter
    if (request.cuisine_type) {
      filterExpressions.push('cuisine_type = :cuisine_type');
      expressionAttributeValues[':cuisine_type'] = request.cuisine_type;
    }

    // Cooking method filter
    if (request.cooking_method) {
      filterExpressions.push('cooking_method = :cooking_method');
      expressionAttributeValues[':cooking_method'] = request.cooking_method;
    }

    // Meal type filter
    if (request.meal_type) {
      filterExpressions.push('meal_type = :meal_type');
      expressionAttributeValues[':meal_type'] = request.meal_type;
    }

    // Minimum rating filter
    if (request.min_rating !== undefined) {
      filterExpressions.push('average_rating >= :min_rating');
      expressionAttributeValues[':min_rating'] = request.min_rating;
    }

    // Max prep time filter
    if (request.max_prep_time) {
      filterExpressions.push('(attribute_not_exists(prep_time_minutes) OR prep_time_minutes <= :max_prep_time)');
      expressionAttributeValues[':max_prep_time'] = request.max_prep_time;
    }

    // Max cook time filter
    if (request.max_cook_time) {
      filterExpressions.push('(attribute_not_exists(cook_time_minutes) OR cook_time_minutes <= :max_cook_time)');
      expressionAttributeValues[':max_cook_time'] = request.max_cook_time;
    }

    // Difficulty level filter
    if (request.difficulty_level) {
      filterExpressions.push('difficulty_level = :difficulty_level');
      expressionAttributeValues[':difficulty_level'] = request.difficulty_level;
    }

    const filterExpression = filterExpressions.join(' AND ');

    // Scan with filters (DynamoDB doesn't support full-text search, so we use scan + filter)
    const scanParams: any = {
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues
    };

    if (Object.keys(expressionAttributeNames).length > 0) {
      scanParams.ExpressionAttributeNames = expressionAttributeNames;
    }

    const result = await DynamoDBHelper.scan(scanParams);
    let recipes = (result.Items as RecipeMetadata[]) || [];

    // Client-side sorting (since DynamoDB scan doesn't preserve order)
    const sortBy = request.sort_by || 'created_at';
    const sortOrder = request.sort_order || 'desc';

    recipes = this.sortRecipes(recipes, sortBy, sortOrder);

    // Get total count before pagination
    const totalCount = recipes.length;

    // Apply pagination
    const paginatedRecipes = recipes.slice(offset, offset + limit);
    const hasMore = (offset + limit) < totalCount;

    logStructured('INFO', 'Recipe search completed', {
      query: request.q,
      totalCount,
      returnedCount: paginatedRecipes.length,
      hasMore
    });

    return {
      recipes: paginatedRecipes,
      total_count: totalCount,
      has_more: hasMore,
      filters_applied: {
        query: request.q,
        cuisine_type: request.cuisine_type,
        cooking_method: request.cooking_method,
        meal_type: request.meal_type,
        min_rating: request.min_rating
      }
    };
  }

  /**
   * Sort recipes by specified criteria
   */
  private static sortRecipes(
    recipes: RecipeMetadata[],
    sortBy: string,
    sortOrder: string
  ): RecipeMetadata[] {
    const sorted = [...recipes].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case 'rating':
          aValue = a.average_rating || 0;
          bValue = b.average_rating || 0;
          break;
        case 'popularity':
          aValue = a.rating_count || 0;
          bValue = b.rating_count || 0;
          break;
        case 'prep_time':
          aValue = a.prep_time_minutes || 0;
          bValue = b.prep_time_minutes || 0;
          break;
        case 'created_at':
        default:
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
      }

      if (sortOrder === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

    return sorted;
  }

  /**
   * Get post count for a recipe
   * Task 17.2 - Display post count on recipe pages
   */
  static async getRecipePostCount(recipeId: string): Promise<number> {
    try {
      // Query all posts and filter by recipe_id
      const result = await DynamoDBHelper.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        FilterExpression: 'recipe_id = :recipeId',
        ExpressionAttributeValues: {
          ':pk': 'POST#',
          ':recipeId': recipeId,
        },
      });

      return result.Items?.length || 0;
    } catch (error) {
      logStructured('ERROR', 'Failed to get recipe post count', {
        recipeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Get friends who have cooked this recipe
   * Task 17.2 - Show friends who have cooked this recipe
   */
  static async getFriendsWhoCooked(
    userId: string,
    recipeId: string
  ): Promise<Array<{
    user_id: string;
    username: string;
    name?: string;
    avatar_url?: string;
    cooked_at: string;
    rating?: number;
  }>> {
    try {
      // Get user's friends list
      const friendsResult = await DynamoDBHelper.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'FRIEND#',
          ':status': 'accepted',
        },
      });

      const friendIds = (friendsResult.Items || []).map((item: any) => item.friend_id);

      if (friendIds.length === 0) {
        return [];
      }

      // Query cooking history for each friend who cooked this recipe
      const friendsCookedPromises = friendIds.map(async (friendId: string) => {
        const historyResult = await DynamoDBHelper.query({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          FilterExpression: 'recipe_id = :recipeId AND #status = :status',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':pk': `USER#${friendId}`,
            ':sk': 'COOKING#',
            ':recipeId': recipeId,
            ':status': 'completed',
          },
          Limit: 1, // Only need to know if they cooked it
        });

        if (historyResult.Items && historyResult.Items.length > 0) {
          const cookingSession = historyResult.Items[0];

          // Get friend's profile
          const profileResult = await DynamoDBHelper.get(`USER#${friendId}`, 'PROFILE');

          if (profileResult) {
            return {
              user_id: friendId,
              username: profileResult.username || 'Unknown',
              name: profileResult.full_name,
              avatar_url: profileResult.avatar_url,
              cooked_at: cookingSession.cook_date || cookingSession.created_at,
              rating: cookingSession.personal_rating,
            };
          }
        }

        return null;
      });

      const friendsCooked = await Promise.all(friendsCookedPromises);

      // Filter out nulls and sort by most recent
      const validFriends = friendsCooked
        .filter((friend): friend is NonNullable<typeof friend> => friend !== null)
        .sort((a, b) => {
          const dateA = new Date(a.cooked_at).getTime();
          const dateB = new Date(b.cooked_at).getTime();
          return dateB - dateA;
        });

      logStructured('INFO', 'Friends who cooked recipe retrieved', {
        userId,
        recipeId,
        friendsCount: validFriends.length,
      });

      return validFriends;
    } catch (error) {
      logStructured('ERROR', 'Failed to get friends who cooked recipe', {
        userId,
        recipeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }
}
