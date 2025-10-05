/**
 * Example: Enhanced AI Suggestion Lambda with comprehensive monitoring
 * This demonstrates how to integrate logger, metrics, and tracer into Lambda functions
 */

import { APIGatewayEvent, APIResponse, AISuggestionRequest, AISuggestionResponse } from '../shared/types';
import { logger, measureTime } from '../shared/logger';
import { metrics } from '../shared/metrics';
import { tracer, captureAWS } from '../shared/tracer';
import { successResponse, errorResponse, handleError, AppError } from '../shared/responses';

// Example of wrapping AWS SDK clients with X-Ray
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const dynamoClient = captureAWS(
  DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }))
);

export const handler = async (event: APIGatewayEvent): Promise<APIResponse> => {
  const startTime = Date.now();

  // Initialize logger context from event
  logger.initFromEvent(event);
  logger.logFunctionStart('ai-suggestion', event);

  try {
    // Trace the entire operation
    return await tracer.captureAsyncFunc('AIsuggestionHandler', async () => {

      // 1. Parse and validate request
      const request = await measureTime('parseRequest', async () => {
        return parseAndValidateRequest(event.body);
      });

      logger.info('Request validated', {
        ingredientCount: request.ingredients.length,
        recipeCount: request.recipe_count
      });

      // 2. Get user context
      const userId = getUserIdFromEvent(event);
      tracer.setUser(userId);
      logger.setContext({ userId });

      // 3. Validate ingredients with tracing
      const validatedIngredients = await tracer.captureBusinessOperation(
        'validateIngredients',
        () => validateIngredients(request.ingredients),
        {
          totalIngredients: request.ingredients.length
        }
      );

      // Track ingredient validation metrics
      metrics.trackIngredientValidation(
        request.ingredients.length,
        validatedIngredients.valid.length,
        validatedIngredients.invalid.length
      );

      if (validatedIngredients.valid.length === 0) {
        logger.warn('No valid ingredients provided', {
          invalidIngredients: validatedIngredients.invalid
        });
        throw new AppError(400, 'invalid_ingredients', 'No valid ingredients provided');
      }

      // 4. Generate recipes with database operation tracing
      const mixedRecipes = await tracer.captureDatabaseOperation(
        'generateMixedRecipes',
        'RecipesTable',
        async () => {
          // Your recipe generation logic here
          return generateMixedRecipes(validatedIngredients.valid, request.recipe_count);
        }
      );

      // 5. Track business metrics
      metrics.trackRecipeSuggestion(
        mixedRecipes.stats.from_database,
        mixedRecipes.stats.from_ai,
        validatedIngredients.valid.length
      );

      // Track AI usage if AI was used
      if (mixedRecipes.stats.from_ai > 0 && mixedRecipes.ai_metrics) {
        metrics.trackAiUsage(
          'claude-3-haiku',
          mixedRecipes.ai_metrics.inputTokens,
          mixedRecipes.ai_metrics.outputTokens,
          mixedRecipes.ai_metrics.duration,
          mixedRecipes.ai_metrics.cost
        );

        logger.logBusinessMetric('ai_cost_per_request', mixedRecipes.ai_metrics.cost, 'USD', {
          modelId: 'claude-3-haiku',
          recipeCount: mixedRecipes.stats.from_ai
        });
      }

      // 6. Log success and performance
      const duration = Date.now() - startTime;
      logger.logFunctionEnd('ai-suggestion', 200, duration);

      // Track API request metrics
      metrics.trackApiRequest(200, duration, '/ai/suggest');

      // Flush all metrics before returning
      await metrics.flush();

      // 7. Return response
      const response: AISuggestionResponse = {
        suggestions: mixedRecipes.recipes,
        stats: mixedRecipes.stats,
        warnings: validatedIngredients.warnings
      };

      logger.info('AI suggestion completed successfully', {
        recipeCount: mixedRecipes.recipes.length,
        dbCount: mixedRecipes.stats.from_database,
        aiCount: mixedRecipes.stats.from_ai,
        durationMs: duration
      });

      return successResponse(response);
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error with full context
    logger.error('AI suggestion failed', error, {
      durationMs: duration
    });

    // Track error metrics
    metrics.trackApiRequest(500, duration, '/ai/suggest');
    await metrics.flush();

    // Return error response
    logger.logFunctionEnd('ai-suggestion', 500, duration);
    return handleError(error);
  }
};

/**
 * Helper functions (simplified for example)
 */

function parseAndValidateRequest(body: string | null): AISuggestionRequest {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  try {
    const request = JSON.parse(body);

    if (!request.ingredients || !Array.isArray(request.ingredients)) {
      throw new AppError(400, 'invalid_ingredients', 'ingredients must be an array');
    }

    if (!request.recipe_count || request.recipe_count < 1 || request.recipe_count > 5) {
      throw new AppError(400, 'invalid_recipe_count', 'recipe_count must be between 1 and 5');
    }

    return request;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'invalid_json', 'Invalid JSON in request body');
  }
}

function getUserIdFromEvent(event: APIGatewayEvent): string {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) {
    logger.logSecurityEvent('missing_user_id', 'medium', {
      requestId: event.requestContext?.requestId
    });
    throw new AppError(401, 'unauthorized', 'User authentication required');
  }
  return userId;
}

async function validateIngredients(ingredients: string[]): Promise<{
  valid: string[];
  invalid: string[];
  warnings: any[];
}> {
  // Simplified validation logic
  logger.debug('Validating ingredients', { count: ingredients.length });

  // Your actual validation logic here
  return {
    valid: ingredients,
    invalid: [],
    warnings: []
  };
}

async function generateMixedRecipes(ingredients: string[], recipeCount: number): Promise<any> {
  // Simplified recipe generation logic
  logger.debug('Generating mixed recipes', {
    ingredientCount: ingredients.length,
    requestedCount: recipeCount
  });

  // Your actual recipe generation logic here
  return {
    recipes: [],
    stats: {
      requested: recipeCount,
      from_database: 2,
      from_ai: 1
    },
    ai_metrics: {
      inputTokens: 1000,
      outputTokens: 500,
      duration: 2500,
      cost: 0.05
    }
  };
}
