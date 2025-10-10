/**
 * Cooking Session Service
 * Business logic for cooking session management
 */

import { DynamoDBHelper } from '../shared/dynamodb';
import { generateUUID, formatTimestamp, validateRating, logStructured } from '../shared/utils';
import { AppError } from '../shared/responses';
import {
  CookingSession,
  CookingSessionStatus,
  CookingSessionDynamoItem,
  FavoriteRecipeDynamoItem,
  CookingStats,
  StartCookingRequest,
  CompleteCookingRequest,
  UpdateCookingStatusRequest,
  GetCookingHistoryRequest,
  GetCookingHistoryResponse,
  ToggleFavoriteRequest,
  GetFavoritesRequest,
  GetFavoritesResponse
} from './types';

export class CookingSessionService {
  /**
   * Start a new cooking session
   * FIX: Store complete recipe details for history display
   */
  static async startCooking(userId: string, request: StartCookingRequest): Promise<CookingSession> {
    // Verify recipe exists
    const recipe = await DynamoDBHelper.getRecipe(request.recipe_id);
    if (!recipe) {
      throw new AppError(404, 'recipe_not_found', 'Recipe not found');
    }

    const sessionId = generateUUID();
    const now = formatTimestamp();
    
    // FIX: Store complete recipe snapshot for history display
    const cookingSession: CookingSessionDynamoItem = {
      PK: `USER#${userId}`,
      SK: `SESSION#${now}#${sessionId}`,
      GSI1PK: `SESSION#${sessionId}`,
      GSI1SK: `STATUS#cooking#${now}`,
      GSI2PK: `RECIPE#${request.recipe_id}`,
      GSI2SK: `USER#${userId}#${now}`,
      EntityType: 'CookingSession',
      session_id: sessionId,
      user_id: userId,
      recipe_id: request.recipe_id,
      recipe_title: request.recipe_title || recipe.title,
      // FIX: Add recipe details for history display
      recipe_ingredients: recipe.ingredients || [],
      recipe_instructions: recipe.instructions || [],
      recipe_cooking_method: recipe.cooking_method,
      recipe_cuisine: recipe.cuisine,
      recipe_prep_time_minutes: recipe.prep_time_minutes,
      recipe_cook_time_minutes: recipe.cook_time_minutes,
      recipe_image_url: recipe.image_url,
      status: 'cooking',
      started_at: now,
      created_at: now,
      updated_at: now
    };

    await DynamoDBHelper.put(cookingSession);

    logStructured('INFO', 'Cooking session started with recipe details', {
      userId,
      sessionId,
      recipeId: request.recipe_id,
      recipeTitle: recipe.title,
      ingredientCount: recipe.ingredients?.length || 0
    });

    return this.transformToSession(cookingSession);
  }

  /**
   * Complete a cooking session
   */
  static async completeCooking(userId: string, request: CompleteCookingRequest): Promise<CookingSession> {
    if (request.rating && !validateRating(request.rating)) {
      throw new AppError(400, 'invalid_rating', 'Rating must be between 1 and 5');
    }

    const session = await this.getSessionById(request.session_id);
    
    if (session.user_id !== userId) {
      throw new AppError(403, 'unauthorized', 'You can only complete your own cooking sessions');
    }

    if (session.status === 'completed') {
      throw new AppError(409, 'already_completed', 'Cooking session is already completed');
    }

    const now = formatTimestamp();
    const startedAt = new Date(session.started_at);
    const completedAt = new Date(now);
    const durationMinutes = Math.round((completedAt.getTime() - startedAt.getTime()) / (1000 * 60));

    // Update session status
    const updatedSession = await DynamoDBHelper.update(
      session.PK,
      session.SK,
      'SET #status = :status, completed_at = :completed_at, cooking_duration_minutes = :duration, updated_at = :updated_at, GSI1SK = :gsi1sk' +
      (request.rating ? ', rating = :rating' : '') +
      (request.review ? ', review = :review' : '') +
      (request.notes ? ', notes = :notes' : ''),
      {
        ':status': 'completed',
        ':completed_at': now,
        ':duration': durationMinutes,
        ':updated_at': now,
        ':gsi1sk': `STATUS#completed#${now}`,
        ...(request.rating && { ':rating': request.rating }),
        ...(request.review && { ':review': request.review }),
        ...(request.notes && { ':notes': request.notes })
      },
      {
        '#status': 'status'
      }
    );

    logStructured('INFO', 'Cooking session completed', {
      userId,
      sessionId: request.session_id,
      duration: durationMinutes,
      rating: request.rating
    });

    return this.transformToSession(updatedSession);
  }

