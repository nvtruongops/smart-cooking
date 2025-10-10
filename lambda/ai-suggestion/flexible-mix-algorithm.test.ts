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
    allergies: ['tÃ´m'],
    favorite_cuisines: ['Vietnamese'],
    preferred_cooking_methods: ['xÃ o', 'canh']
  };

  const mockDatabaseRecipe: Recipe = {
    recipe_id: 'db-recipe-1',
    title: 'GÃ  xÃ o sáº£ á»›t',
    description: 'MÃ³n gÃ  xÃ o thÆ¡m ngon',
    cuisine_type: 'Vietnamese',
    cooking_method: 'xÃ o',
    meal_type: 'main',
    prep_time_minutes: 15,
    cook_time_minutes: 20,
    servings: 2,
    ingredients: [
      { ingredient_name: 'thá»‹t gÃ ', quantity: '300g' },
      { ingredient_name: 'sáº£', quantity: '2 cÃ¢y' }
    ],
    instructions: [
      { step_number: 1, description: 'ThÃ¡i gÃ ' }
    ],
    is_public: true,
    is_ai_generated: false,
    is_approved: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  const mockAIRecipe: Recipe = {
    recipe_id: 'ai-recipe-1',
    title: 'Canh chua gÃ ',
    description: 'Canh chua gÃ  chua ngá»t',
    cuisine_type: 'Vietnamese',
    cooking_method: 'canh',
    meal_type: 'soup',
    prep_time_minutes: 10,
    cook_time_minutes: 25,
    servings: 4,
    ingredients: [
      { ingredient_name: 'thá»‹t gÃ ', quantity: '200g' },
      { ingredient_name: 'me', quantity: '1 thÃ¬a' }
    ],
    instructions: [
      { step_number: 1, description: 'Náº¥u canh' }
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
        ingredients: ['thá»‹t gÃ ', 'sáº£'],
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
              title: 'GÃ  xÃ o sáº£ á»›t',
              description: 'MÃ³n gÃ  xÃ o thÆ¡m ngon',
              cuisine_type: 'Vietnamese',
              cooking_method: 'xÃ o',
              meal_type: 'main',
              prep_time_minutes: 15,
              cook_time_minutes: 20,
              servings: 2,
              is_approved: true,
              is_public: true,
              is_ai_generated: false,
              ingredients: [
                { ingredient_name: 'thá»‹t gÃ ', quantity: '300g' },
                { ingredient_name: 'sáº£', quantity: '2 cÃ¢y' }
              ],
              instructions: [{ step_number: 1, description: 'ThÃ¡i gÃ ' }],
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z'
            }
          ]
        })
        .mockResolvedValueOnce({
          Items: [
            {
              PK: 'RECIPE#db-recipe-2',
              SK: 'METADATA',
              recipe_id: 'db-recipe-2',
              title: 'Canh gÃ  sáº£',
              description: 'Canh gÃ  thÆ¡m ngon',
              cuisine_type: 'Vietnamese',
              cooking_method: 'canh',
              meal_type: 'soup',
              prep_time_minutes: 10,
              cook_time_minutes: 25,
              servings: 4,
              is_approved: true,
              is_public: true,
              is_ai_generated: false,
              ingredients: [
                { ingredient_name: 'thá»‹t gÃ ', quantity: '200g' },
                { ingredient_name: 'sáº£', quantity: '1 cÃ¢y' }
              ],
              instructions: [{ step_number: 1, description: 'Náº¥u canh' }],
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z'
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
        ingredients: ['thá»‹t gÃ ', 'cÃ  chua'],
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
              title: 'GÃ  xÃ o cÃ  chua',
              description: 'MÃ³n gÃ  xÃ o cÃ  chua ngon',
              cuisine_type: 'Vietnamese',
              cooking_method: 'xÃ o',
              meal_type: 'main',
              prep_time_minutes: 15,
              cook_time_minutes: 20,
              servings: 2,
              is_approved: true,
              is_public: true,
              is_ai_generated: false,
              ingredients: [{ ingredient_name: 'thá»‹t gÃ ', quantity: '300g' }, { ingredient_name: 'cÃ  chua', quantity: '2 quáº£' }],
              instructions: [{ step_number: 1, description: 'XÃ o gÃ  cÃ  chua' }],
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z'
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
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-2', cooking_method: 'háº¥p' }],
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
        preferred_cooking_methods: ['háº¥p', 'nÆ°á»›ng']
      };

      const request: FlexibleMixRequest = {
        ingredients: ['cÃ¡', 'rau'],
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
              title: 'CÃ¡ háº¥p',
              description: 'CÃ¡ háº¥p ngon',
              cuisine_type: 'Vietnamese',
              cooking_method: 'háº¥p',
              meal_type: 'main',
              prep_time_minutes: 10,
              cook_time_minutes: 15,
              servings: 2,
              is_approved: true,
              is_public: true,
              is_ai_generated: false,
              ingredients: [{ ingredient_name: 'cÃ¡', quantity: '1 con' }],
              instructions: [{ step_number: 1, description: 'Háº¥p cÃ¡' }],
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z'
            }
          ]
        })
        .mockResolvedValue({ Items: [] }); // All subsequent calls return empty

      mockAIClient.generateRecipes.mockResolvedValue({
        recipes: [{ ...mockAIRecipe, cooking_method: 'nÆ°á»›ng', title: 'CÃ¡ nÆ°á»›ng' }],
        generation_time_ms: 2500,
        model_used: 'claude-3-haiku'
      });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2);
      expect(result.recipes[0].cooking_method).toBe('háº¥p'); // From database
      expect(result.recipes[1].cooking_method).toBe('nÆ°á»›ng'); // From AI
    });

    it('should apply dietary restrictions and allergy filters', async () => {
      const vegetarianUserContext: UserContext = {
        ...mockUserContext,
        dietary_restrictions: ['vegetarian'],
        allergies: ['tÃ´m', 'cua']
      };

      const request: FlexibleMixRequest = {
        ingredients: ['Ä‘áº­u hÅ©', 'rau cáº£i'],
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
            title: 'Äáº­u hÅ© xÃ o rau',
            description: 'MÃ³n Ä‘áº­u hÅ© xÃ o rau',
            cuisine_type: 'Vietnamese',
            cooking_method: 'xÃ o',
            meal_type: 'main',
            prep_time_minutes: 10,
            cook_time_minutes: 15,
            servings: 2,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [
              { ingredient_name: 'Ä‘áº­u hÅ©', quantity: '200g' },
              { ingredient_name: 'rau cáº£i', quantity: '100g' }
            ],
            instructions: [{ step_number: 1, description: 'XÃ o Ä‘áº­u hÅ©' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
          },
          {
            PK: 'RECIPE#meat-recipe',
            SK: 'METADATA',
            recipe_id: 'meat-recipe',
            title: 'Thá»‹t xÃ o rau',
            description: 'MÃ³n thá»‹t xÃ o rau',
            cuisine_type: 'Vietnamese',
            cooking_method: 'xÃ o',
            meal_type: 'main',
            prep_time_minutes: 15,
            cook_time_minutes: 20,
            servings: 2,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [
              { ingredient_name: 'thá»‹t heo', quantity: '200g' }, // Should be filtered out
              { ingredient_name: 'rau cáº£i', quantity: '100g' }
            ],
            instructions: [{ step_number: 1, description: 'XÃ o thá»‹t' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
          }
        ]
      });

      mockAIClient.generateRecipes.mockResolvedValue({
        recipes: [{ 
          ...mockAIRecipe, 
          title: 'Canh Ä‘áº­u hÅ© rau cáº£i',
          cooking_method: 'canh',
          ingredients: [
            { ingredient_name: 'Ä‘áº­u hÅ©', quantity: '150g' },
            { ingredient_name: 'rau cáº£i', quantity: '100g' }
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
          ['thá»‹t', 'gÃ ', 'heo', 'bÃ²', 'cÃ¡', 'tÃ´m', 'cua'].some(meat =>
            ing.ingredient_name.toLowerCase().includes(meat)
          )
        );
        expect(hasMeat).toBe(false);
      });
    });

    it('should handle database query errors gracefully', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thá»‹t gÃ '],
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
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-2', cooking_method: 'háº¥p' }],
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
        ingredients: ['thá»‹t gÃ '],
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
            title: 'GÃ  xÃ o',
            cooking_method: 'xÃ o',
            is_approved: true,
            is_public: true,
            ingredients: [{ ingredient_name: 'thá»‹t gÃ ', quantity: '300g' }]
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
        ingredients: ['thá»‹t gÃ '],
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
            title: 'GÃ  xÃ o sáº£ á»›t',
            description: 'MÃ³n gÃ  xÃ o sáº£ á»›t',
            cuisine_type: 'Vietnamese',
            cooking_method: 'xÃ o',
            meal_type: 'main',
            prep_time_minutes: 15,
            cook_time_minutes: 20,
            servings: 2,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [{ ingredient_name: 'thá»‹t gÃ ', quantity: '300g' }],
            instructions: [{ step_number: 1, description: 'XÃ o gÃ ' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
          },
          {
            PK: 'RECIPE#recipe-2',
            SK: 'METADATA',
            recipe_id: 'recipe-2',
            title: 'GÃ  xÃ o sáº£ á»›t', // Exact duplicate title
            description: 'MÃ³n gÃ  xÃ o sáº£ á»›t khÃ¡c',
            cuisine_type: 'Vietnamese',
            cooking_method: 'xÃ o',
            meal_type: 'main',
            prep_time_minutes: 15,
            cook_time_minutes: 20,
            servings: 2,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [{ ingredient_name: 'thá»‹t gÃ ', quantity: '250g' }],
            instructions: [{ step_number: 1, description: 'XÃ o gÃ ' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
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
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-2', cooking_method: 'háº¥p' }],
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
        ingredients: ['thá»‹t gÃ ', 'rau'],
        recipe_count: 4,
        user_context: mockUserContext
      };

      // Mock database with limited diversity (only xÃ o recipes)
      mockSend.mockResolvedValue({
        Items: [
          {
            PK: 'RECIPE#recipe-1',
            SK: 'METADATA',
            recipe_id: 'recipe-1',
            title: 'GÃ  xÃ o rau',
            description: 'MÃ³n gÃ  xÃ o rau',
            cuisine_type: 'Vietnamese',
            cooking_method: 'xÃ o',
            meal_type: 'main',
            prep_time_minutes: 15,
            cook_time_minutes: 20,
            servings: 2,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [{ ingredient_name: 'thá»‹t gÃ ', quantity: '300g' }],
            instructions: [{ step_number: 1, description: 'XÃ o gÃ ' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
          }
        ]
      });

      // Mock AI to generate diverse cooking methods
      mockAIClient.generateRecipes
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'canh', title: 'Canh gÃ  rau' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'háº¥p', title: 'GÃ  háº¥p rau' }],
          generation_time_ms: 2500,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, cooking_method: 'chiÃªn', title: 'GÃ  chiÃªn rau' }],
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
        ingredients: ['thá»‹t gÃ '],
        recipe_count: 5,
        user_context: mockUserContext
      };

      // Mock 3 database recipes from different cooking methods
      // First preferred method (xÃ o) returns 1 recipe
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#db-recipe-0',
            SK: 'METADATA',
            recipe_id: 'db-recipe-0',
            title: 'GÃ  xÃ o ngon',
            description: 'MÃ³n gÃ  xÃ o ngon',
            cuisine_type: 'Vietnamese',
            cooking_method: 'xÃ o',
            meal_type: 'main',
            prep_time_minutes: 15,
            cook_time_minutes: 20,
            servings: 2,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [
              { ingredient_name: 'thá»‹t gÃ ', quantity: '300g' },
              { ingredient_name: 'hÃ nh', quantity: '50g' }
            ],
            instructions: [{ step_number: 1, description: 'XÃ o gÃ ' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
          }]
        })
        // Second preferred method (canh) returns 1 recipe
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#db-recipe-1',
            SK: 'METADATA',
            recipe_id: 'db-recipe-1',
            title: 'Canh gÃ  ngon',
            description: 'Canh gÃ  ngon',
            cuisine_type: 'Vietnamese',
            cooking_method: 'canh',
            meal_type: 'soup',
            prep_time_minutes: 10,
            cook_time_minutes: 25,
            servings: 4,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [
              { ingredient_name: 'thá»‹t gÃ ', quantity: '200g' },
              { ingredient_name: 'rau', quantity: '100g' }
            ],
            instructions: [{ step_number: 1, description: 'Náº¥u canh' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
          }]
        })
        // All remaining queries return empty
        .mockResolvedValue({ Items: [] });

      // Need AI for remaining recipes (3 more to reach 5 total, but we only got 2 from DB)
      mockAIClient.generateRecipes
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-1', cooking_method: 'háº¥p' }],
          generation_time_ms: 1500,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-2', cooking_method: 'chiÃªn' }],
          generation_time_ms: 1500,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, recipe_id: 'ai-recipe-3', cooking_method: 'nÆ°á»›ng' }],
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
        ingredients: ['cÃ¡'],
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
            title: 'CÃ¡ xÃ o',
            description: 'MÃ³n cÃ¡ xÃ o',
            cuisine_type: 'Vietnamese',
            cooking_method: 'xÃ o',
            meal_type: 'main',
            prep_time_minutes: 15,
            cook_time_minutes: 20,
            servings: 2,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [{ ingredient_name: 'cÃ¡', quantity: '300g' }],
            instructions: [{ step_number: 1, description: 'XÃ o cÃ¡' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
          }]
        })
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#fish-2',
            SK: 'METADATA',
            recipe_id: 'fish-2',
            title: 'Canh cÃ¡',
            description: 'Canh cÃ¡ ngon',
            cuisine_type: 'Vietnamese',
            cooking_method: 'canh',
            meal_type: 'soup',
            prep_time_minutes: 10,
            cook_time_minutes: 25,
            servings: 4,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [{ ingredient_name: 'cÃ¡', quantity: '200g' }],
            instructions: [{ step_number: 1, description: 'Náº¥u canh cÃ¡' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
          }]
        })
        .mockResolvedValueOnce({
          Items: [{
            PK: 'RECIPE#fish-3',
            SK: 'METADATA',
            recipe_id: 'fish-3',
            title: 'CÃ¡ háº¥p',
            description: 'CÃ¡ háº¥p tÆ°Æ¡i',
            cuisine_type: 'Vietnamese',
            cooking_method: 'háº¥p',
            meal_type: 'main',
            prep_time_minutes: 10,
            cook_time_minutes: 15,
            servings: 2,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [{ ingredient_name: 'cÃ¡', quantity: '250g' }],
            instructions: [{ step_number: 1, description: 'Háº¥p cÃ¡' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
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
          recipes: [{ ...mockAIRecipe, title: 'MÃ³n Äƒn cÆ¡ báº£n' }],
          generation_time_ms: 2000,
          model_used: 'claude-3-haiku'
        })
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, title: 'MÃ³n Äƒn Ä‘Æ¡n giáº£n' }],
          generation_time_ms: 1800,
          model_used: 'claude-3-haiku'
        });

      const result = await algorithm.generateMixedRecipes(request);

      expect(result.recipes).toHaveLength(2);
      expect(result.stats.from_ai).toBe(2);
    });

    it('should handle very large recipe requests', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['thá»‹t gÃ '],
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
        ingredients: ['thá»‹t heo'],
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
          recipes: [{ ...mockAIRecipe, cooking_method: 'xÃ o' }],
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
            title: 'Rau xÃ o tá»‘t',
            description: 'MÃ³n rau xÃ o ngon',
            cuisine_type: 'Vietnamese',
            cooking_method: 'xÃ o',
            meal_type: 'main',
            prep_time_minutes: 10,
            cook_time_minutes: 15,
            servings: 2,
            is_approved: true,
            is_public: true,
            is_ai_generated: false,
            ingredients: [{ ingredient_name: 'rau', quantity: '200g' }],
            instructions: [{ step_number: 1, description: 'XÃ o rau' }],
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z'
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
      expect(result.recipes.some(r => r.title === 'Rau xÃ o tá»‘t')).toBe(true);
    });

    it('should handle concurrent AI generation failures', async () => {
      const request: FlexibleMixRequest = {
        ingredients: ['tÃ´m'],
        recipe_count: 3,
        user_context: mockUserContext
      };

      mockSend.mockResolvedValue({ Items: [] });

      // Mock multiple AI failures
      mockAIClient.generateRecipes
        .mockRejectedValueOnce(new Error('AI service overloaded'))
        .mockRejectedValueOnce(new Error('AI model unavailable'))
        .mockResolvedValueOnce({
          recipes: [{ ...mockAIRecipe, title: 'TÃ´m náº¥u cuá»‘i cÃ¹ng' }],
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
        ingredients: ['thá»‹t gÃ ', 'cÃ  chua'],
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
            title: 'GÃ  xÃ o cÃ  chua hoÃ n háº£o',
            cooking_method: 'xÃ o',
            is_approved: true,
            is_public: true,
            ingredients: [
              { ingredient_name: 'thá»‹t gÃ ', quantity: '300g' },
              { ingredient_name: 'cÃ  chua', quantity: '2 quáº£' }
            ]
          },
          {
            PK: 'RECIPE#poor-match',
            SK: 'METADATA',
            recipe_id: 'poor-match',
            title: 'MÃ³n Äƒn khÃ´ng khá»›p',
            cooking_method: 'xÃ o',
            is_approved: true,
            is_public: true,
            ingredients: [
              { ingredient_name: 'thá»‹t bÃ²', quantity: '300g' }, // Different ingredient
              { ingredient_name: 'hÃ nh tÃ¢y', quantity: '1 cá»§' }
            ]
          }
        ]
      });

      const result = await algorithm.generateMixedRecipes(request);

      // Should prefer recipes with better ingredient matches
      expect(result.recipes.length).toBeGreaterThan(0);
      expect(result.recipes.some(r => r.title.includes('hoÃ n háº£o'))).toBe(true);
    });
  });
});
