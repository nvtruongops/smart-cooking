import { FlexibleMixAlgorithm, FlexibleMixRequest } from './flexible-mix-algorithm';
import { BedrockAIClient, UserContext, AIRecipeRequest } from './bedrock-client';
import { Recipe } from '../shared/types';

// Mock AWS SDK
const mockSend = jest.fn();
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockSend
    }))
  },
  QueryCommand: jest.fn((params) => params)
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn()
}));

// Mock BedrockAIClient
jest.mock('./bedrock-client');

describe('AI Suggestion Engine - Comprehensive Unit Tests', () => {
  let algorithm: FlexibleMixAlgorithm;
  let mockAIClient: jest.Mocked<BedrockAIClient>;

  beforeEach(() => {
    algorithm = new FlexibleMixAlgorithm('test-table', 'us-east-1');
    mockAIClient = new BedrockAIClient() as jest.Mocked<BedrockAIClient>;
    (algorithm as any).aiClient = mockAIClient;
    jest.clearAllMocks();
  });

  const mockUserContext: UserContext = {
    age_range: '26-35',
    gender: 'female',
    country: 'Vietnam',
    dietary_restrictions: [],
    allergies: ['tôm'],
    favorite_cuisines: ['Vietnamese'],
    preferred_cooking_methods: ['xào', 'canh']
  };

  const mockAIRecipe: Recipe = {
    recipe_id: 'ai-recipe-1',
    title: 'Canh chua gà AI',
    description: 'Canh chua gà được tạo bởi AI',
    cuisine_type: 'Vietnamese',
    cooking_method: 'canh',
    meal_type: 'soup',
    prep_time_minutes: 10,
    cook_time_minutes: 25,
    servings: 4,
    ingredients: [
      { ingredient_name: 'thịt gà', quantity: '200g' },
      { ingredient_name: 'me', quantity: '1 thìa' }
    ],
    instructions: [
      { step_number: 1, description: 'Nấu canh chua' }
    ],
    is_public: false,
    is_ai_generated: true,
    is_approved: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  describe('Flexible Mix Algorithm with Various Database Coverage Scenarios', () => {
    it('should handle 0% database coverage (all AI recipes)', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà', 'cà chua'],
        recipe_count: 3,
        user_context: mockUserContext
      };

      // Mock empty database responses for all cooking methods
      mockSend.mockResolvedValue({ Items: [] });

      // Mock AI generation for all 3 recipes with different cooking methods
      mockAIClient.generateRecipes = jest.fn()
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'xào', title: 'Gà xào cà chua AI' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh', title: 'Canh gà cà chua AI' }],
          generation_time_ms: 2500,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'hấp', title: 'Gà hấp cà chua AI' }],
          generation_time_ms: 1800,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(3);
      expect(result.stats.from_database).toBe(0);
      expect(result.stats.from_ai).toBe(3);
      expect(result.stats.database_coverage_percentage).toBe(0);
      expect(result.cost_optimization.estimated_ai_cost_saved).toBe(0);
      expect(result.cost_optimization.ai_recipes_generated).toBe(3);
      expect(mockAIClient.generateRecipes).toHaveBeenCalledTimes(3);
    });

    it('should handle 25% database coverage (1 DB + 3 AI recipes)', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà', 'rau'],
        recipe_count: 4,
        user_context: mockUserContext
      };

      // Mock database returning 1 recipe for first cooking method, empty for others
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#db-recipe-1',
            SK: 'METADATA',
            recipe_id: 'db-recipe-1',
            title: 'Gà xào rau từ DB',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thịt gà', quantity: '300g' }]
          }]
        })
        .mockResolvedValue({ Items: [] }); // All subsequent calls return empty

      // Mock AI generation for remaining 3 recipes
      mockAIClient.generateRecipes = jest.fn()
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh', title: 'Canh gà rau AI' }],
          generation_time_ms: 2200,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'hấp', title: 'Gà hấp rau AI' }],
          generation_time_ms: 2100,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'chiên', title: 'Gà chiên rau AI' }],
          generation_time_ms: 2300,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(4);
      expect(result.stats.from_database).toBe(1);
      expect(result.stats.from_ai).toBe(3);
      expect(result.stats.database_coverage_percentage).toBe(25); // 1/4 * 100
      expect(result.cost_optimization.estimated_ai_cost_saved).toBe(0.02); // 1 * $0.02
      expect(result.cost_optimization.database_recipes_used).toBe(1);
      expect(result.cost_optimization.ai_recipes_generated).toBe(3);
    });

    it('should handle 50% database coverage (balanced mix)', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['cá', 'rau'],
        recipe_count: 4,
        user_context: mockUserContext
      };

      // Mock database returning 2 recipes from different cooking methods
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#fish-1',
            SK: 'METADATA',
            recipe_id: 'fish-1',
            title: 'Cá xào rau',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'cá', quantity: '300g' }]
          }]
        })
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#fish-2',
            SK: 'METADATA',
            recipe_id: 'fish-2',
            title: 'Canh cá rau',
            cooking_method: 'canh',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'cá', quantity: '200g' }]
          }]
        })
        .mockResolvedValue({ Items: [] }); // Remaining calls return empty

      // Mock AI generation for remaining 2 recipes
      mockAIClient.generateRecipes = jest.fn()
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'hấp', title: 'Cá hấp rau AI' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'chiên', title: 'Cá chiên rau AI' }],
          generation_time_ms: 2200,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(4);
      expect(result.stats.from_database).toBe(2);
      expect(result.stats.from_ai).toBe(2);
      expect(result.stats.database_coverage_percentage).toBe(50); // 2/4 * 100
      expect(result.cost_optimization.estimated_ai_cost_saved).toBe(0.04); // 2 * $0.02
    });

    it('should handle 75% database coverage (mostly DB recipes)', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt heo', 'rau'],
        recipe_count: 4,
        user_context: mockUserContext
      };

      // Mock database returning 3 recipes from different cooking methods
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#pork-1',
            SK: 'METADATA',
            recipe_id: 'pork-1',
            title: 'Heo xào rau',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thịt heo', quantity: '300g' }]
          }]
        })
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#pork-2',
            SK: 'METADATA',
            recipe_id: 'pork-2',
            title: 'Canh heo rau',
            cooking_method: 'canh',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thịt heo', quantity: '250g' }]
          }]
        })
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#pork-3',
            SK: 'METADATA',
            recipe_id: 'pork-3',
            title: 'Heo hấp rau',
            cooking_method: 'hấp',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thịt heo', quantity: '280g' }]
          }]
        })
        .mockResolvedValue({ Items: [] }); // Remaining calls return empty

      // Mock AI generation for remaining 1 recipe
      mockAIClient.generateRecipes = jest.fn().mockResolvedValueOnce({
        recipes: [{ ...mockAIRecipe, cooking_method: 'chiên', title: 'Heo chiên rau AI' }],
        generation_time_ms: 1800,
        model_used: 'claude-3-haiku'
      });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(4);
      expect(result.stats.from_database).toBe(3);
      expect(result.stats.from_ai).toBe(1);
      expect(result.stats.database_coverage_percentage).toBe(75); // 3/4 * 100
      expect(result.cost_optimization.estimated_ai_cost_saved).toBe(0.06); // 3 * $0.02
      expect(mockAIClient.generateRecipes).toHaveBeenCalledTimes(1);
    });

    it('should handle 100% database coverage (no AI needed)', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['tôm', 'rau'],
        recipe_count: 3,
        user_context: {
          ...mockUserContext,
          allergies: [] // Remove tôm allergy for this test
        }
      };

      // Mock database returning recipes for all requested cooking methods
      // Note: The algorithm queries preferred cooking methods first, then remaining methods
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#shrimp-1',
            SK: 'METADATA',
            recipe_id: 'shrimp-1',
            title: 'Tôm xào rau',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'tôm', quantity: '300g' }]
          }]
        })
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#shrimp-2',
            SK: 'METADATA',
            recipe_id: 'shrimp-2',
            title: 'Canh tôm rau',
            cooking_method: 'canh',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'tôm', quantity: '250g' }]
          }]
        })
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#shrimp-3',
            SK: 'METADATA',
            recipe_id: 'shrimp-3',
            title: 'Tôm hấp rau',
            cooking_method: 'hấp',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'tôm', quantity: '280g' }]
          }]
        })
        .mockResolvedValue({ Items: [] }); // All remaining calls return empty

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(3);
      expect(result.stats.from_database).toBe(3);
      expect(result.stats.from_ai).toBe(0);
      expect(result.stats.database_coverage_percentage).toBe(100); // 3/3 * 100
      expect(result.cost_optimization.estimated_ai_cost_saved).toBe(0.06); // 3 * $0.02
      expect(result.cost_optimization.ai_recipes_generated).toBe(0);
      expect(mockAIClient.generateRecipes).not.toHaveBeenCalled();
    });
  });

  describe('AI Prompt Generation and Response Parsing Accuracy', () => {
    it('should generate accurate AI prompts with user context', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà', 'cà chua'],
        recipe_count: 1,
        user_context: {
          age_range: '26-35',
          gender: 'female',
          country: 'Vietnam',
          dietary_restrictions: ['vegetarian'],
          allergies: ['shellfish', 'nuts'],
          favorite_cuisines: ['Vietnamese', 'Thai'],
          preferred_cooking_methods: ['steam', 'soup']
        }
      };

      mockSend.mockResolvedValue({ Items: [] });

      mockAIClient.generateRecipes = jest.fn().mockResolvedValue({
        recipes: [{ ...mockAIRecipe, title: 'AI Generated Recipe' }],
        generation_time_ms: 2500,
        model_used: 'claude-3-haiku'
      });

      await algorithm.generateMixedRecipes(request);

      // Verify AI client was called with correct parameters
      expect(mockAIClient.generateRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: ['thịt gà', 'cà chua'],
          cooking_method: expect.any(String),
          user_context: expect.objectContaining({
            age_range: '26-35',
            gender: 'female',
            country: 'Vietnam',
            dietary_restrictions: ['vegetarian'],
            allergies: ['shellfish', 'nuts'],
            favorite_cuisines: ['Vietnamese', 'Thai'],
            preferred_cooking_methods: ['steam', 'soup']
          }),
          recipe_count: 1
        })
      );
    });

    it('should parse valid AI responses correctly', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà'],
        recipe_count: 1,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] });

      const validAIResponse = {
        recipes: [{
          title: 'Gà xào sả ớt',
          description: 'Món gà xào thơm ngon với sả và ớt',
          cuisine_type: 'Vietnamese',
          cooking_method: 'xào',
          meal_type: 'main',
          prep_time_minutes: 15,
          cook_time_minutes: 20,
          servings: 2,
          ingredients: [
            { ingredient_name: 'thịt gà', quantity: '300g', unit: 'gram' }
          ],
          instructions: [
            { step_number: 1, description: 'Thái thịt gà thành miếng vừa ăn', duration: '5 phút' }
          ],
          nutritional_info: {
            calories: 350,
            protein: '25g',
            carbs: '15g',
            fat: '20g'
          }
        }]
      };

      mockAIClient.generateRecipes = jest.fn().mockResolvedValue({
        recipes: validAIResponse.recipes.map(recipe => ({
          ...mockAIRecipe,
          ...recipe,
          recipe_id: 'ai-parsed-recipe',
          is_ai_generated: true,
          is_approved: false
        })),
        generation_time_ms: 2500,
        model_used: 'claude-3-haiku',
        prompt_tokens: 500,
        completion_tokens: 800
      });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].title).toBe('Gà xào sả ớt');
      expect(result.recipes[0].description).toBe('Món gà xào thơm ngon với sả và ớt');
      expect(result.recipes[0].cooking_method).toBe('xào');
      expect(result.recipes[0].is_ai_generated).toBe(true);
      expect(result.recipes[0].ingredients).toHaveLength(1);
      expect(result.recipes[0].ingredients[0].ingredient_name).toBe('thịt gà');
      expect(result.recipes[0].instructions).toHaveLength(1);
      expect(result.recipes[0].nutritional_info).toBeDefined();
    });

    it('should handle malformed AI responses with fallback', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['cá'],
        recipe_count: 1,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] });

      // Mock AI client to return malformed response, then fallback
      mockAIClient.generateRecipes = jest.fn().mockResolvedValue({
        recipes: [{
          ...mockAIRecipe,
          title: 'Món cá đơn giản', // Fallback recipe
          cooking_method: 'xào',
          ingredients: [{ ingredient_name: 'cá', quantity: '1', unit: 'portion' }]
        }],
        generation_time_ms: 2000,
        model_used: 'claude-3-haiku'
      });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].is_ai_generated).toBe(true);
      expect(result.recipes[0].ingredients.some(ing => ing.ingredient_name === 'cá')).toBe(true);
    });

    it('should handle AI responses with missing optional fields', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['rau'],
        recipe_count: 1,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] });

      const incompleteAIResponse = {
        recipes: [{
          title: 'Rau xào cơ bản',
          // Missing description, nutritional_info, etc.
          cooking_method: 'xào',
          ingredients: [{ ingredient_name: 'rau' }], // Missing quantity
          instructions: [{ description: 'Xào rau' }] // Missing step_number
        }]
      };

      mockAIClient.generateRecipes = jest.fn().mockResolvedValue({
        recipes: incompleteAIResponse.recipes.map(recipe => ({
          ...mockAIRecipe,
          ...recipe,
          recipe_id: 'incomplete-ai-recipe',
          description: 'Món ăn được tạo bởi AI', // Default value
          prep_time_minutes: 15, // Default value
          ingredients: [{ ingredient_name: 'rau', quantity: '1', unit: '' }], // Default quantity
          instructions: [{ step_number: 1, description: 'Xào rau', duration: '' }] // Default step number
        })),
        generation_time_ms: 1800,
        model_used: 'claude-3-haiku'
      });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].title).toBe('Rau xào cơ bản');
      expect(result.recipes[0].description).toBe('Món ăn được tạo bởi AI');
      expect(result.recipes[0].prep_time_minutes).toBe(15);
      expect(result.recipes[0].ingredients[0].quantity).toBe('1');
      expect(result.recipes[0].instructions[0].step_number).toBe(1);
    });

    it('should ensure category diversity in AI generation', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt bò', 'rau'],
        recipe_count: 4,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] }); // No database recipes

      // Mock AI generation for different cooking methods
      mockAIClient.generateRecipes = jest.fn()
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'xào', title: 'Bò xào rau' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh', title: 'Canh bò rau' }],
          generation_time_ms: 2200,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'hấp', title: 'Bò hấp rau' }],
          generation_time_ms: 1900,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'chiên', title: 'Bò chiên rau' }],
          generation_time_ms: 2100,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(4);
      
      // Check for cooking method diversity
      const cookingMethods = result.recipes.map(r => r.cooking_method);
      const uniqueMethods = new Set(cookingMethods);
      expect(uniqueMethods.size).toBe(4); // All different methods
      expect(uniqueMethods.has('xào')).toBe(true);
      expect(uniqueMethods.has('canh')).toBe(true);
      expect(uniqueMethods.has('hấp')).toBe(true);
      expect(uniqueMethods.has('chiên')).toBe(true);
    });
  });

  describe('Error Handling and Fallback Mechanisms for AI Failures', () => {
    it('should handle database connection errors gracefully', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà'],
        recipe_count: 2,
        user_context: mockUserContext
      };

      // Mock database connection error
      mockSend.mockRejectedValue(new Error('DynamoDB connection failed'));

      // Mock AI generation as fallback
      mockAIClient.generateRecipes = jest.fn()
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'xào', title: 'Gà xào fallback' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh', title: 'Canh gà fallback' }],
          generation_time_ms: 2200,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2);
      expect(result.stats.from_database).toBe(0);
      expect(result.stats.from_ai).toBe(2);
      expect(result.stats.database_coverage_percentage).toBe(0);
      expect(mockAIClient.generateRecipes).toHaveBeenCalledTimes(2);
    });

    it('should handle partial AI generation failures', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['cá'],
        recipe_count: 3,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] });

      // Mock AI generation with some failures
      mockAIClient.generateRecipes = jest.fn()
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'xào', title: 'Cá xào thành công' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockRejectedValueOnce(new Error('AI service overloaded'))
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'hấp', title: 'Cá hấp thành công' }],
          generation_time_ms: 2500,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2); // Only successful AI generations
      expect(result.stats.from_database).toBe(0);
      expect(result.stats.from_ai).toBe(2);
      expect(result.stats.database_coverage_percentage).toBe(0); // 0/3 from DB, 2/3 total
      expect(mockAIClient.generateRecipes).toHaveBeenCalledTimes(3);
    });

    it('should handle complete AI generation failures with graceful degradation', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['cá'],
        recipe_count: 2,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] });

      // Mock complete AI failure
      mockAIClient.generateRecipes = jest.fn().mockRejectedValue(new Error('AI service unavailable'));

      const result = await algorithm.generateMixedRecipes(request);

      // Should return empty results when both DB and AI fail
      expect(result.recipes).toHaveLength(0);
      expect(result.stats.from_database).toBe(0);
      expect(result.stats.from_ai).toBe(0);
      expect(result.stats.database_coverage_percentage).toBe(0);
    });

    it('should handle AI timeout errors', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt heo'],
        recipe_count: 2,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] });

      // Mock AI timeout
      mockAIClient.generateRecipes = jest.fn()
        .mockRejectedValueOnce(new Error('AI generation timeout'))
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh', title: 'Canh heo sau timeout' }],
          generation_time_ms: 5000, // Longer due to retry
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(1); // Only 1 successful after timeout
      expect(result.stats.from_ai).toBe(1);
      expect(mockAIClient.generateRecipes).toHaveBeenCalledTimes(2);
    });

    it('should handle AI rate limiting errors', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['tôm'],
        recipe_count: 2,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] });

      // Mock AI rate limiting
      mockAIClient.generateRecipes = jest.fn()
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(0);
      expect(result.stats.from_ai).toBe(0);
      expect(mockAIClient.generateRecipes).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed database and AI failures', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['rau cải'],
        recipe_count: 3,
        user_context: mockUserContext
      };

      // Mock database returning 1 recipe, then failing
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#veggie-1',
            SK: 'METADATA',
            recipe_id: 'veggie-1',
            title: 'Rau cải xào từ DB',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'rau cải', quantity: '200g' }]
          }]
        })
        .mockRejectedValue(new Error('Database timeout'));

      // Mock AI with partial success
      mockAIClient.generateRecipes = jest.fn()
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh', title: 'Canh rau cải AI' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockRejectedValueOnce(new Error('AI service error'));

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2); // 1 from DB + 1 from AI
      expect(result.stats.from_database).toBe(1);
      expect(result.stats.from_ai).toBe(1);
      expect(result.stats.database_coverage_percentage).toBe(33); // 1/3 * 100
    });

    it('should handle network connectivity issues', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà'],
        recipe_count: 1,
        user_context: mockUserContext
      };

      // Mock network error for database
      mockSend.mockRejectedValue(new Error('Network timeout'));

      // Mock network error for AI
      mockAIClient.generateRecipes = jest.fn().mockRejectedValue(new Error('Network unreachable'));

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(0);
      expect(result.stats.from_database).toBe(0);
      expect(result.stats.from_ai).toBe(0);
      expect(result.stats.database_coverage_percentage).toBe(0);
    });

    it('should maintain cost optimization metrics during failures', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt bò'],
        recipe_count: 4,
        user_context: mockUserContext
      };

      // Mock database returning 2 recipes
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#beef-1',
            SK: 'METADATA',
            recipe_id: 'beef-1',
            title: 'Bò xào',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thịt bò', quantity: '300g' }]
          }]
        })
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#beef-2',
            SK: 'METADATA',
            recipe_id: 'beef-2',
            title: 'Canh bò',
            cooking_method: 'canh',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thịt bò', quantity: '250g' }]
          }]
        })
        .mockResolvedValue({ Items: [] });

      // Mock AI with 1 success, 1 failure
      mockAIClient.generateRecipes = jest.fn()
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'hấp', title: 'Bò hấp AI' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockRejectedValueOnce(new Error('AI generation failed'));

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(3); // 2 DB + 1 AI
      expect(result.stats.from_database).toBe(2);
      expect(result.stats.from_ai).toBe(1);
      expect(result.stats.database_coverage_percentage).toBe(50); // 2/4 * 100
      expect(result.cost_optimization.estimated_ai_cost_saved).toBe(0.04); // 2 * $0.02
      expect(result.cost_optimization.database_recipes_used).toBe(2);
      expect(result.cost_optimization.ai_recipes_generated).toBe(1);
    });
  });
});