  /**
   * Update cooking session status
   */
  static async updateCookingStatus(userId: string, request: UpdateCookingStatusRequest): Promise<CookingSession> {
    if (!['cooking', 'completed', 'abandoned'].includes(request.status)) {
      throw new AppError(400, 'invalid_status', 'Status must be cooking, completed, or abandoned');
    }

    // Validate rating before querying session
    if (request.rating !== undefined && !validateRating(request.rating)) {
      throw new AppError(400, 'invalid_rating', 'Rating must be between 1 and 5');
    }

    const session = await this.getSessionById(request.session_id);
    
    if (session.user_id !== userId) {
      throw new AppError(403, 'unauthorized', 'You can only update your own cooking sessions');
    }

    const now = formatTimestamp();
    let updateExpression = 'SET #status = :status, updated_at = :updated_at, GSI1SK = :gsi1sk';
    const expressionValues: any = {
      ':status': request.status,
      ':updated_at': now,
      ':gsi1sk': `STATUS#${request.status}#${now}`
    };

    // Calculate duration if completing or abandoning
    if (request.status === 'completed' || request.status === 'abandoned') {
      const startedAt = new Date(session.started_at);
      const endedAt = new Date(now);
      const durationMinutes = Math.round((endedAt.getTime() - startedAt.getTime()) / (1000 * 60));
      
      updateExpression += ', cooking_duration_minutes = :duration';
      expressionValues[':duration'] = durationMinutes;

      if (request.status === 'completed') {
        updateExpression += ', completed_at = :completed_at';
        expressionValues[':completed_at'] = now;
      } else {
        updateExpression += ', abandoned_at = :abandoned_at';
        expressionValues[':abandoned_at'] = now;
      }
    }

    // Add optional fields
    if (request.rating) {
      updateExpression += ', rating = :rating';
      expressionValues[':rating'] = request.rating;
    }

    if (request.review) {
      updateExpression += ', review = :review';
      expressionValues[':review'] = request.review;
    }

    if (request.notes) {
      updateExpression += ', notes = :notes';
      expressionValues[':notes'] = request.notes;
    }

    const updatedSession = await DynamoDBHelper.update(
      session.PK,
      session.SK,
      updateExpression,
      expressionValues,
      { '#status': 'status' }
    );

    logStructured('INFO', 'Cooking session status updated', {
      userId,
      sessionId: request.session_id,
      status: request.status
    });

    return this.transformToSession(updatedSession);
  }

  /**
   * Get cooking history with filtering and sorting
   */
  static async getCookingHistory(userId: string, request: GetCookingHistoryRequest): Promise<GetCookingHistoryResponse> {
    const limit = request.limit || 20;
    const statusFilter = request.status_filter;
    const recipeIdFilter = request.recipe_id_filter;
    const sortOrder = request.sort_order === 'asc' ? true : false;
    const startKey = request.start_key ? JSON.parse(request.start_key) : undefined;

    let queryExpression = 'PK = :pk AND begins_with(SK, :sk)';
    const expressionValues: any = {
      ':pk': `USER#${userId}`,
      ':sk': 'SESSION#'
    };

    // Add filters
    let filterExpression = '';
    const expressionNames: any = {};

    if (statusFilter) {
      filterExpression = '#status = :status';
      expressionValues[':status'] = statusFilter;
      expressionNames['#status'] = 'status';
    }

    if (recipeIdFilter) {
      if (filterExpression) filterExpression += ' AND ';
      filterExpression += 'recipe_id = :recipe_id';
      expressionValues[':recipe_id'] = recipeIdFilter;
    }

    const result = await DynamoDBHelper.query({
      KeyConditionExpression: queryExpression,
      ExpressionAttributeValues: expressionValues,
      ...(filterExpression && { FilterExpression: filterExpression }),
      ...(Object.keys(expressionNames).length > 0 && { ExpressionAttributeNames: expressionNames }),
      ScanIndexForward: sortOrder,
      Limit: limit,
      ExclusiveStartKey: startKey
    });

    // Transform DynamoDB items to CookingSession objects
    const sessions: CookingSession[] = result.Items.map((item: any) => this.transformToSession(item));

    return {
      sessions,
      last_evaluated_key: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : undefined,
      total_count: result.Count
    };
  }

