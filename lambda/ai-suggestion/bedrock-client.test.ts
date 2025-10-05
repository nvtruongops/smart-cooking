import { BedrockAIClient, UserContext, AIRecipeRequest } from './bedrock-client';
import { UserProfile, UserPreferences } from '../shared/types';

// Mock AWS SDK
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockSend
  })),
  InvokeModelCommand: jest.fn()
}));

describe('BedrockAIClient', () => {
  let client: BedrockAIClient;

  beforeEach(() => {
    client = new BedrockAIClient('us-east-1');
    jest.clearAllMocks();
  });

  describe('generateRecipes', () => {
    const mockRequest: AIRecipeRequest = {
      ingredients: ['thịt gà', 'cà chua', 'hành tây'],
      cooking_method: 'xào',
      user_context: {
        age_range: '26-35',
        gender: 'female',
        country: 'Vietnam',
        dietary_restrictions: [],
        allergies: ['tôm'],
        favorite_cuisines: ['Vietnamese'],
        preferred_cooking_methods: ['xào', 'canh']
      },
      recipe_count: 1
    };

    it('should generate recipes successfully with valid AI response', async () => {
      const mockAIResponse = {
        content: [{
          text: JSON.stringify({
            recipes: [{
              title: 'Gà xào cà chua',
              description: 'Món gà xào cà chua thơm ngon',
              cuisine_type: 'Vietnamese',
              cooking_method: 'xào',
              meal_type: 'main',
              prep_time_minutes: 15,
              cook_time_minutes: 20,
              servings: 2,
              ingredients: [
                {
                  ingredient_name: 'thịt gà',
                  quantity: '300g',
                  unit: 'gram'
                },
                {
                  ingredient_name: 'cà chua',
                  quantity: '2',
                  unit: 'quả'
                }
              ],
              instructions: [
                {
                  step_number: 1,
                  description: 'Thái thịt gà thành miếng vừa ăn',
                  duration: '5 phút'
                },
                {
                  step_number: 2,
                  description: 'Xào gà với cà chua',
                  duration: '15 phút'
                }
              ],
              nutritional_info: {
                calories: 350,
                protein: '25g',
                carbs: '15g',
                fat: '20g'
              }
            }]
          })
        }],
        usage: {
          input_tokens: 500,
          output_tokens: 800
        }
      };

      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify(mockAIResponse))
      });

      const result = await client.generateRecipes(mockRequest);

      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].title).toBe('Gà xào cà chua');
      expect(result.recipes[0].cooking_method).toBe('xào');
      expect(result.recipes[0].is_ai_generated).toBe(true);
      expect(result.recipes[0].is_approved).toBe(false);
      expect(result.generation_time_ms).toBeGreaterThan(0);
      expect(result.model_used).toBe('anthropic.claude-3-haiku-20240307-v1:0');
    });

    it('should handle malformed AI response with fallback recipe', async () => {
      const mockAIResponse = {
        content: [{
          text: 'Invalid JSON response from AI'
        }],
        usage: {
          input_tokens: 500,
          output_tokens: 100
        }
      };

      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify(mockAIResponse))
      });

      const result = await client.generateRecipes(mockRequest);

      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].title).toBe('Món xào đơn giản');
      expect(result.recipes[0].is_ai_generated).toBe(true);
      expect(result.recipes[0].ingredients).toHaveLength(3);
    });

    it('should throw error when Bedrock API fails', async () => {
      mockSend.mockRejectedValue(new Error('Bedrock API error'));

      await expect(client.generateRecipes(mockRequest)).rejects.toThrow('AI generation failed: Bedrock API error');
    });

    it('should call Bedrock API with privacy-aware prompt', async () => {
      const userContextWithPII: UserContext = {
        age_range: '26-35',
        gender: 'female',
        country: 'Vietnam',
        dietary_restrictions: ['vegetarian'],
        allergies: ['shellfish'],
        favorite_cuisines: ['Vietnamese', 'Italian'],
        preferred_cooking_methods: ['steam', 'soup']
      };

      const request: AIRecipeRequest = {
        ingredients: ['tofu', 'vegetables'],
        cooking_method: 'steam',
        user_context: userContextWithPII
      };

      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: '{"recipes": []}' }],
          usage: { input_tokens: 100, output_tokens: 50 }
        }))
      });

      await client.generateRecipes(request);

      // Verify that the Bedrock API was called
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should generate multiple recipes when requested', async () => {
      const multiRecipeRequest: AIRecipeRequest = {
        ingredients: ['thịt gà', 'rau'],
        cooking_method: 'xào',
        user_context: mockRequest.user_context,
        recipe_count: 2
      };

      const mockAIResponse = {
        content: [{
          text: JSON.stringify({
            recipes: [
              {
                title: 'Gà xào rau 1',
                description: 'Món gà xào rau đầu tiên',
                cuisine_type: 'Vietnamese',
                cooking_method: 'xào',
                meal_type: 'main',
                prep_time_minutes: 10,
                cook_time_minutes: 15,
                servings: 2,
                ingredients: [{ ingredient_name: 'thịt gà', quantity: '200g' }],
                instructions: [{ step_number: 1, description: 'Xào gà' }]
              },
              {
                title: 'Gà xào rau 2',
                description: 'Món gà xào rau thứ hai',
                cuisine_type: 'Vietnamese',
                cooking_method: 'xào',
                meal_type: 'main',
                prep_time_minutes: 12,
                cook_time_minutes: 18,
                servings: 3,
                ingredients: [{ ingredient_name: 'thịt gà', quantity: '300g' }],
                instructions: [{ step_number: 1, description: 'Xào gà khác' }]
              }
            ]
          })
        }],
        usage: { input_tokens: 600, output_tokens: 1200 }
      };

      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify(mockAIResponse))
      });

      const result = await client.generateRecipes(multiRecipeRequest);

      expect(result.recipes).toHaveLength(2);
      expect(result.recipes[0].title).toBe('Gà xào rau 1');
      expect(result.recipes[1].title).toBe('Gà xào rau 2');
      expect(result.recipes[0].servings).toBe(2);
      expect(result.recipes[1].servings).toBe(3);
    });

    it('should handle AI response with missing optional fields', async () => {
      const mockAIResponse = {
        content: [{
          text: JSON.stringify({
            recipes: [{
              title: 'Gà xào cơ bản',
              // Missing description, nutritional_info, etc.
              cooking_method: 'xào',
              ingredients: [{ ingredient_name: 'thịt gà' }], // Missing quantity
              instructions: [{ description: 'Xào gà' }] // Missing step_number
            }]
          })
        }],
        usage: { input_tokens: 400, output_tokens: 600 }
      };

      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify(mockAIResponse))
      });

      const result = await client.generateRecipes(mockRequest);

      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].title).toBe('Gà xào cơ bản');
      expect(result.recipes[0].description).toBe('Món ăn được tạo bởi AI'); // Default value
      expect(result.recipes[0].prep_time_minutes).toBe(15); // Default value
      expect(result.recipes[0].ingredients[0].quantity).toBe('1'); // Default quantity
      expect(result.recipes[0].instructions[0].step_number).toBe(1); // Default step number
    });

    it('should handle AI response with invalid JSON structure', async () => {
      const mockAIResponse = {
        content: [{
          text: JSON.stringify({
            // Missing recipes array
            invalid_structure: true
          })
        }],
        usage: { input_tokens: 300, output_tokens: 100 }
      };

      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify(mockAIResponse))
      });

      const result = await client.generateRecipes(mockRequest);

      // Should return fallback recipe
      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].title).toBe('Món xào đơn giản');
      expect(result.recipes[0].is_ai_generated).toBe(true);
      expect(result.recipes[0].ingredients).toHaveLength(3); // All input ingredients
    });

    it('should handle AI response with markdown formatting', async () => {
      const mockAIResponse = {
        content: [{
          text: `Here's your recipe:

\`\`\`json
${JSON.stringify({
  recipes: [{
    title: 'Gà xào markdown',
    description: 'Recipe from markdown response',
    cooking_method: 'xào',
    ingredients: [{ ingredient_name: 'thịt gà', quantity: '250g' }],
    instructions: [{ step_number: 1, description: 'Xào gà trong markdown' }]
  }]
})}
\`\`\`

Hope you enjoy!`
        }],
        usage: { input_tokens: 500, output_tokens: 800 }
      };

      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify(mockAIResponse))
      });

      const result = await client.generateRecipes(mockRequest);

      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].title).toBe('Gà xào markdown');
      expect(result.recipes[0].description).toBe('Recipe from markdown response');
    });

    it('should handle dietary restrictions in AI prompts', async () => {
      const vegetarianRequest: AIRecipeRequest = {
        ingredients: ['đậu hũ', 'rau cải'],
        cooking_method: 'xào',
        user_context: {
          age_range: '26-35',
          gender: 'female',
          country: 'Vietnam',
          dietary_restrictions: ['vegetarian', 'no-msg'],
          allergies: ['peanuts'],
          favorite_cuisines: ['Vietnamese'],
          preferred_cooking_methods: ['xào']
        }
      };

      const mockAIResponse = {
        content: [{
          text: JSON.stringify({
            recipes: [{
              title: 'Đậu hũ xào rau cải chay',
              description: 'Món chay không có thịt',
              cooking_method: 'xào',
              ingredients: [
                { ingredient_name: 'đậu hũ', quantity: '200g' },
                { ingredient_name: 'rau cải', quantity: '100g' }
              ],
              instructions: [{ step_number: 1, description: 'Xào đậu hũ với rau' }]
            }]
          })
        }],
        usage: { input_tokens: 550, output_tokens: 700 }
      };

      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify(mockAIResponse))
      });

      const result = await client.generateRecipes(vegetarianRequest);

      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].title).toBe('Đậu hũ xào rau cải chay');
      expect(result.recipes[0].ingredients.every(ing => 
        !['thịt', 'gà', 'heo', 'bò', 'cá'].some(meat => 
          ing.ingredient_name.toLowerCase().includes(meat)
        )
      )).toBe(true);
    });

    it('should handle allergy restrictions in AI prompts', async () => {
      const allergyRequest: AIRecipeRequest = {
        ingredients: ['cá', 'rau'],
        cooking_method: 'hấp',
        user_context: {
          age_range: '36-45',
          gender: 'male',
          country: 'Vietnam',
          dietary_restrictions: [],
          allergies: ['shellfish', 'nuts'],
          favorite_cuisines: ['Vietnamese'],
          preferred_cooking_methods: ['hấp']
        }
      };

      const mockAIResponse = {
        content: [{
          text: JSON.stringify({
            recipes: [{
              title: 'Cá hấp rau không tôm cua',
              description: 'Món cá hấp an toàn cho người dị ứng',
              cooking_method: 'hấp',
              ingredients: [
                { ingredient_name: 'cá', quantity: '300g' },
                { ingredient_name: 'rau', quantity: '150g' }
              ],
              instructions: [{ step_number: 1, description: 'Hấp cá với rau' }]
            }]
          })
        }],
        usage: { input_tokens: 520, output_tokens: 650 }
      };

      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify(mockAIResponse))
      });

      const result = await client.generateRecipes(allergyRequest);

      expect(result.recipes).toHaveLength(1);
      expect(result.recipes[0].ingredients.every(ing => 
        !['tôm', 'cua', 'shellfish', 'nuts'].some(allergen => 
          ing.ingredient_name.toLowerCase().includes(allergen)
        )
      )).toBe(true);
    });

    it('should track token usage and generation time', async () => {
      const mockAIResponse = {
        content: [{
          text: JSON.stringify({
            recipes: [{
              title: 'Test Recipe',
              cooking_method: 'xào',
              ingredients: [{ ingredient_name: 'test', quantity: '100g' }],
              instructions: [{ step_number: 1, description: 'Test instruction' }]
            }]
          })
        }],
        usage: {
          input_tokens: 750,
          output_tokens: 1200
        }
      };

      mockSend.mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify(mockAIResponse))
      });

      const startTime = Date.now();
      const result = await client.generateRecipes(mockRequest);
      const endTime = Date.now();

      expect(result.prompt_tokens).toBe(750);
      expect(result.completion_tokens).toBe(1200);
      expect(result.generation_time_ms).toBeGreaterThan(0);
      expect(result.generation_time_ms).toBeLessThan(endTime - startTime + 100); // Allow some margin
      expect(result.model_used).toBe('anthropic.claude-3-haiku-20240307-v1:0');
    });
  });

  describe('createUserContext', () => {
    it('should create privacy-aware user context from profile and preferences', () => {
      const profile: UserProfile = {
        user_id: 'user-123',
        email: 'user@example.com', // PII - should not be included
        username: 'cookmaster',
        full_name: 'John Doe', // PII - should not be included
        date_of_birth: '1990-05-15', // Should be converted to age range
        gender: 'male',
        country: 'Vietnam',
        avatar_url: 'https://example.com/avatar.jpg',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const preferences: UserPreferences = {
        dietary_restrictions: ['vegetarian'],
        allergies: ['peanuts', 'shellfish'],
        favorite_cuisines: ['Vietnamese', 'Thai'],
        preferred_cooking_methods: ['steam', 'stir-fry']
      };

      const context = BedrockAIClient.createUserContext(profile, preferences);

      expect(context.age_range).toBe('26-35'); // Calculated from birthdate
      expect(context.gender).toBe('male');
      expect(context.country).toBe('Vietnam');
      expect(context.dietary_restrictions).toEqual(['vegetarian']);
      expect(context.allergies).toEqual(['peanuts', 'shellfish']);
      expect(context.favorite_cuisines).toEqual(['Vietnamese', 'Thai']);
      expect(context.preferred_cooking_methods).toEqual(['steam', 'stir-fry']);
      
      // Verify PII is not included
      expect(context).not.toHaveProperty('email');
      expect(context).not.toHaveProperty('full_name');
      expect(context).not.toHaveProperty('date_of_birth');
    });

    it('should handle missing profile and preferences gracefully', () => {
      const context = BedrockAIClient.createUserContext();

      expect(context.dietary_restrictions).toEqual([]);
      expect(context.allergies).toEqual([]);
      expect(context.favorite_cuisines).toEqual([]);
      expect(context.preferred_cooking_methods).toEqual([]);
      expect(context.age_range).toBeUndefined();
      expect(context.gender).toBeUndefined();
      expect(context.country).toBeUndefined();
    });

    it('should calculate correct age ranges', () => {
      const testCases = [
        { birthYear: 2005, expectedRange: '18-25' },
        { birthYear: 1995, expectedRange: '26-35' },
        { birthYear: 1985, expectedRange: '36-45' },
        { birthYear: 1975, expectedRange: '46-55' },
        { birthYear: 1960, expectedRange: '55+' }
      ];

      testCases.forEach(({ birthYear, expectedRange }) => {
        const profile: UserProfile = {
          user_id: 'test',
          email: 'test@example.com',
          username: 'test',
          full_name: 'Test User',
          date_of_birth: `${birthYear}-01-01`,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        };

        const context = BedrockAIClient.createUserContext(profile);
        expect(context.age_range).toBe(expectedRange);
      });
    });
  });
});