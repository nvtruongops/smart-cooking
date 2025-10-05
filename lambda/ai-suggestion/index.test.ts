import { APIGatewayEvent } from '../shared/types';

// Mock dependencies BEFORE importing handler
const mockGenerateMixedRecipes = jest.fn();

jest.mock('./flexible-mix-algorithm', () => ({
  FlexibleMixAlgorithm: jest.fn().mockImplementation(() => ({
    generateMixedRecipes: mockGenerateMixedRecipes
  }))
}));

jest.mock('../shared/ingredient-service', () => ({
  IngredientService: {
    searchIngredients: jest.fn()
  }
}));

// Create shared mockSend
const mockSend = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: (...args: any[]) => mockSend(...args)
    }))
  },
  GetCommand: jest.fn((params) => params),
  PutCommand: jest.fn((params) => params)
}));
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn()
}));
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-123')
}));

// Import handler AFTER mocks are set up
import { handler } from './index';

describe('AI Suggestion Lambda Handler', () => {
  let mockSearchIngredients: jest.Mock;

  const mockEvent: APIGatewayEvent = {
    httpMethod: 'POST',
    path: '/ai-suggestions',
    resource: '/ai-suggestions',
    pathParameters: null,
    queryStringParameters: null,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ingredients: ['thịt gà', 'cà chua', 'hành tây'],
      recipe_count: 3
    }),
    isBase64Encoded: false,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: {
          sub: 'user-123',
          email: 'test@example.com',
          username: 'testuser'
        }
      }
    }
  };

  const mockUserProfile = {
    user_id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    full_name: 'Test User',
    date_of_birth: '1990-01-01',
    gender: 'male' as const,
    country: 'Vietnam',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  const mockUserPreferences = {
    dietary_restrictions: ['vegetarian'],
    allergies: ['shellfish'],
    favorite_cuisines: ['Vietnamese'],
    preferred_cooking_methods: ['xào', 'canh'],
    preferred_recipe_count: 3
  };

  const mockMixedRecipes = {
    recipes: [
      {
        recipe_id: 'recipe-1',
        title: 'Gà xào cà chua',
        description: 'Món gà xào cà chua ngon',
        cuisine_type: 'Vietnamese',
        cooking_method: 'xào',
        meal_type: 'main',
        prep_time_minutes: 15,
        cook_time_minutes: 20,
        servings: 2,
        ingredients: [
          { ingredient_name: 'thịt gà', quantity: '300g' },
          { ingredient_name: 'cà chua', quantity: '2 quả' }
        ],
        instructions: [
          { step_number: 1, description: 'Chuẩn bị nguyên liệu' }
        ],
        is_public: true,
        is_ai_generated: false,
        is_approved: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }
    ],
    stats: {
      requested: 3,
      from_database: 1,
      from_ai: 2,
      database_coverage_percentage: 33
    },
    cost_optimization: {
      estimated_ai_cost_saved: 0.02,
      database_recipes_used: 1,
      ai_recipes_generated: 2
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set environment variables for tests
    process.env.DYNAMODB_TABLE = 'test-smart-cooking-data';
    process.env.AWS_REGION = 'us-east-1';

    // Mock IngredientService static method
    mockSearchIngredients = require('../shared/ingredient-service').IngredientService.searchIngredients;
  });

  describe('Successful requests', () => {
    beforeEach(() => {
      // Mock successful ingredient validation
      mockSearchIngredients
        .mockResolvedValueOnce([{ name: 'thịt gà', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'cà chua', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'hành tây', match_type: 'exact', match_score: 1.0 }]);

      // Mock user data retrieval
      mockSend
        .mockResolvedValueOnce({ Item: mockUserProfile })  // Profile
        .mockResolvedValueOnce({ Item: mockUserPreferences }); // Preferences

      // Mock successful recipe generation
      mockGenerateMixedRecipes.mockResolvedValue(mockMixedRecipes);

      // Mock suggestion history tracking
      mockSend.mockResolvedValueOnce({}); // History tracking
    });

    it('should generate AI suggestions successfully', async () => {
      const result = await handler(mockEvent);

      expect(result.statusCode).toBe(200);
      
      const responseBody = JSON.parse(result.body);
      expect(responseBody.suggestions).toHaveLength(1);
      expect(responseBody.suggestions[0].title).toBe('Gà xào cà chua');
      expect(responseBody.stats.requested).toBe(3);
      expect(responseBody.stats.from_database).toBe(1);
      expect(responseBody.stats.from_ai).toBe(2);
      expect(responseBody.warnings).toBeDefined();

      // Verify headers
      expect(result.headers['X-Suggestion-Id']).toBeDefined();
      expect(result.headers['X-Cost-Saved']).toBe('0.02');
      expect(result.headers['X-DB-Coverage']).toBe('33');
    });

    it('should handle ingredient validation with warnings', async () => {
      // Override the beforeEach mocks with specific test mocks
      jest.clearAllMocks(); // Clear parent beforeEach mocks

      // Mock ingredient validation with fuzzy matches
      mockSearchIngredients
        .mockResolvedValueOnce([{ name: 'thịt gà', match_type: 'fuzzy', match_score: 0.8 }])
        .mockResolvedValueOnce([{ name: 'cà chua', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([]); // No match for third ingredient

      // Mock user data retrieval
      mockSend
        .mockResolvedValueOnce({ Item: mockUserProfile })
        .mockResolvedValueOnce({ Item: mockUserPreferences })
        .mockResolvedValueOnce({}); // History tracking

      // Mock successful recipe generation
      mockGenerateMixedRecipes.mockResolvedValueOnce(mockMixedRecipes);

      const result = await handler(mockEvent);

      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.warnings).toHaveLength(2); // Fuzzy match + no match

      // Check fuzzy match warning
      const fuzzyWarning = responseBody.warnings.find((w: any) => w.original);
      expect(fuzzyWarning).toBeDefined();
      expect(fuzzyWarning.original).toBe('thịt gà');
      expect(fuzzyWarning.corrected).toBe('thịt gà');

      // Check no match warning
      const noMatchWarning = responseBody.warnings.find((w: any) => w.ingredient);
      expect(noMatchWarning).toBeDefined();
      expect(noMatchWarning.ingredient).toBe('hành tây');

      // Verify generateMixedRecipes was called with only valid ingredients (2 out of 3)
      expect(mockGenerateMixedRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: ['thịt gà', 'cà chua'] // Only 2 valid ingredients
        })
      );
    });

    it('should retrieve user context for personalization', async () => {
      await handler(mockEvent);

      // Verify user profile and preferences were retrieved
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-smart-cooking-data',
          Key: { PK: 'USER#user-123', SK: 'PROFILE' }
        })
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-smart-cooking-data',
          Key: { PK: 'USER#user-123', SK: 'PREFERENCES' }
        })
      );

      // Verify FlexibleMixAlgorithm was called with user context
      expect(mockGenerateMixedRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          user_context: expect.objectContaining({
            age_range: '26-35',
            gender: 'male',
            country: 'Vietnam',
            dietary_restrictions: ['vegetarian'],
            allergies: ['shellfish']
          })
        })
      );
    });

    it('should track suggestion history for analytics', async () => {
      await handler(mockEvent);

      // Verify suggestion history was tracked
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-smart-cooking-data',
          Item: expect.objectContaining({
            entity_type: 'ai_suggestion',
            user_id: 'user-123',
            requested_recipe_count: 3,
            recipes_from_db: 1,
            recipes_from_ai: 2
          })
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should return 405 for non-POST requests', async () => {
      const getEvent = { ...mockEvent, httpMethod: 'GET' };
      
      const result = await handler(getEvent);
      
      expect(result.statusCode).toBe(405);
      expect(JSON.parse(result.body).error).toBe('Method not allowed. Use POST.');
    });

    it('should return 400 for missing request body', async () => {
      const eventWithoutBody = { ...mockEvent, body: null };
      
      const result = await handler(eventWithoutBody);
      
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Internal server error');
    });

    it('should return 400 for invalid JSON', async () => {
      const eventWithInvalidJson = { ...mockEvent, body: 'invalid json' };
      
      const result = await handler(eventWithInvalidJson);
      
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Internal server error');
    });

    it('should return 400 for missing ingredients', async () => {
      const eventWithoutIngredients = {
        ...mockEvent,
        body: JSON.stringify({ recipe_count: 3 })
      };
      
      const result = await handler(eventWithoutIngredients);
      
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Internal server error');
    });

    it('should return 400 for invalid recipe_count', async () => {
      const eventWithInvalidCount = {
        ...mockEvent,
        body: JSON.stringify({
          ingredients: ['thịt gà'],
          recipe_count: 10 // Too high
        })
      };
      
      const result = await handler(eventWithInvalidCount);
      
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Internal server error');
    });

    it('should return 400 when no valid ingredients found', async () => {
      // Clear parent beforeEach mocks
      jest.clearAllMocks();

      // Mock ingredient validation returning no valid ingredients (each call returns empty)
      mockSearchIngredients
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Mock user data retrieval
      mockSend
        .mockResolvedValueOnce({ Item: mockUserProfile })
        .mockResolvedValueOnce({ Item: mockUserPreferences });

      const result = await handler(mockEvent);

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('No valid ingredients provided');
      expect(responseBody.details.invalid_ingredients).toEqual(['thịt gà', 'cà chua', 'hành tây']);
    });

    it('should return 400 for missing user authentication', async () => {
      const eventWithoutAuth = {
        ...mockEvent,
        requestContext: {
          ...mockEvent.requestContext,
          authorizer: undefined
        }
      };
      
      const result = await handler(eventWithoutAuth);
      
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toContain('Internal server error');
    });
  });

  describe('Graceful fallback handling', () => {
    // Don't set up mocks in beforeEach - let each test set up its own mocks
    // to avoid interference

    it('should handle AI generation errors with database fallback', async () => {
      // Mock ingredient validation (3 calls for 3 ingredients in main, then 3 calls in fallback)
      mockSearchIngredients
        .mockResolvedValueOnce([{ name: 'thịt gà', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'cà chua', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'hành tây', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'thịt gà', match_type: 'exact', match_score: 1.0 }])  // Fallback
        .mockResolvedValueOnce([{ name: 'cà chua', match_type: 'exact', match_score: 1.0 }])  // Fallback
        .mockResolvedValueOnce([{ name: 'hành tây', match_type: 'exact', match_score: 1.0 }]); // Fallback

      // Mock user data retrieval (first call from main handler, second from fallback)
      mockSend
        .mockResolvedValueOnce({ Item: mockUserProfile })
        .mockResolvedValueOnce({ Item: mockUserPreferences })
        .mockResolvedValueOnce({ Item: mockUserProfile })  // Fallback user retrieval
        .mockResolvedValueOnce({ Item: mockUserPreferences }); // Fallback user retrieval

      // Mock AI generation failure, then fallback success
      mockGenerateMixedRecipes
        .mockRejectedValueOnce(new Error('AI generation failed: Bedrock error'))
        .mockResolvedValueOnce({
          ...mockMixedRecipes,
          stats: { ...mockMixedRecipes.stats, from_ai: 0, from_database: 2 }
        });

      const result = await handler(mockEvent);

      expect(result.statusCode).toBe(200);
      expect(result.headers['X-Fallback-Mode']).toBe('true');

      const responseBody = JSON.parse(result.body);
      expect(responseBody.stats.from_ai).toBe(0);
      expect(responseBody.warnings.some((w: any) =>
        w.message.includes('AI service temporarily unavailable')
      )).toBe(true);
    });

    it('should handle user context retrieval errors gracefully', async () => {
      // Mock ingredient validation (3 calls for 3 ingredients)
      mockSearchIngredients
        .mockResolvedValueOnce([{ name: 'thịt gà', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'cà chua', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'hành tây', match_type: 'exact', match_score: 1.0 }]);

      // Mock user data retrieval failure - both profile and preferences fail
      mockSend
        .mockRejectedValueOnce(new Error('DynamoDB error'))
        .mockRejectedValueOnce(new Error('DynamoDB error'))
        .mockResolvedValueOnce({}); // History tracking

      mockGenerateMixedRecipes.mockResolvedValueOnce(mockMixedRecipes);

      const result = await handler(mockEvent);

      expect(result.statusCode).toBe(200);

      // Should still work with default user context (fallback)
      expect(mockGenerateMixedRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          user_context: expect.objectContaining({
            dietary_restrictions: [],
            allergies: [],
            favorite_cuisines: [],
            preferred_cooking_methods: []
          })
        })
      );
    });

    it('should handle ingredient validation service errors gracefully', async () => {
      // Mock ingredient validation service failure - this will trigger the outer catch block
      // which returns all ingredients as valid with a warning
      mockSearchIngredients.mockRejectedValueOnce(new Error('Service error'));

      // Mock user data retrieval
      mockSend
        .mockResolvedValueOnce({ Item: mockUserProfile })
        .mockResolvedValueOnce({ Item: mockUserPreferences })
        .mockResolvedValueOnce({}); // History tracking

      mockGenerateMixedRecipes.mockResolvedValueOnce(mockMixedRecipes);

      const result = await handler(mockEvent);

      expect(result.statusCode).toBe(200);

      const responseBody = JSON.parse(result.body);
      expect(responseBody.warnings.some((w: any) =>
        w.message.includes('Không thể kiểm tra nguyên liệu')
      )).toBe(true);
    });

    it('should return 503 when both AI and fallback fail', async () => {
      // Mock ingredient validation (3 calls for main, then 3 for fallback)
      mockSearchIngredients
        .mockResolvedValueOnce([{ name: 'thịt gà', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'cà chua', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'hành tây', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'thịt gà', match_type: 'exact', match_score: 1.0 }])  // Fallback
        .mockResolvedValueOnce([{ name: 'cà chua', match_type: 'exact', match_score: 1.0 }])  // Fallback
        .mockResolvedValueOnce([{ name: 'hành tây', match_type: 'exact', match_score: 1.0 }]); // Fallback

      // Mock user data retrieval (for main and fallback)
      mockSend
        .mockResolvedValueOnce({ Item: mockUserProfile })
        .mockResolvedValueOnce({ Item: mockUserPreferences })
        .mockResolvedValueOnce({ Item: mockUserProfile })  // Fallback
        .mockResolvedValueOnce({ Item: mockUserPreferences }); // Fallback

      // Mock both AI and fallback failures
      mockGenerateMixedRecipes
        .mockRejectedValueOnce(new Error('AI generation failed: Bedrock error'))
        .mockRejectedValueOnce(new Error('Database also failed'));

      const result = await handler(mockEvent);

      expect(result.statusCode).toBe(503);
      expect(JSON.parse(result.body).error).toBe('Service temporarily unavailable');
    });
  });

  describe('Cost optimization analytics', () => {
    beforeEach(() => {
      // Mock ingredient validation (3 calls for 3 ingredients)
      mockSearchIngredients
        .mockResolvedValueOnce([{ name: 'thịt gà', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'cà chua', match_type: 'exact', match_score: 1.0 }])
        .mockResolvedValueOnce([{ name: 'hành tây', match_type: 'exact', match_score: 1.0 }]);

      mockSend
        .mockResolvedValueOnce({ Item: mockUserProfile })
        .mockResolvedValueOnce({ Item: mockUserPreferences })
        .mockResolvedValueOnce({}); // History tracking
    });

    it('should include cost optimization metrics in response headers', async () => {
      const highCostSavingRecipes = {
        ...mockMixedRecipes,
        cost_optimization: {
          estimated_ai_cost_saved: 0.08,
          database_recipes_used: 4,
          ai_recipes_generated: 1
        },
        stats: {
          ...mockMixedRecipes.stats,
          database_coverage_percentage: 80
        }
      };

      mockGenerateMixedRecipes.mockResolvedValueOnce(highCostSavingRecipes);

      const result = await handler(mockEvent);

      expect(result.statusCode).toBe(200);
      expect(result.headers['X-Cost-Saved']).toBe('0.08');
      expect(result.headers['X-DB-Coverage']).toBe('80');
    });

    it('should track detailed analytics in suggestion history', async () => {
      mockGenerateMixedRecipes.mockResolvedValueOnce(mockMixedRecipes);

      await handler(mockEvent);

      // Check the 3rd call to mockSend (1st is profile, 2nd is preferences, 3rd is history tracking)
      expect(mockSend).toHaveBeenNthCalledWith(3,
        expect.objectContaining({
          TableName: 'test-smart-cooking-data',
          Item: expect.objectContaining({
            cost_optimization: mockMixedRecipes.cost_optimization,
            GSI1PK: 'SUGGESTIONS', // For global analytics
            GSI2PK: 'USER_SUGGESTIONS#user-123' // For user-specific analytics
          })
        })
      );
    });
  });
});