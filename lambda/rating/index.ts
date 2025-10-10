import { APIGatewayEvent, APIResponse, RatingRequest } from '../shared/types';
import { logStructured } from '../shared/utils';
import { successResponse, errorResponse, handleError } from '../shared/responses';
import { RatingService } from './rating-service';
import { logger } from '../shared/logger';
import { metrics } from '../shared/metrics';
import { tracer } from '../shared/tracer';

/**
 * Lambda handler for recipe rating management
 *
 * Endpoints:
 * - POST /ratings - Submit a recipe rating
 * - GET /ratings/{recipeId} - Get ratings for a recipe
 * - GET /ratings/user/{userId} - Get user's ratings
 */
export async function handler(event: APIGatewayEvent): Promise<APIResponse> {
  const startTime = Date.now();
  
  // Initialize logger with request context
  logger.initFromEvent(event);
  logger.logFunctionStart('rating', event);

  try {
    const userId = event.requestContext.authorizer?.claims.sub;
    if (!userId) {
      return errorResponse(401, 'unauthorized', 'User is not authenticated');
    }

    // Set X-Ray user context
    tracer.setUser(userId);

    logger.info('Rating request received', {
      method: event.httpMethod,
      path: event.path,
      userId,
      pathParameters: event.pathParameters,
    });

    // Route based on HTTP method and path
    if (event.httpMethod === 'POST' && event.path === '/ratings') {
      return await submitRating(event, userId);
    } else if (event.httpMethod === 'GET' && event.path.startsWith('/ratings/')) {
      if (event.pathParameters?.recipeId) {
        return await getRecipeRatings(event, userId);
      } else if (event.path.includes('/ratings/user/')) {
        return await getUserRatings(event, userId);
      }
    }

    return errorResponse(404, 'not_found', 'Endpoint not found');
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('Rating handler error', error, { duration });
    metrics.trackApiRequest(500, duration, 'rating');
    logger.logFunctionEnd('rating', 500, duration);
    return handleError(error);
  } finally {
    // Flush metrics and log function end
    const duration = Date.now() - startTime;
    logger.logFunctionEnd('rating', 200, duration);
    await metrics.flush();
  }
}

/**
 * Submit a rating for a recipe
 * Handles validation, average rating calculation, and auto-approval
 */
async function submitRating(event: APIGatewayEvent, userId: string): Promise<APIResponse> {
  if (!event.body) {
    return errorResponse(400, 'bad_request', 'Request body is required');
  }

  const request: RatingRequest = JSON.parse(event.body);

  // Validate rating
  if (!request.rating || request.rating < 1 || request.rating > 5) {
    return errorResponse(400, 'invalid_rating', 'Rating must be between 1 and 5');
  }

  if (!request.recipe_id) {
    return errorResponse(400, 'missing_recipe_id', 'Recipe ID is required');
  }

  // Submit rating and get result
  const result = await RatingService.submitRating({
    recipeId: request.recipe_id,
    userId,
    rating: request.rating,
    comment: request.comment,
    historyId: request.history_id,
  });

  // Track rating metrics
  metrics.trackRecipeRating(
    request.rating,
    'database', // Assuming this is for database recipes
    !!request.history_id // Is verified cook if history_id provided
  );

  if (result.auto_approved) {
    metrics.trackRecipeAutoApproval(true, result.average_rating, result.rating_count);
  }

  logger.info('Rating submitted', {
    userId,
    recipeId: request.recipe_id,
    rating: request.rating,
    autoApproved: result.auto_approved,
    averageRating: result.average_rating,
  });

  return successResponse({
    rating: result.rating,
    average_rating: result.average_rating,
    rating_count: result.rating_count,
    auto_approved: result.auto_approved,
    message: result.message,
  }, 201);
}

/**
 * Get all ratings for a specific recipe
 */
async function getRecipeRatings(event: APIGatewayEvent, userId: string): Promise<APIResponse> {
  const recipeId = event.pathParameters?.recipeId;
  if (!recipeId) {
    return errorResponse(400, 'missing_recipe_id', 'Recipe ID is required');
  }

  const limit = event.queryStringParameters?.limit
    ? parseInt(event.queryStringParameters.limit)
    : 20;
  const startKey = event.queryStringParameters?.start_key;

  const result = await RatingService.getRecipeRatings(recipeId, limit, startKey);

  return successResponse({
    recipe_id: recipeId,
    average_rating: result.average_rating,
    rating_count: result.rating_count,
    ratings: result.ratings,
    last_evaluated_key: result.last_evaluated_key,
  });
}

/**
 * Get all ratings submitted by a user
 */
async function getUserRatings(event: APIGatewayEvent, userId: string): Promise<APIResponse> {
  const targetUserId = event.pathParameters?.userId || userId;

  const limit = event.queryStringParameters?.limit
    ? parseInt(event.queryStringParameters.limit)
    : 20;
  const startKey = event.queryStringParameters?.start_key;

  const result = await RatingService.getUserRatings(targetUserId, limit, startKey);

  return successResponse({
    user_id: targetUserId,
    ratings: result.ratings,
    last_evaluated_key: result.last_evaluated_key,
  });
}
