import { FlexibleMixAlgorithm, FlexibleMixRequest } from './flexible-mix-algorithm';
import { Recipe, UserPreferences, UserProfile } from '../shared/types';
import { BedrockAIClient, UserContext } from './bedrock-client';

// Mock AWS SDK
const mockSend = jest.fn();
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockSend
    }))
  },
  QueryCommand: jest.fn((params) => params),
  ScanCommand: jest.fn((params) => params)
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn()
}));

// Mock BedrockAIClient
jest.mock('./bedrock-client');

describe('FlexibleMixAlgorithm', () => {
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

  const mockDatabaseRecipe: Recipe = {
    recipe_id: 'db-recipe-1',
    title: 'Gà xào sả ớt',
    description: 'Món gà xào thơm ngon',
    cuisine_type: 'Vietnamese',
    cooking_method: 'xào',
    meal_type: 'main',
    prep_time_minutes: 15,
    cook_time_minutes: 20,
    servings: 2,
    ingredients: [
      { ingredient_name: 'thịt gà', quantity: '300g' },
      { ingredient_name: 'sả', quantity: '2 cây' }
    ],
    instructions: [
      { step_number: 1, description: 'Thái gà' }
    ],
    is_public: true,
    is_ai_generated: false,
    is_approved: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  const mockAIRecipe: Recipe = {
    recipe_id: 'ai-recipe-1',
    title: 'Canh chua gà',
    description: 'Canh chua gà chua ngọt',
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
      { step_number: 1, description: 'Nấu canh' }
    ],
    is_public: false,
    is_ai_generated: true,
    is_approved: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  describe('generateMixedRecipes', () => {
    it('should return database recipes when available', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà', 'sả'],
        recipe_count: 2,
        user_context: mockUserContext
      };

      // Mock database query to return recipes for different cooking methods
      mockSend
        .mockResolvedValueOnce({
          Items: [
            {
              PK: 'RECIPE#db-recipe-1',
              SK: 'METADATA',
              recipe_id: 'db-recipe-1',
              title: 'Gà xào sả ớt',
              cooking_method: 'xào',
              is_approved: true,
              is_public: true,
              ingredients: [{ ingredient_name: 'thịt gà', quantity: '300g' }]
            }
          ]
        })
        .mockResolvedValueOnce({
          Items: [
            {
              PK: 'RECIPE#db-recipe-2',
              SK: 'METADATA',
              recipe_id: 'db-recipe-2',
              title: 'Canh gà sả',
              cooking_method: 'canh',
              is_approved: true,
              is_public: true,
              ingredients: [{ ingredient_name: 'thịt gà', quantity: '200g' }]
            }
          ]
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2);
      expect(result.stats.from_database).toBe(2);
      expect(result.stats.from_ai).toBe(0);
      expect(result.stats.database_coverage_percentage).toBe(100);
      expect(result.cost_optimization.estimated_ai_cost_saved).toBe(0.04); // 2 * $0.02
    });

    it('should generate AI recipes when database coverage is insufficient', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà', 'cà chua'],
        recipe_count: 3,
        user_context: mockUserContext
      };

      // Mock database queries - first call returns 1 recipe, subsequent calls return empty
      mockSend
        .mockResolvedValueOnce({
          Items: [
            {
              PK: 'RECIPE#db-recipe-1',
              SK: 'METADATA',
              recipe_id: 'db-recipe-1',
              title: 'Gà xào cà chua',
              cooking_method: 'xào',
              is_approved: true,
              is_public: true,
              ingredients: [{ ingredient_name: 'thịt gà', quantity: '300g' }]
            }
          ]
        })
        .mockResolvedValue({ Items: [] }); // All subsequent calls return empty

      // Mock AI client to generate recipes for missing categories
      mockAIClient.generateRecipes
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh' }],
          generation_time_ms: 3000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-2', cooking_method: 'hấp' }],
          generation_time_ms: 2500,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(3);
      expect(result.stats.from_database).toBe(1);
      expect(result.stats.from_ai).toBe(2);
      expect(result.stats.database_coverage_percentage).toBe(33); // 1/3 * 100
      expect(result.cost_optimization.estimated_ai_cost_saved).toBe(0.02); // 1 * $0.02
    });

    it('should prioritize user preferred cooking methods', async () => {
      const userContextWithPreferences: UserContext = {
        ...mockUserContext,
        preferred_cooking_methods: ['hấp', 'nướng']
      };

      const request: FlexibleMixRequest = {
        ingredients: ['cá', 'rau'],
        recipe_count: 2,
        user_context: userContextWithPreferences
      };

      // Mock database queries - first preferred method returns recipe, second returns empty
      mockSend
        .mockResolvedValueOnce({
          Items: [
            {
              PK: 'RECIPE#steam-fish',
              SK: 'METADATA',
              recipe_id: 'steam-fish',
              title: 'Cá hấp',
              cooking_method: 'hấp',
              is_approved: true,
              is_public: true,
              ingredients: [{ ingredient_name: 'cá', quantity: '1 con' }]
            }
          ]
        })
        .mockResolvedValue({ Items: [] }); // All subsequent calls return empty

      mockAIClient.generateRecipes.mockResolvedValue({
        recipes: [{ ...mockAIRecipe, cooking_method: 'nướng', title: 'Cá nướng' }],
        generation_time_ms: 2500,
        model_used: 'claude-3-haiku'
      });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2);
      expect(result.recipes[0].cooking_method).toBe('hấp'); // From database
      expect(result.recipes[1].cooking_method).toBe('nướng'); // From AI
    });

    it('should apply dietary restrictions and allergy filters', async () => {
      const vegetarianUserContext: UserContext = {
        ...mockUserContext,
        dietary_restrictions: ['vegetarian'],
        allergies: ['tôm', 'cua']
      };

      const request: FlexibleMixRequest = {
        ingredients: ['đậu hũ', 'rau cải'],
        recipe_count: 2,
        user_context: vegetarianUserContext
      };

      // Mock database with mixed vegetarian and non-vegetarian recipes
      mockSend.mockResolvedValue({
        Items: [
          {
            PK: 'RECIPE#tofu-recipe',
            SK: 'METADATA',
            recipe_id: 'tofu-recipe',
            title: 'Đậu hũ xào rau',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [
              { ingredient_name: 'đậu hũ', quantity: '200g' },
              { ingredient_name: 'rau cải', quantity: '100g' }
            ]
          },
          {
            PK: 'RECIPE#meat-recipe',
            SK: 'METADATA',
            recipe_id: 'meat-recipe',
            title: 'Thịt xào rau',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [
              { ingredient_name: 'thịt heo', quantity: '200g' }, // Should be filtered out
              { ingredient_name: 'rau cải', quantity: '100g' }
            ]
          }
        ]
      });

      mockAIClient.generateRecipes.mockResolvedValue({
        recipes: [{ 
          ...mockAIRecipe, 
          title: 'Canh đậu hũ rau cải',
          cooking_method: 'canh',
          ingredients: [
            { ingredient_name: 'đậu hũ', quantity: '150g' },
            { ingredient_name: 'rau cải', quantity: '100g' }
          ]
        }],
        generation_time_ms: 2000,
        model_used: 'claude-3-haiku'
      });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2);
      // Should only include vegetarian recipes
      result.recipes.forEach(recipe => {
        const hasMeat = recipe.ingredients.some(ing => 
          ['thịt', 'gà', 'heo', 'bò', 'cá', 'tôm', 'cua'].some(meat =>
            ing.ingredient_name.toLowerCase().includes(meat)
          )
        );
        expect(hasMeat).toBe(false);
      });
    });

    it('should handle database query errors gracefully', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà'],
        recipe_count: 2,
        user_context: mockUserContext
      };

      // Mock database error for all queries
      mockSend.mockRejectedValue(new Error('DynamoDB error'));

      // Mock AI client to generate fallback recipes - need to generate for all recipe_count
      mockAIClient.generateRecipes
        .mockResolvedValueOnce({
          recipes: [mockAIRecipe],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-2', cooking_method: 'hấp' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2);
      expect(result.stats.from_database).toBe(0);
      expect(result.stats.from_ai).toBe(2);
      expect(result.stats.database_coverage_percentage).toBe(0);
    });

    it('should handle AI generation errors gracefully', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà'],
        recipe_count: 2,
        user_context: mockUserContext
      };

      // Mock database to return 1 recipe
      mockSend.mockResolvedValue({
        Items: [
          {
            PK: 'RECIPE#db-recipe-1',
            SK: 'METADATA',
            recipe_id: 'db-recipe-1',
            title: 'Gà xào',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thịt gà', quantity: '300g' }]
          }
        ]
      });

      // Mock AI client error
      mockAIClient.generateRecipes.mockRejectedValue(new Error('AI generation failed'));

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(1); // Only database recipe
      expect(result.stats.from_database).toBe(1);
      expect(result.stats.from_ai).toBe(0);
      expect(result.stats.database_coverage_percentage).toBe(50); // 1/2 * 100
    });

    it('should deduplicate similar recipes', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà'],
        recipe_count: 3,
        user_context: mockUserContext
      };

      // Mock database with similar recipes (these should be deduplicated)
      mockSend.mockResolvedValue({
        Items: [
          {
            PK: 'RECIPE#recipe-1',
            SK: 'METADATA',
            recipe_id: 'recipe-1',
            title: 'Gà xào sả ớt',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thịt gà', quantity: '300g' }]
          },
          {
            PK: 'RECIPE#recipe-2',
            SK: 'METADATA',
            recipe_id: 'recipe-2',
            title: 'Gà xào sả ớt', // Exact duplicate title
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thịt gà', quantity: '250g' }]
          }
        ]
      });

      mockAIClient.generateRecipes
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh' }],
          generation_time_ms: 3000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-2', cooking_method: 'hấp' }],
          generation_time_ms: 2500,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(3);
      expect(result.stats.from_database).toBe(1); // One duplicate removed
      expect(result.stats.from_ai).toBe(2);
    });

    it('should ensure category diversity in recipe selection', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà', 'rau'],
        recipe_count: 4,
        user_context: mockUserContext
      };

      // Mock database with limited diversity (only xào recipes)
      mockSend.mockResolvedValue({
        Items: [
          {
            PK: 'RECIPE#recipe-1',
            SK: 'METADATA',
            recipe_id: 'recipe-1',
            title: 'Gà xào rau',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thịt gà', quantity: '300g' }]
          }
        ]
      });

      // Mock AI to generate diverse cooking methods
      mockAIClient.generateRecipes
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh', title: 'Canh gà rau' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'hấp', title: 'Gà hấp rau' }],
          generation_time_ms: 2500,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'chiên', title: 'Gà chiên rau' }],
          generation_time_ms: 2200,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(4);
      expect(result.stats.from_database).toBe(1);
      expect(result.stats.from_ai).toBe(3);
      
      // Check for cooking method diversity
      const cookingMethods = result.recipes.map(r => r.cooking_method);
      const uniqueMethods = new Set(cookingMethods);
      expect(uniqueMethods.size).toBeGreaterThan(1); // Should have diverse methods
    });
  });

  describe('cost optimization calculations', () => {
    it('should calculate cost savings correctly', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà'],
        recipe_count: 5,
        user_context: mockUserContext
      };

      // Mock 3 database recipes from different cooking methods
      // First preferred method (xào) returns 1 recipe
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#db-recipe-0',
            SK: 'METADATA',
            recipe_id: 'db-recipe-0',
            title: 'Gà xào ngon',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [
              { ingredient_name: 'thịt gà', quantity: '300g' },
              { ingredient_name: 'hành', quantity: '50g' }
            ]
          }]
        })
        // Second preferred method (canh) returns 1 recipe
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#db-recipe-1',
            SK: 'METADATA',
            recipe_id: 'db-recipe-1',
            title: 'Canh gà ngon',
            cooking_method: 'canh',
            is_approved: true,
            is_public: true,
            ingredients: [
              { ingredient_name: 'thịt gà', quantity: '200g' },
              { ingredient_name: 'rau', quantity: '100g' }
            ]
          }]
        })
        // All remaining queries return empty
        .mockResolvedValue({ Items: [] });

      // Need AI for remaining recipes (3 more to reach 5 total, but we only got 2 from DB)
      mockAIClient.generateRecipes
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-1', cooking_method: 'hấp' }],
          generation_time_ms: 1500,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-2', cooking_method: 'chiên' }],
          generation_time_ms: 1500,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-3', cooking_method: 'nướng' }],
          generation_time_ms: 1500,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.cost_optimization.database_recipes_used).toBe(2);
      expect(result.cost_optimization.ai_recipes_generated).toBe(3);
      expect(result.cost_optimization.estimated_ai_cost_saved).toBe(0.04); // 2 * $0.02
      expect(result.stats.database_coverage_percentage).toBe(40); // 2/5 * 100
    });

    it('should track cost savings with 100% database coverage', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['cá'],
        recipe_count: 3,
        user_context: mockUserContext
      };

      // Mock database returning recipes for different cooking methods
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#fish-1',
            SK: 'METADATA',
            recipe_id: 'fish-1',
            title: 'Cá xào',
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
            title: 'Canh cá',
            cooking_method: 'canh',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'cá', quantity: '200g' }]
          }]
        })
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#fish-3',
            SK: 'METADATA',
            recipe_id: 'fish-3',
            title: 'Cá hấp',
            cooking_method: 'hấp',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'cá', quantity: '250g' }]
          }]
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.cost_optimization.database_recipes_used).toBe(3);
      expect(result.cost_optimization.ai_recipes_generated).toBe(0);
      expect(result.cost_optimization.estimated_ai_cost_saved).toBe(0.06); // 3 * $0.02
      expect(result.stats.database_coverage_percentage).toBe(100);
      expect(mockAIClient.generateRecipes).not.toHaveBeenCalled();
    });
  });

  describe('advanced error handling and edge cases', () => {
    it('should handle empty ingredient list gracefully', async () => {
      const request: FlexibleMixRequest = {
        ingredients: [],
        recipe_count: 2,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] });

      mockAIClient.generateRecipes
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, title: 'Món ăn cơ bản' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, title: 'Món ăn đơn giản' }],
          generation_time_ms: 1800,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2);
      expect(result.stats.from_ai).toBe(2);
    });

    it('should handle very large recipe requests', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà'],
        recipe_count: 5, // Maximum allowed
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] }); // No database recipes

      // Mock AI generation for all 5 recipes
      const aiMocks = Array.from({ length: 5 }, (_, i) => 
        mockAIClient.generateRecipes.mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, recipe_id: `ai-recipe-${i}`, title: `AI Recipe ${i + 1}` }],
          generation_time_ms: 2000 + i * 100,
          model_used: 'claude-3-haiku'
        })
      );

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(5);
      expect(result.stats.from_ai).toBe(5);
      expect(result.stats.database_coverage_percentage).toBe(0);
      expect(mockAIClient.generateRecipes).toHaveBeenCalledTimes(5);
    });

    it('should handle database timeout errors', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt heo'],
        recipe_count: 2,
        user_context: mockUserContext
      };

      // Mock database timeout
      mockSend.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database timeout')), 100)
        )
      );

      // Mock AI fallback
      mockAIClient.generateRecipes
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'xào' }],
          generation_time_ms: 2500,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh' }],
          generation_time_ms: 2300,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2);
      expect(result.stats.from_database).toBe(0);
      expect(result.stats.from_ai).toBe(2);
    });

    it('should handle inconsistent database data', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['rau'],
        recipe_count: 2,
        user_context: mockUserContext
      };

      // Mock database returning malformed data
      mockSend.mockResolvedValue({
        Items: [
          {
            PK: 'RECIPE#malformed',
            SK: 'METADATA',
            // Missing required fields like title, cooking_method
            is_approved: true,
            is_public: true
          },
          {
            PK: 'RECIPE#good-recipe',
            SK: 'METADATA',
            recipe_id: 'good-recipe',
            title: 'Rau xào tốt',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'rau', quantity: '200g' }]
          }
        ]
      });

      mockAIClient.generateRecipes.mockResolvedValue({
        recipes: [{ ...mockAIRecipe, cooking_method: 'canh', title: 'Canh rau AI' }],
        generation_time_ms: 2000,
        model_used: 'claude-3-haiku'
      });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2);
      // Should handle malformed data gracefully
      expect(result.recipes.some(r => r.title === 'Rau xào tốt')).toBe(true);
    });

    it('should handle concurrent AI generation failures', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['tôm'],
        recipe_count: 3,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] });

      // Mock multiple AI failures
      mockAIClient.generateRecipes
        .mockRejectedValueOnce(new Error('AI service overloaded'))
        .mockRejectedValueOnce(new Error('AI model unavailable'))
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, title: 'Tôm nấu cuối cùng' }],
          generation_time_ms: 4000, // Longer due to retries
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(1); // Only 1 successful AI generation
      expect(result.stats.from_ai).toBe(1);
      expect(result.stats.database_coverage_percentage).toBe(0); // 0/3 from DB, 1/3 total
    });

    it('should maintain recipe quality with ingredient matching', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thịt gà', 'cà chua'],
        recipe_count: 2,
        user_context: mockUserContext
      };

      // Mock database with recipes that have varying ingredient matches
      mockSend.mockResolvedValue({
        Items: [
          {
            PK: 'RECIPE#perfect-match',
            SK: 'METADATA',
            recipe_id: 'perfect-match',
            title: 'Gà xào cà chua hoàn hảo',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [
              { ingredient_name: 'thịt gà', quantity: '300g' },
              { ingredient_name: 'cà chua', quantity: '2 quả' }
            ]
          },
          {
            PK: 'RECIPE#poor-match',
            SK: 'METADATA',
            recipe_id: 'poor-match',
            title: 'Món ăn không khớp',
            cooking_method: 'xào',
            is_approved: true,
            is_public: true,
            ingredients: [
              { ingredient_name: 'thịt bò', quantity: '300g' }, // Different ingredient
              { ingredient_name: 'hành tây', quantity: '1 củ' }
            ]
          }
        ]
      });

      const result = await algorithm.generateMixedRecipes(request);

      // Should prefer recipes with better ingredient matches
      expect(result.recipes.length).toBeGreaterThan(0);
      expect(result.recipes.some(r => r.title.includes('hoàn hảo'))).toBe(true);
    });
  });
});