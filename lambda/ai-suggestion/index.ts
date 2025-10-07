import { APIGatewayEvent, APIResponse, AISuggestionRequest, AISuggestionResponse, UserProfile, UserPreferences } from '../shared/types';
import { FlexibleMixAlgorithm } from './flexible-mix-algorithm';
import { BedrockAIClient } from './bedrock-client';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../shared/logger';
import { metrics } from '../shared/metrics';
import { tracer, captureAWS } from '../shared/tracer';
import { ErrorHandler, withErrorHandling } from '../shared/error-handler';
import { executeWithRecovery } from '../shared/error-recovery';
import { 
  BadRequestError, 
  UnauthorizedError, 
  AIServiceError,
  ValidationError 
} from '../shared/errors';

// Environment variables
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'smart-cooking-data';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Initialize services with X-Ray tracing
const dynamoClient = captureAWS(DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION })));
const flexibleMixAlgorithm = new FlexibleMixAlgorithm(DYNAMODB_TABLE, AWS_REGION);

export const handler = async (event: APIGatewayEvent): Promise<APIResponse> => {
  const startTime = Date.now();
  
  // Initialize logger with request context
  logger.initFromEvent(event);
  logger.logFunctionStart('ai-suggestion', event);

  // Set X-Ray user context
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (userId) {
    tracer.setUser(userId);
  }

  return await ErrorHandler.executeWithErrorHandling(
    async () => {
      // Validate HTTP method
      if (event.httpMethod !== 'POST') {
        throw new BadRequestError('Method not allowed. Use POST.');
      }

      // Parse and validate request body
      const request = ErrorHandler.validateRequest(event.body, ['ingredients', 'recipe_count']);
      
      // Additional validation for AI suggestion specific fields
      if (!Array.isArray(request.ingredients) || request.ingredients.length === 0) {
        throw new ValidationError('ingredients must be a non-empty array');
      }

      if (typeof request.recipe_count !== 'number' || request.recipe_count < 1 || request.recipe_count > 5) {
        throw new ValidationError('recipe_count must be a number between 1 and 5');
      }

      // Get user context from authorization
      const userId = ErrorHandler.extractUserId(event);
      const userContext = await retrieveUserContext(userId);
      
      // SKIP ingredient validation - let AI handle fuzzy matching and interpretation
      // AI is smart enough to interpret "ca ro" → "cà rốt", "hanh la" → "hành lá", etc.
      logger.info('Skipping ingredient validation, letting AI interpret', { 
        ingredients: request.ingredients 
      });

      // Execute AI suggestion with error recovery
      const mixedRecipes = await executeWithRecovery(
        async () => {
          return await tracer.captureBusinessOperation(
            'generate-mixed-recipes',
            () => flexibleMixAlgorithm.generateMixedRecipes({
              ingredients: request.ingredients, // Pass raw ingredients to AI
              recipe_count: request.recipe_count,
              user_context: userContext
            }),
            {
              ingredientCount: request.ingredients.length,
              requestedRecipes: request.recipe_count
            }
          );
        },
        {
          operation: 'ai-suggestion',
          userId,
          requestId: event.requestContext.requestId,
          originalRequest: request
        }
      );

      // Track suggestion history for analytics and cost optimization
      const suggestionId = await trackSuggestionHistory({
        userId,
        request,
        ingredients: request.ingredients, // Use raw ingredients
        mixedRecipes
      });

      // Format response
      const response: AISuggestionResponse = {
        suggestions: mixedRecipes.recipes,
        stats: mixedRecipes.stats,
        warnings: [] // No warnings since we skip validation
      };

      // Log business metrics
      logger.logBusinessMetric('ai-suggestion-completed', mixedRecipes.recipes.length, 'count', {
        userId,
        fromDatabase: mixedRecipes.stats.from_database,
        fromAi: mixedRecipes.stats.from_ai,
        costSaved: mixedRecipes.cost_optimization?.estimated_ai_cost_saved || 0
      });

      // Track metrics
      metrics.trackRecipeSuggestion(
        mixedRecipes.stats.from_database,
        mixedRecipes.stats.from_ai,
        request.ingredients.length
      );

      // Track API request metrics
      const duration = Date.now() - startTime;
      metrics.trackApiRequest(200, duration, 'ai-suggestion');
      
      logger.logFunctionEnd('ai-suggestion', 200, duration);

      return createSuccessResponse(response, {
        'X-Suggestion-Id': suggestionId,
        'X-Cost-Saved': (mixedRecipes.cost_optimization?.estimated_ai_cost_saved || 0).toString(),
        'X-DB-Coverage': mixedRecipes.stats.database_coverage_percentage?.toString() || '0'
      });
    },
    {
      operation: 'ai-suggestion',
      userId,
      requestId: event.requestContext.requestId,
      enableFallback: true,
      fallbackFn: async () => {
        // Fallback to database-only results
        logger.info('Using fallback for AI suggestion failure');
        return await handleAIFailureFallback(event);
      },
      enableRetry: false // AI operations shouldn't be retried due to cost
    }
  ).finally(async () => {
    // Flush metrics before function ends
    await metrics.flush();
  });
};

