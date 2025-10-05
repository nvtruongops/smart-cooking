/**
 * Unit tests for Recipe Lambda Handler
 */

import { handler } from './index';
import { RecipeService } from './recipe-service';
import { APIGatewayEvent } from '../shared/types';

// Mock RecipeService
jest.mock('./recipe-service');

describe('Recipe Lambda Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockEvent = (
    method: string,
    path: string,
    queryParams?: any,
    body?: string | null,
    pathParameters?: any
  ): APIGatewayEvent => ({
    httpMethod: method,
    path,
    queryStringParameters: queryParams,
    body: body || null,
    pathParameters,
    requestContext: {
      requestId: 'test-request-123',
      authorizer: {
        claims: {
          sub: 'user-123',
          email: 'test@example.com',
          username: 'testuser'
        }
      }
    },
    headers: {},
    multiValueHeaders: {},
    multiValueQueryStringParameters: {},
    stageVariables: {},
    isBase64Encoded: false,
    resource: ''
  });

  describe('GET /recipes/search', () => {
    it('should search recipes with query parameter', async () => {
      const mockSearchResult = {
        recipes: [
          {
            recipe_id: 'recipe-1',
            title: 'Gà xào cà chua',
            cooking_method: 'stir-fry',
            is_approved: true,
            created_at: '2025-01-20T10:00:00Z'
          }
        ],
        total_count: 1,
        has_more: false,
        filters_applied: {
          query: 'gà'
        }
      };

      (RecipeService.searchRecipes as jest.Mock).mockResolvedValue(mockSearchResult);

      const event = createMockEvent('GET', '/recipes/search', {
        q: 'gà',
        limit: '10'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        success: true,
        data: mockSearchResult
      });

      expect(RecipeService.searchRecipes).toHaveBeenCalledWith({
        q: 'gà',
        cuisine_type: undefined,
        cooking_method: undefined,
        meal_type: undefined,
        min_rating: undefined,
        max_prep_time: undefined,
        max_cook_time: undefined,
        difficulty_level: undefined,
        sort_by: 'created_at',
        sort_order: 'desc',
        limit: 10,
        offset: 0
      });
    });

    it('should search recipes with multiple filters', async () => {
      const mockSearchResult = {
        recipes: [
          {
            recipe_id: 'recipe-1',
            title: 'Gà xào nấm',
            cuisine_type: 'Vietnamese',
            cooking_method: 'stir-fry',
            meal_type: 'lunch',
            average_rating: 4.5,
            is_approved: true,
            created_at: '2025-01-20T10:00:00Z'
          }
        ],
        total_count: 1,
        has_more: false,
        filters_applied: {
          query: 'gà',
          cuisine_type: 'Vietnamese',
          cooking_method: 'stir-fry',
          meal_type: 'lunch',
          min_rating: 4.0
        }
      };

      (RecipeService.searchRecipes as jest.Mock).mockResolvedValue(mockSearchResult);

      const event = createMockEvent('GET', '/recipes/search', {
        q: 'gà',
        cuisine_type: 'Vietnamese',
        cooking_method: 'stir-fry',
        meal_type: 'lunch',
        min_rating: '4.0',
        max_prep_time: '30',
        difficulty_level: 'easy',
        sort_by: 'rating',
        sort_order: 'desc',
        limit: '20',
        offset: '10'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        success: true,
        data: mockSearchResult
      });

      expect(RecipeService.searchRecipes).toHaveBeenCalledWith({
        q: 'gà',
        cuisine_type: 'Vietnamese',
        cooking_method: 'stir-fry',
        meal_type: 'lunch',
        min_rating: 4.0,
        max_prep_time: 30,
        max_cook_time: undefined,
        difficulty_level: 'easy',
        sort_by: 'rating',
        sort_order: 'desc',
        limit: 20,
        offset: 10
      });
    });

    it('should use default values when no parameters provided', async () => {
      const mockSearchResult = {
        recipes: [],
        total_count: 0,
        has_more: false,
        filters_applied: {}
      };

      (RecipeService.searchRecipes as jest.Mock).mockResolvedValue(mockSearchResult);

      const event = createMockEvent('GET', '/recipes/search', undefined);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      expect(RecipeService.searchRecipes).toHaveBeenCalledWith({
        q: undefined,
        cuisine_type: undefined,
        cooking_method: undefined,
        meal_type: undefined,
        min_rating: undefined,
        max_prep_time: undefined,
        max_cook_time: undefined,
        difficulty_level: undefined,
        sort_by: 'created_at',
        sort_order: 'desc',
        limit: 20,
        offset: 0
      });
    });

    it('should handle search service errors', async () => {
      (RecipeService.searchRecipes as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const event = createMockEvent('GET', '/recipes/search', { q: 'test' });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('internal_server_error');
      expect(body.message).toBe('An unexpected error occurred');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('details');
    });
  });

  describe('GET /recipes/{id}', () => {
    it('should get recipe by ID with complete data structure', async () => {
      const mockRecipe = {
        metadata: {
          recipe_id: 'recipe-123',
          title: 'Phở Bò Huế',
          description: 'Spicy beef noodle soup',
          cooking_method: 'boiling',
          cuisine_type: 'Vietnamese',
          is_approved: true,
          approval_status: 'approved',
          average_rating: 4.7,
          rating_count: 15,
          source: 'ai_generated',
          created_at: '2025-01-20T10:00:00Z'
        },
        ingredients: [
          {
            ingredient_id: 'ing-1',
            ingredient_name: 'Beef bones',
            quantity: 1,
            unit: 'kg'
          }
        ],
        instructions: [
          {
            step_number: 1,
            description: 'Boil beef bones for 2 hours'
          }
        ]
      };

      (RecipeService.getRecipeById as jest.Mock).mockResolvedValue(mockRecipe);

      const event = createMockEvent('GET', '/recipes/recipe-123', undefined, null, {
        id: 'recipe-123'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      
      expect(responseBody).toEqual({
        success: true,
        data: { recipe: mockRecipe }
      });

      // Verify complete data structure is returned
      expect(responseBody.data.recipe).toHaveProperty('metadata');
      expect(responseBody.data.recipe).toHaveProperty('ingredients');
      expect(responseBody.data.recipe).toHaveProperty('instructions');
      
      // Verify community stats are included
      expect(responseBody.data.recipe.metadata.average_rating).toBe(4.7);
      expect(responseBody.data.recipe.metadata.rating_count).toBe(15);
      expect(responseBody.data.recipe.metadata.source).toBe('ai_generated');

      expect(RecipeService.getRecipeById).toHaveBeenCalledWith('recipe-123', 'user-123');
    });

    it('should handle recipe not found error', async () => {
      (RecipeService.getRecipeById as jest.Mock).mockRejectedValue(
        new Error('Recipe not found')
      );

      const event = createMockEvent('GET', '/recipes/nonexistent', undefined, null, {
        id: 'nonexistent'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
    });

    it('should validate recipe ID parameter', async () => {
      const event = createMockEvent('GET', '/recipes/', undefined, null, {});

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('not_found');
    });
  });

  describe('GET /recipes', () => {
    it('should list recipes with community stats and approval status', async () => {
      const mockListResult = {
        recipes: [
          {
            recipe_id: 'recipe-1',
            title: 'Popular Recipe',
            is_approved: true,
            approval_status: 'approved',
            average_rating: 4.8,
            rating_count: 20,
            source: 'ai_generated'
          },
          {
            recipe_id: 'recipe-2',
            title: 'User Recipe',
            is_approved: true,
            approval_status: 'approved',
            average_rating: 4.2,
            rating_count: 5,
            source: 'user_created'
          }
        ],
        count: 2
      };

      (RecipeService.listRecipes as jest.Mock).mockResolvedValue(mockListResult);

      const event = createMockEvent('GET', '/recipes', {
        limit: '10',
        filter_by_approved: 'true'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      
      expect(responseBody).toEqual({
        success: true,
        data: mockListResult
      });

      // Verify community stats are included
      expect(responseBody.data.recipes[0]).toMatchObject({
        is_approved: true,
        average_rating: 4.8,
        rating_count: 20,
        source: 'ai_generated'
      });

      expect(RecipeService.listRecipes).toHaveBeenCalledWith('user-123', {
        limit: 10,
        start_key: undefined,
        filter_by_user: false,
        filter_by_approved: true,
        cooking_method: undefined
      });
    });

    it('should list recipes with filters', async () => {
      const mockListResult = {
        recipes: [
          {
            recipe_id: 'recipe-1',
            title: 'Recipe 1',
            is_approved: true
          }
        ],
        count: 1
      };

      (RecipeService.listRecipes as jest.Mock).mockResolvedValue(mockListResult);

      const event = createMockEvent('GET', '/recipes', {
        limit: '10',
        cooking_method: 'stir-fry',
        filter_by_approved: 'true'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({
        success: true,
        data: mockListResult
      });

      expect(RecipeService.listRecipes).toHaveBeenCalledWith('user-123', {
        limit: 10,
        start_key: undefined,
        filter_by_user: false,
        filter_by_approved: true,
        cooking_method: 'stir-fry'
      });
    });

    it('should default filter_by_approved to true', async () => {
      const mockListResult = {
        recipes: [],
        count: 0
      };

      (RecipeService.listRecipes as jest.Mock).mockResolvedValue(mockListResult);

      const event = createMockEvent('GET', '/recipes', {});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      expect(RecipeService.listRecipes).toHaveBeenCalledWith('user-123', {
        limit: undefined,
        start_key: undefined,
        filter_by_user: false,
        filter_by_approved: true, // Should default to true
        cooking_method: undefined
      });
    });
  });

  describe('POST /recipes', () => {
    it('should create a new recipe', async () => {
      const mockCreateResult = {
        recipe_id: 'recipe-123'
      };

      (RecipeService.createRecipe as jest.Mock).mockResolvedValue(mockCreateResult);

      const createRequest = {
        title: 'New Recipe',
        cooking_method: 'stir-fry',
        ingredients: [
          {
            ingredient_id: 'ing-1',
            ingredient_name: 'Chicken',
            quantity: 500,
            unit: 'g'
          }
        ],
        instructions: [
          {
            step_number: 1,
            description: 'Cook chicken'
          }
        ]
      };

      const event = createMockEvent('POST', '/recipes', undefined, JSON.stringify(createRequest));

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toEqual({
        success: true,
        data: {
          recipe_id: 'recipe-123',
          message: 'Recipe created successfully'
        }
      });

      expect(RecipeService.createRecipe).toHaveBeenCalledWith('user-123', createRequest);
    });

    it('should validate required fields', async () => {
      const invalidRequest = {
        title: 'New Recipe'
        // Missing cooking_method, ingredients, instructions
      };

      const event = createMockEvent('POST', '/recipes', undefined, JSON.stringify(invalidRequest));

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('missing_fields');
      expect(body.message).toBe('Title and cooking method are required');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('details');
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const event = createMockEvent('GET', '/unknown/endpoint', undefined);

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('not_found');
      expect(body.message).toBe('Endpoint not found');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('details');
    });
  });
});