  /**
   * Get cooking statistics for user
   */
  static async getCookingStats(userId: string): Promise<CookingStats> {
    // Get all cooking sessions for the user
    const result = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'SESSION#'
      }
    });

    const sessions = result.Items as CookingSessionDynamoItem[];
    
    // Calculate statistics
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.status === 'completed').length;
    const abandonedSessions = sessions.filter(s => s.status === 'abandoned').length;
    
    // Calculate total and average for completed sessions only
    const completedSessionsWithDuration = sessions.filter(s => s.status === 'completed' && s.cooking_duration_minutes);
    const totalCookingTime = sessions
      .filter(s => s.cooking_duration_minutes)
      .reduce((sum, s) => sum + (s.cooking_duration_minutes || 0), 0);

    const averageSessionDuration = completedSessionsWithDuration.length > 0 ?
      Math.round(completedSessionsWithDuration.reduce((sum, s) => sum + (s.cooking_duration_minutes || 0), 0) / completedSessionsWithDuration.length) : 0;

    // Find most cooked recipe - prefer recipes cooked more recently when tied
    const recipeCounts: { [key: string]: { count: number; title?: string; latestSession: string } } = {};
    sessions.forEach(session => {
      if (!recipeCounts[session.recipe_id]) {
        recipeCounts[session.recipe_id] = {
          count: 0,
          title: session.recipe_title,
          latestSession: session.created_at
        };
      }
      recipeCounts[session.recipe_id].count++;
      // Update to most recent session
      if (session.created_at > recipeCounts[session.recipe_id].latestSession) {
        recipeCounts[session.recipe_id].latestSession = session.created_at;
      }
    });

    const mostCookedRecipe = Object.entries(recipeCounts)
      .sort(([,a], [,b]) => {
        // Sort by count descending, then by most recent session descending
        if (b.count !== a.count) return b.count - a.count;
        return b.latestSession.localeCompare(a.latestSession);
      })[0];

    // Calculate average rating
    const ratingsSum = sessions
      .filter(s => s.rating)
      .reduce((sum, s) => sum + (s.rating || 0), 0);
    const ratingsCount = sessions.filter(s => s.rating).length;
    const averageRating = ratingsCount > 0 ? 
      Math.round((ratingsSum / ratingsCount) * 10) / 10 : undefined;

    // Get favorites count
    const favoritesResult = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'FAVORITE#'
      }
    });

    return {
      user_id: userId,
      total_sessions: totalSessions,
      completed_sessions: completedSessions,
      abandoned_sessions: abandonedSessions,
      total_cooking_time_minutes: totalCookingTime,
      average_session_duration_minutes: averageSessionDuration,
      favorite_recipes_count: favoritesResult.Count,
      most_cooked_recipe: mostCookedRecipe ? {
        recipe_id: mostCookedRecipe[0],
        recipe_title: mostCookedRecipe[1].title,
        times_cooked: mostCookedRecipe[1].count
      } : undefined,
      average_rating: averageRating
    };
  }

  /**
   * Toggle favorite status for a recipe
   */
  static async toggleFavorite(userId: string, request: ToggleFavoriteRequest): Promise<{ is_favorite: boolean; message: string }> {
    // Check if already favorited
    const existingFavorite = await DynamoDBHelper.get(
      `USER#${userId}`,
      `FAVORITE#${request.recipe_id}`
    );

    const now = formatTimestamp();

    if (existingFavorite) {
      // Remove from favorites
      await DynamoDBHelper.delete(
        `USER#${userId}`,
        `FAVORITE#${request.recipe_id}`
      );

      logStructured('INFO', 'Recipe removed from favorites', {
        userId,
        recipeId: request.recipe_id
      });

      return { 
        is_favorite: false, 
        message: 'Recipe removed from favorites' 
      };
    } else {
      // Add to favorites
      const favorite: FavoriteRecipeDynamoItem = {
        PK: `USER#${userId}`,
        SK: `FAVORITE#${request.recipe_id}`,
        GSI1PK: `RECIPE#${request.recipe_id}`,
        GSI1SK: `USER#${userId}`,
        EntityType: 'FavoriteRecipe',
        user_id: userId,
        recipe_id: request.recipe_id,
        recipe_title: request.recipe_title,
        favorited_at: now,
        times_cooked: 0
      };

      await DynamoDBHelper.put(favorite);

      logStructured('INFO', 'Recipe added to favorites', {
        userId,
        recipeId: request.recipe_id
      });

      return { 
        is_favorite: true, 
        message: 'Recipe added to favorites' 
      };
    }
  }

  /**
   * Delete a cooking session
   */
  static async deleteCookingSession(userId: string, sessionId: string): Promise<void> {
    logStructured('INFO', 'Attempting to delete cooking session', {
      userId,
      sessionId
    });

    const session = await this.getSessionById(sessionId);
    
    logStructured('INFO', 'Session found', {
      sessionUserId: session.user_id,
      requestUserId: userId,
      sessionPK: session.PK,
      sessionSK: session.SK
    });
    
    if (session.user_id !== userId) {
      throw new AppError(403, 'unauthorized', 'You can only delete your own cooking sessions');
    }

    // Delete from DynamoDB
    await DynamoDBHelper.delete(session.PK, session.SK);

    logStructured('INFO', 'Cooking session deleted', {
      userId,
      sessionId
    });
  }

  /**
   * Get user's favorite recipes
   */
  static async getFavorites(userId: string, request: GetFavoritesRequest): Promise<GetFavoritesResponse> {
    const limit = request.limit || 20;
    const startKey = request.start_key ? JSON.parse(request.start_key) : undefined;

    const result = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'FAVORITE#'
      },
      ScanIndexForward: false, // Most recent first
      Limit: limit,
      ExclusiveStartKey: startKey
    });

    // Transform to FavoriteRecipe objects
    const favorites = result.Items.map((item: any) => ({
      user_id: item.user_id,
      recipe_id: item.recipe_id,
      recipe_title: item.recipe_title,
      favorited_at: item.favorited_at,
      last_cooked_at: item.last_cooked_at,
      times_cooked: item.times_cooked,
      average_rating: item.average_rating
    }));

    return {
      favorites,
      last_evaluated_key: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : undefined,
      total_count: result.Count
    };
  }

  /**
   * Get session by ID (internal helper)
   */
  private static async getSessionById(sessionId: string): Promise<CookingSessionDynamoItem> {
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `SESSION#${sessionId}`
      }
    });

    if (!result.Items || result.Items.length === 0) {
      throw new AppError(404, 'session_not_found', 'Cooking session not found');
    }

    return result.Items[0] as CookingSessionDynamoItem;
  }

  /**
   * Transform DynamoDB item to CookingSession object
   * FIX: Include recipe details for history display
   */
  private static transformToSession(item: any): CookingSession {
    return {
      session_id: item.session_id,
      user_id: item.user_id,
      recipe_id: item.recipe_id,
      recipe_title: item.recipe_title,
      // FIX: Include recipe details
      recipe_ingredients: item.recipe_ingredients,
      recipe_instructions: item.recipe_instructions,
      recipe_cooking_method: item.recipe_cooking_method,
      recipe_cuisine: item.recipe_cuisine,
      recipe_prep_time_minutes: item.recipe_prep_time_minutes,
      recipe_cook_time_minutes: item.recipe_cook_time_minutes,
      recipe_image_url: item.recipe_image_url,
      status: item.status,
      started_at: item.started_at,
      completed_at: item.completed_at,
      abandoned_at: item.abandoned_at,
      cooking_duration_minutes: item.cooking_duration_minutes,
      rating: item.rating,
      review: item.review,
      notes: item.notes,
      created_at: item.created_at,
      updated_at: item.updated_at
    };
  }
}