/**
 * Parse and validate the incoming request
 */
function parseAndValidateRequest(body: string | null): AISuggestionRequest {
  if (!body) {
    throw new Error('Request body is required');
  }

  let request: AISuggestionRequest;
  try {
    request = JSON.parse(body);
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }

  // Validate required fields
  if (!request.ingredients || !Array.isArray(request.ingredients) || request.ingredients.length === 0) {
    throw new Error('ingredients array is required and must not be empty');
  }

  if (!request.recipe_count || typeof request.recipe_count !== 'number' || request.recipe_count < 1 || request.recipe_count > 5) {
    throw new Error('recipe_count must be a number between 1 and 5');
  }

  // Validate ingredients
  if (request.ingredients.some(ing => typeof ing !== 'string' || ing.trim().length === 0)) {
    throw new Error('All ingredients must be non-empty strings');
  }

  // Normalize ingredients
  request.ingredients = request.ingredients.map(ing => ing.trim());

  return request;
}

/**
 * Extract user ID from API Gateway event
 */
function getUserIdFromEvent(event: APIGatewayEvent): string {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    throw new Error('User authentication required');
  }
  return userId;
}

/**
 * Retrieve user context for personalization (privacy-aware)
 */
async function retrieveUserContext(userId: string): Promise<import('./bedrock-client').UserContext> {
  try {
    // Get user profile
    const profileCommand = new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE'
      }
    });

    const profileResult = await dynamoClient.send(profileCommand);
    const profile = profileResult.Item as UserProfile | undefined;

    // Get user preferences
    const preferencesCommand = new GetCommand({
      TableName: DYNAMODB_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PREFERENCES'
      }
    });

    const preferencesResult = await dynamoClient.send(preferencesCommand);
    const preferences = preferencesResult.Item as UserPreferences | undefined;

    // Create privacy-aware user context
    return BedrockAIClient.createUserContext(profile, preferences);

  } catch (error) {
    console.error('Error retrieving user context:', error);
    // Return default context if user data retrieval fails
    return {
      dietary_restrictions: [],
      allergies: [],
      favorite_cuisines: [],
      preferred_cooking_methods: []
    };
  }
}

/**
 * Validate ingredients using the existing ingredient validator
 */
async function validateIngredients(ingredients: string[]): Promise<{
  valid: string[];
  invalid: string[];
  warnings: import('../shared/types').ValidationWarning[];
}> {
  try {
    // Import the ingredient service
    const { IngredientService } = await import('../shared/ingredient-service');

    const validationResults = await Promise.all(
      ingredients.map(async (ingredient) => {
        try {
          const searchResults = await IngredientService.searchIngredients(ingredient, { limit: 1, fuzzyThreshold: 0.7 });
          
          if (searchResults.length > 0) {
            const match = searchResults[0];
            return {
              original: ingredient,
              validated: match.name,
              isValid: true,
              warning: match.match_type === 'fuzzy' ? {
                original: ingredient,
                corrected: match.name,
                confidence: match.match_score,
                message: `"${ingredient}" được hiểu là "${match.name}"`
              } : undefined
            };
          } else {
            return {
              original: ingredient,
              validated: ingredient,
              isValid: false,
              warning: {
                ingredient: ingredient,
                message: `Không tìm thấy nguyên liệu "${ingredient}" trong cơ sở dữ liệu`,
                suggestions: []
              }
            };
          }
        } catch (error) {
          console.error(`Error validating ingredient "${ingredient}":`, error);
          return {
            original: ingredient,
            validated: ingredient,
            isValid: false,
            warning: {
              ingredient: ingredient,
              message: `Lỗi khi kiểm tra nguyên liệu "${ingredient}"`,
              suggestions: []
            }
          };
        }
      })
    );

    const valid = validationResults
      .filter(result => result.isValid)
      .map(result => result.validated);

    const invalid = validationResults
      .filter(result => !result.isValid)
      .map(result => result.original);

    const warnings = validationResults
      .map(result => result.warning)
      .filter(warning => warning !== undefined) as import('../shared/types').ValidationWarning[];

    return { valid, invalid, warnings };

  } catch (error) {
    console.error('Error in ingredient validation:', error);
    // Fallback: assume all ingredients are valid if validation service fails
    return {
      valid: ingredients,
      invalid: [],
      warnings: [{
        message: 'Không thể kiểm tra nguyên liệu, sử dụng danh sách gốc',
        suggestions: []
      }]
    };
  }
}

