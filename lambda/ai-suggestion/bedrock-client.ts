import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { UserProfile, UserPreferences, Recipe, RecipeIngredient, RecipeInstruction } from '../shared/types';

export interface UserContext {
  age_range?: string; // "18-25", "26-35", "36-45", "46-55", "55+"
  gender?: 'male' | 'female' | 'other';
  country?: string;
  dietary_restrictions: string[];
  allergies: string[];
  favorite_cuisines: string[];
  preferred_cooking_methods: string[];
}

export interface AIRecipeRequest {
  ingredients: string[];
  cooking_method: string;
  user_context: UserContext;
  recipe_count?: number;
}

export interface AIRecipeResponse {
  recipes: Recipe[];
  generation_time_ms: number;
  model_used: string;
  prompt_tokens?: number;
  completion_tokens?: number;
}

export class BedrockAIClient {
  private client: BedrockRuntimeClient;
  private modelId: string = 'anthropic.claude-3-haiku-20240307-v1:0';
  private maxTokens: number = 4000;
  private temperature: number = 0.7;

  constructor(region: string = 'us-east-1') {
    this.client = new BedrockRuntimeClient({ region });
  }

  /**
   * Generate recipes using Claude 3 Haiku with privacy-aware prompting
   */
  async generateRecipes(request: AIRecipeRequest): Promise<AIRecipeResponse> {
    const startTime = Date.now();
    
    try {
      const prompt = this.buildPrompt(request);
      
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      const recipes = this.parseAIResponse(responseBody.content[0].text, request);
      const generationTime = Date.now() - startTime;

      return {
        recipes,
        generation_time_ms: generationTime,
        model_used: this.modelId,
        prompt_tokens: responseBody.usage?.input_tokens,
        completion_tokens: responseBody.usage?.output_tokens
      };

    } catch (error) {
      console.error('Bedrock AI generation failed:', error);
      throw new Error(`AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build privacy-aware prompt with user personalization context
   * Excludes PII data (email, full name, exact birthdate, address)
   */
  private buildPrompt(request: AIRecipeRequest): string {
    const { ingredients, cooking_method, user_context, recipe_count = 1 } = request;
    
    // Build personalization context (privacy-aware)
    const personalizationContext = this.buildPersonalizationContext(user_context);
    
    // Determine cuisine based on user's country (default: Vietnamese)
    const userCountry = user_context.country || 'Vietnam';
    const cuisineType = userCountry === 'Vietnam' ? 'Vietnamese' : userCountry;
    const language = userCountry === 'Vietnam' ? 'Vietnamese' : 'English';
    
    const prompt = `You are a ${cuisineType} cooking expert AI assistant. Generate ${recipe_count} authentic ${cuisineType} recipe(s) using the specified cooking method and ingredients.

IMPORTANT - INGREDIENT MATCHING:
The user may input ingredients WITHOUT Vietnamese diacritics or with typos. You MUST intelligently match them:
- "ca ro" → cà rốt (carrot)
- "hanh la" → hành lá (green onion) 
- "ca chua" → cà chua (tomato)
- "thit ga" → thịt gà (chicken)
- "tom" → tôm (shrimp)
- "ca" → cá (fish)
Use your knowledge to identify the correct ingredient even with missing diacritics or minor spelling variations.

COOKING METHOD: ${cooking_method}
AVAILABLE INGREDIENTS (may have typos or missing diacritics): ${ingredients.join(', ')}

${personalizationContext}

REQUIREMENTS:
1. INTELLIGENTLY INTERPRET ingredient names - match "ca ro" to "cà rốt", "hanh" to "hành", etc.
2. Use ONLY the provided ingredients (interpret them correctly, then use them)
3. Create authentic ${cuisineType} recipes using the specified cooking method: ${cooking_method}
4. Ensure recipes are suitable for the user's dietary needs and preferences
5. Include detailed step-by-step instructions in ${language}
6. Provide cooking and prep times
7. Specify serving size
8. In the response, use CORRECT Vietnamese spelling with proper diacritics

RESPONSE FORMAT (JSON only, no additional text):

IF YOU CAN CREATE RECIPES WITH THESE INGREDIENTS:
{
  "success": true,
  "recipes": [
    {
      "title": "Recipe name in ${language} (with correct diacritics)",
      "description": "Brief description in ${language}",
      "cuisine_type": "${cuisineType}",
      "cooking_method": "${cooking_method}",
      "meal_type": "main|appetizer|soup|dessert",
      "prep_time_minutes": number,
      "cook_time_minutes": number,
      "servings": number,
      "ingredients": [
        {
          "ingredient_name": "correct ingredient name WITH diacritics (e.g., cà rốt not ca ro)",
          "quantity": "amount",
          "unit": "unit (optional)",
          "preparation": "preparation method (optional)",
          "is_optional": false
        }
      ],
      "instructions": [
        {
          "step_number": 1,
          "description": "Detailed instruction in ${language}",
          "duration": "time estimate (optional)"
        }
      ],
      "nutritional_info": {
        "calories": estimated_calories,
        "protein": "protein content",
        "carbs": "carb content",
        "fat": "fat content"
      }
    }
  ]
}

IF INGREDIENTS ARE UNCLEAR OR CANNOT CREATE RECIPES:
{
  "success": false,
  "error": "INVALID_INGREDIENTS",
  "message": "Không thể tìm thấy món ăn phù hợp với các nguyên liệu này. Vui lòng kiểm tra lại tên nguyên liệu hoặc thử với nguyên liệu khác.",
  "suggestions": ["Gợi ý nguyên liệu 1", "Gợi ý nguyên liệu 2"]
}

REMEMBER: 
- Interpret ingredient inputs flexibly (ca ro = cà rốt, hanh la = hành lá, rau mui = rau mùi)
- Output ingredients with CORRECT Vietnamese diacritics
- If you CANNOT identify ingredients or create a recipe, return success: false
- Be flexible - even with typos like "ca ro" or "hanh la", try to create recipes
- Only return error if ingredients are completely unrecognizable or incompatible`;

    return prompt;
  }

  /**
   * Build personalization context while respecting privacy
   * Only uses: age range, gender, country, cooking preferences, allergies
   * Never uses: email, full name, exact birthdate, address
   */
  private buildPersonalizationContext(userContext: UserContext): string {
    const contextParts: string[] = [];

    // Age-appropriate suggestions
    if (userContext.age_range) {
      contextParts.push(`USER AGE RANGE: ${userContext.age_range}`);
    }

    // Gender-based preferences (if relevant for Vietnamese cuisine)
    if (userContext.gender) {
      contextParts.push(`USER GENDER: ${userContext.gender}`);
    }

    // Regional preferences
    if (userContext.country) {
      contextParts.push(`USER LOCATION: ${userContext.country}`);
    }

    // Critical dietary restrictions
    if (userContext.allergies.length > 0) {
      contextParts.push(`ALLERGIES (MUST AVOID): ${userContext.allergies.join(', ')}`);
    }

    // Dietary preferences
    if (userContext.dietary_restrictions.length > 0) {
      contextParts.push(`DIETARY RESTRICTIONS: ${userContext.dietary_restrictions.join(', ')}`);
    }

    // Cuisine preferences
    if (userContext.favorite_cuisines.length > 0) {
      contextParts.push(`FAVORITE CUISINES: ${userContext.favorite_cuisines.join(', ')}`);
    }

    // Cooking method preferences
    if (userContext.preferred_cooking_methods.length > 0) {
      contextParts.push(`PREFERRED COOKING METHODS: ${userContext.preferred_cooking_methods.join(', ')}`);
    }

    return contextParts.length > 0 
      ? `USER PREFERENCES:\n${contextParts.join('\n')}\n`
      : '';
  }

  /**
   * Parse and validate AI response into Recipe objects
   */
  private parseAIResponse(aiResponse: string, request: AIRecipeRequest): Recipe[] {
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in AI response');
      }

      const parsedResponse = JSON.parse(jsonMatch[0]);
      
      // Check if AI returned error due to invalid ingredients
      if (parsedResponse.success === false) {
        console.warn('AI could not create recipes:', parsedResponse.message);
        throw new Error(parsedResponse.message || 'Không thể tìm thấy món ăn phù hợp với nguyên liệu này');
      }
      
      if (!parsedResponse.recipes || !Array.isArray(parsedResponse.recipes)) {
        throw new Error('Invalid response format: missing recipes array');
      }

      return parsedResponse.recipes.map((recipe: any, index: number) => {
        return this.validateAndFormatRecipe(recipe, request, index);
      });

    } catch (error) {
      console.error('Failed to parse AI response:', error);
      console.error('Raw AI response:', aiResponse);
      
      // If error message is from AI about invalid ingredients, throw it
      if (error instanceof Error && error.message.includes('Không thể tìm thấy')) {
        throw error;
      }
      
      // Return fallback recipe for other parsing errors
      return [this.createFallbackRecipe(request)];
    }
  }

  /**
   * Validate and format a single recipe from AI response
   */
  private validateAndFormatRecipe(recipe: any, request: AIRecipeRequest, index: number): Recipe {
    const recipeId = `ai-${Date.now()}-${index}`;
    const now = new Date().toISOString();

    return {
      recipe_id: recipeId,
      title: recipe.title || `Món ${request.cooking_method} với ${request.ingredients.slice(0, 2).join(', ')}`,
      description: recipe.description || 'Món ăn được tạo bởi AI',
      cuisine_type: recipe.cuisine_type || 'Vietnamese',
      cooking_method: recipe.cooking_method || request.cooking_method,
      meal_type: recipe.meal_type || 'main',
      prep_time_minutes: recipe.prep_time_minutes || 15,
      cook_time_minutes: recipe.cook_time_minutes || 20,
      servings: recipe.servings || 2,
      ingredients: this.validateIngredients(recipe.ingredients, request.ingredients),
      instructions: this.validateInstructions(recipe.instructions),
      nutritional_info: recipe.nutritional_info || {
        calories: 300,
        protein: '20g',
        carbs: '30g',
        fat: '15g'
      },
      is_public: false,
      is_ai_generated: true,
      is_approved: false,
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Validate recipe ingredients against available ingredients
   */
  private validateIngredients(ingredients: any[], availableIngredients: string[]): RecipeIngredient[] {
    if (!Array.isArray(ingredients)) {
      return availableIngredients.map(ingredient => ({
        ingredient_name: ingredient,
        quantity: '1',
        unit: 'portion'
      }));
    }

    return ingredients.map(ingredient => ({
      ingredient_name: ingredient.ingredient_name || ingredient.name || 'Unknown ingredient',
      quantity: ingredient.quantity || '1',
      unit: ingredient.unit || '',
      preparation: ingredient.preparation || '',
      is_optional: ingredient.is_optional || false
    }));
  }

  /**
   * Validate recipe instructions
   */
  private validateInstructions(instructions: any[]): RecipeInstruction[] {
    if (!Array.isArray(instructions)) {
      return [
        {
          step_number: 1,
          description: 'Chuẩn bị nguyên liệu',
          duration: '5 phút'
        },
        {
          step_number: 2,
          description: 'Nấu theo phương pháp đã chọn',
          duration: '15 phút'
        }
      ];
    }

    return instructions.map((instruction, index) => ({
      step_number: instruction.step_number || index + 1,
      description: instruction.description || `Bước ${index + 1}`,
      duration: instruction.duration || ''
    }));
  }

  /**
   * Create fallback recipe when AI generation fails
   */
  private createFallbackRecipe(request: AIRecipeRequest): Recipe {
    const recipeId = `fallback-${Date.now()}`;
    const now = new Date().toISOString();

    return {
      recipe_id: recipeId,
      title: `Món ${request.cooking_method} đơn giản`,
      description: `Món ăn ${request.cooking_method} sử dụng ${request.ingredients.join(', ')}`,
      cuisine_type: 'Vietnamese',
      cooking_method: request.cooking_method,
      meal_type: 'main',
      prep_time_minutes: 10,
      cook_time_minutes: 15,
      servings: 2,
      ingredients: request.ingredients.map(ingredient => ({
        ingredient_name: ingredient,
        quantity: '1',
        unit: 'portion'
      })),
      instructions: [
        {
          step_number: 1,
          description: 'Chuẩn bị và làm sạch nguyên liệu',
          duration: '5 phút'
        },
        {
          step_number: 2,
          description: `Nấu theo phương pháp ${request.cooking_method}`,
          duration: '10 phút'
        }
      ],
      nutritional_info: {
        calories: 250,
        protein: '15g',
        carbs: '25g',
        fat: '10g'
      },
      is_public: false,
      is_ai_generated: true,
      is_approved: false,
      created_at: now,
      updated_at: now
    };
  }

  /**
   * Convert user profile and preferences to privacy-aware context
   */
  static createUserContext(profile?: UserProfile, preferences?: UserPreferences): UserContext {
    const context: UserContext = {
      dietary_restrictions: preferences?.dietary_restrictions || [],
      allergies: preferences?.allergies || [],
      favorite_cuisines: preferences?.favorite_cuisines || [],
      preferred_cooking_methods: preferences?.preferred_cooking_methods || []
    };

    // Add age range (privacy-aware - no exact birthdate)
    if (profile?.date_of_birth) {
      const birthYear = new Date(profile.date_of_birth).getFullYear();
      const currentYear = new Date().getFullYear();
      const age = currentYear - birthYear;
      
      if (age >= 18 && age <= 25) context.age_range = '18-25';
      else if (age >= 26 && age <= 35) context.age_range = '26-35';
      else if (age >= 36 && age <= 45) context.age_range = '36-45';
      else if (age >= 46 && age <= 55) context.age_range = '46-55';
      else if (age > 55) context.age_range = '55+';
    }

    // Add gender (if provided)
    if (profile?.gender) {
      context.gender = profile.gender;
    }

    // Add country (if provided)
    if (profile?.country) {
      context.country = profile.country;
    }

    return context;
  }
}