/**
 * Track suggestion history for analytics and cost optimization
 */
async function trackSuggestionHistory(params: {
  userId: string;
  request: AISuggestionRequest;
  ingredients: string[]; // Changed from validatedIngredients to raw ingredients
  mixedRecipes: import('./flexible-mix-algorithm').FlexibleMixResponse;
}): Promise<string> {
  const suggestionId = uuidv4();
  
  try {
    const suggestionRecord = {
      PK: `USER#${params.userId}`,
      SK: `SUGGESTION#${suggestionId}`,
      entity_type: 'ai_suggestion',
      suggestion_id: suggestionId,
      user_id: params.userId,
      recipe_ids: params.mixedRecipes.recipes.map(r => r.recipe_id),
      prompt_text: `Generate ${params.request.recipe_count} recipes using: ${params.ingredients.join(', ')}`,
      ingredients_used: params.ingredients,
      requested_recipe_count: params.request.recipe_count,
      recipes_from_db: params.mixedRecipes.stats.from_database,
      recipes_from_ai: params.mixedRecipes.stats.from_ai,
      invalid_ingredients: [], // No validation, so no invalid ingredients tracked
      was_from_cache: false, // Not implementing caching in MVP
      cost_optimization: params.mixedRecipes.cost_optimization,
      created_at: new Date().toISOString(),
      
      // GSI for analytics
      GSI1PK: 'SUGGESTIONS',
      GSI1SK: new Date().toISOString(),
      GSI2PK: `USER_SUGGESTIONS#${params.userId}`,
      GSI2SK: new Date().toISOString()
    };

    await dynamoClient.send({
      TableName: DYNAMODB_TABLE,
      Item: suggestionRecord
    } as any);

    console.log(`Suggestion history tracked: ${suggestionId}`);
    return suggestionId;

  } catch (error) {
    console.error('Error tracking suggestion history:', error);
    // Don't fail the request if history tracking fails
    return suggestionId;
  }
}

/**
 * Handle AI failure with graceful fallback to database-only results
 */
async function handleAIFailureFallback(event: APIGatewayEvent): Promise<APIResponse> {
  console.log('Executing AI failure fallback...');
  
  try {
    const request = parseAndValidateRequest(event.body);
    const userId = getUserIdFromEvent(event);
    const userContext = await retrieveUserContext(userId);
    const validatedIngredients = await validateIngredients(request.ingredients);

    if (validatedIngredients.valid.length === 0) {
      return createErrorResponse(400, 'No valid ingredients provided for fallback', {
        invalid_ingredients: validatedIngredients.invalid
      });
    }

    // Create a database-only algorithm instance
    const dbOnlyAlgorithm = new FlexibleMixAlgorithm(DYNAMODB_TABLE, AWS_REGION);
    
    // Force database-only by setting recipe_count to a smaller number and handling AI errors
    const fallbackRecipes = await dbOnlyAlgorithm.generateMixedRecipes({
      ingredients: validatedIngredients.valid,
      recipe_count: Math.min(request.recipe_count, 3), // Limit fallback to 3 recipes
      user_context: userContext
    });

    const response: AISuggestionResponse = {
      suggestions: fallbackRecipes.recipes,
      stats: {
        requested: request.recipe_count,
        from_database: fallbackRecipes.stats.from_database,
        from_ai: 0 // No AI recipes in fallback
      },
      warnings: [
        ...validatedIngredients.warnings,
        {
          message: 'AI service temporarily unavailable. Showing database recipes only.',
          suggestions: []
        }
      ]
    };

    return createSuccessResponse(response, {
      'X-Fallback-Mode': 'true',
      'X-DB-Coverage': '100'
    });

  } catch (fallbackError) {
    console.error('Fallback failed:', fallbackError);
    return createErrorResponse(503, 'Service temporarily unavailable');
  }
}

/**
 * Create success response
 */
function createSuccessResponse(data: any, additionalHeaders: { [key: string]: string } = {}): APIResponse {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      ...additionalHeaders
    },
    body: JSON.stringify(data)
  };
}

/**
 * Create error response
 */
function createErrorResponse(statusCode: number, message: string, details?: any): APIResponse {
  const errorBody = {
    error: message,
    ...(details && { details })
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'POST,OPTIONS'
    },
    body: JSON.stringify(errorBody)
  };
}