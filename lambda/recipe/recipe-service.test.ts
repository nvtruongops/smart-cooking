/**
 * Unit tests for Recipe Service
 */

import { RecipeService } from './recipe-service';
import { DynamoDBHelper } from '../shared/dynamodb';
import { AppError } from '../shared/responses';
import { CreateRecipeRequest, UpdateRecipeRequest } from './types';

// Mock DynamoDB Helper
jest.mock('../shared/dynamodb');

describe('RecipeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createRecipe', () => {
    it('should create a recipe with all details', async () => {
      const userId = 'user-123';
      const request: CreateRecipeRequest = {
        title: 'Phở Bò',
        description: 'Traditional Vietnamese beef noodle soup',
        cooking_method: 'boiling',
        cuisine_type: 'Vietnamese',
        meal_type: 'lunch',
        difficulty_level: 'medium',
        prep_time_minutes: 30,
        cook_time_minutes: 120,
        servings: 4,
        calories_per_serving: 450,
        ingredients: [
          {
            ingredient_id: 'ing-1',
            ingredient_name: 'Beef bones',
            quantity: 1,
            unit: 'kg'
          },
          {
            ingredient_id: 'ing-2',
            ingredient_name: 'Rice noodles',
            quantity: 500,
            unit: 'g'
          }
        ],
        instructions: [
          {
            step_number: 1,
            description: 'Boil beef bones for 2 hours',
            duration_minutes: 120
          },
          {
            step_number: 2,
            description: 'Prepare rice noodles',
            duration_minutes: 5
          }
        ]
      };

      (DynamoDBHelper.put as jest.Mock).mockResolvedValue({});
      (DynamoDBHelper.batchWrite as jest.Mock).mockResolvedValue({});

      const result = await RecipeService.createRecipe(userId, request);

      expect(result.recipe_id).toBeDefined();
      expect(DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: expect.stringContaining('RECIPE#'),
          SK: 'METADATA',
          title: 'Phở Bò',
          cooking_method: 'boiling',
          total_time_minutes: 150,
          is_approved: false,
          approval_status: 'pending',
          created_by: userId
        })
      );
      expect(DynamoDBHelper.batchWrite).toHaveBeenCalledTimes(2); // ingredients and instructions
    });

    it('should set default source to user_created', async () => {
      const userId = 'user-123';
      const request: CreateRecipeRequest = {
        title: 'Simple Recipe',
        cooking_method: 'frying',
        ingredients: [
          { ingredient_id: 'ing-1', ingredient_name: 'Egg', quantity: 2, unit: 'pcs' }
        ],
        instructions: [
          { step_number: 1, description: 'Fry eggs' }
        ]
      };

      (DynamoDBHelper.put as jest.Mock).mockResolvedValue({});
      (DynamoDBHelper.batchWrite as jest.Mock).mockResolvedValue({});

      await RecipeService.createRecipe(userId, request);

      expect(DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'user_created'
        })
      );
    });
  });

  describe('getRecipeById', () => {
    it('should return complete recipe data structure with metadata, ingredients, and instructions', async () => {
      const recipeId = 'recipe-123';
      const mockMetadata = {
        recipe_id: recipeId,
        title: 'Phở Bò Huế',
        description: 'Spicy beef noodle soup from Hue',
        cooking_method: 'boiling',
        cuisine_type: 'Vietnamese',
        meal_type: 'lunch',
        difficulty_level: 'medium',
        prep_time_minutes: 30,
        cook_time_minutes: 120,
        total_time_minutes: 150,
        servings: 4,
        calories_per_serving: 450,
        is_approved: true,
        approval_status: 'approved',
        average_rating: 4.7,
        rating_count: 15,
        created_by: 'user-123',
        source: 'ai_generated',
        created_at: '2025-01-20T10:00:00Z',
        updated_at: '2025-01-20T10:00:00Z'
      };
      
      const mockIngredients = [
        {
          ingredient_id: 'ing-1',
          ingredient_name: 'Beef bones',
          quantity: 1,
          unit: 'kg',
          notes: 'For broth'
        },
        {
          ingredient_id: 'ing-2',
          ingredient_name: 'Rice noodles',
          quantity: 500,
          unit: 'g'
        }
      ];
      
      const mockInstructions = [
        {
          step_number: 1,
          description: 'Boil beef bones for 2 hours to make broth',
          duration_minutes: 120
        },
        {
          step_number: 2,
          description: 'Prepare rice noodles according to package instructions',
          duration_minutes: 5
        }
      ];

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(mockMetadata);
      (DynamoDBHelper.query as jest.Mock)
        .mockResolvedValueOnce({ Items: mockIngredients })
        .mockResolvedValueOnce({ Items: mockInstructions });

      const result = await RecipeService.getRecipeById(recipeId);

      // Verify complete data structure
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('ingredients');
      expect(result).toHaveProperty('instructions');
      
      expect(result.metadata).toEqual(mockMetadata);
      expect(result.ingredients).toEqual(mockIngredients);
      expect(result.instructions).toEqual(mockInstructions);
      
      // Verify community stats are included
      expect(result.metadata.average_rating).toBe(4.7);
      expect(result.metadata.rating_count).toBe(15);
      expect(result.metadata.source).toBe('ai_generated');
    });

    it('should return recipe with all details for approved recipe', async () => {
      const recipeId = 'recipe-123';
      const mockMetadata = {
        recipe_id: recipeId,
        title: 'Test Recipe',
        is_approved: true,
        created_by: 'user-123'
      };
      const mockIngredients = [
        { ingredient_id: 'ing-1', ingredient_name: 'Ingredient 1' }
      ];
      const mockInstructions = [
        { step_number: 1, description: 'Step 1' }
      ];

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(mockMetadata);
      (DynamoDBHelper.query as jest.Mock)
        .mockResolvedValueOnce({ Items: mockIngredients })
        .mockResolvedValueOnce({ Items: mockInstructions });

      const result = await RecipeService.getRecipeById(recipeId);

      expect(result.metadata).toEqual(mockMetadata);
      expect(result.ingredients).toEqual(mockIngredients);
      expect(result.instructions).toEqual(mockInstructions);
    });

    it('should throw error if recipe not found', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);

      await expect(RecipeService.getRecipeById('non-existent')).rejects.toThrow(AppError);
      await expect(RecipeService.getRecipeById('non-existent')).rejects.toThrow('Recipe not found');
    });

    it('should deny access to non-approved recipe for other users', async () => {
      const recipeId = 'recipe-123';
      const mockMetadata = {
        recipe_id: recipeId,
        is_approved: false,
        created_by: 'user-123'
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(mockMetadata);

      await expect(RecipeService.getRecipeById(recipeId, 'user-456')).rejects.toThrow(AppError);
      await expect(RecipeService.getRecipeById(recipeId, 'user-456')).rejects.toThrow(
        'You do not have permission to view this recipe'
      );
    });

    it('should allow owner to view non-approved recipe', async () => {
      const recipeId = 'recipe-123';
      const userId = 'user-123';
      const mockMetadata = {
        recipe_id: recipeId,
        is_approved: false,
        created_by: userId
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(mockMetadata);
      (DynamoDBHelper.query as jest.Mock)
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

      const result = await RecipeService.getRecipeById(recipeId, userId);

      expect(result.metadata).toEqual(mockMetadata);
    });

    it('should include approval status and community stats in recipe details', async () => {
      const recipeId = 'recipe-123';
      const mockMetadata = {
        recipe_id: recipeId,
        title: 'Community Recipe',
        is_approved: true,
        approval_status: 'approved',
        average_rating: 4.2,
        rating_count: 8,
        source: 'user_created',
        created_by: 'user-123'
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(mockMetadata);
      (DynamoDBHelper.query as jest.Mock)
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

      const result = await RecipeService.getRecipeById(recipeId);

      expect(result.metadata.is_approved).toBe(true);
      expect(result.metadata.approval_status).toBe('approved');
      expect(result.metadata.average_rating).toBe(4.2);
      expect(result.metadata.rating_count).toBe(8);
      expect(result.metadata.source).toBe('user_created');
    });

    it('should handle recipes with no ratings gracefully', async () => {
      const recipeId = 'recipe-123';
      const mockMetadata = {
        recipe_id: recipeId,
        title: 'New Recipe',
        is_approved: false,
        approval_status: 'pending',
        rating_count: 0,
        created_by: 'user-123'
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(mockMetadata);
      (DynamoDBHelper.query as jest.Mock)
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

      const result = await RecipeService.getRecipeById(recipeId, 'user-123');

      expect(result.metadata.rating_count).toBe(0);
      expect(result.metadata.average_rating).toBeUndefined();
      expect(result.metadata.is_approved).toBe(false);
    });
  });

  describe('updateRecipe', () => {
    it('should update recipe metadata', async () => {
      const userId = 'user-123';
      const recipeId = 'recipe-123';
      const existingRecipe = {
        metadata: {
          recipe_id: recipeId,
          title: 'Old Title',
          created_by: userId,
          prep_time_minutes: 10,
          cook_time_minutes: 20
        },
        ingredients: [],
        instructions: []
      };

      const updates: UpdateRecipeRequest = {
        recipe_id: recipeId,
        title: 'New Title',
        description: 'Updated description'
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(existingRecipe.metadata);
      (DynamoDBHelper.query as jest.Mock)
        .mockResolvedValue({ Items: [] });
      (DynamoDBHelper.update as jest.Mock).mockResolvedValue({});

      await RecipeService.updateRecipe(userId, updates);

      expect(DynamoDBHelper.update).toHaveBeenCalledWith(
        `RECIPE#${recipeId}`,
        'METADATA',
        expect.stringContaining('SET'),
        expect.objectContaining({
          ':title': 'New Title',
          ':description': 'Updated description'
        }),
        expect.any(Object)
      );
    });

    it('should deny update if user is not owner', async () => {
      const userId = 'user-456';
      const recipeId = 'recipe-123';
      const existingRecipe = {
        metadata: {
          recipe_id: recipeId,
          created_by: 'user-123',
          is_approved: true // Make it approved so it passes the first check
        },
        ingredients: [],
        instructions: []
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(existingRecipe.metadata);
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({ Items: [] });

      await expect(
        RecipeService.updateRecipe(userId, { recipe_id: recipeId, title: 'New' })
      ).rejects.toThrow('You can only update your own recipes');
    });

    it('should update total_time when prep or cook time changes', async () => {
      const userId = 'user-123';
      const recipeId = 'recipe-123';
      const existingRecipe = {
        metadata: {
          recipe_id: recipeId,
          created_by: userId,
          prep_time_minutes: 10,
          cook_time_minutes: 20
        },
        ingredients: [],
        instructions: []
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(existingRecipe.metadata);
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({ Items: [] });
      (DynamoDBHelper.update as jest.Mock).mockResolvedValue({});

      await RecipeService.updateRecipe(userId, {
        recipe_id: recipeId,
        prep_time_minutes: 15,
        cook_time_minutes: 25
      });

      const updateCall = (DynamoDBHelper.update as jest.Mock).mock.calls[0];
      expect(updateCall[0]).toBe('RECIPE#recipe-123');
      expect(updateCall[1]).toBe('METADATA');
      expect(updateCall[2]).toContain('total_time_minutes');
      expect(updateCall[3]).toMatchObject({
        ':total_time_minutes': 40
      });
    });
  });

  describe('deleteRecipe', () => {
    it('should delete recipe and all related items', async () => {
      const userId = 'user-123';
      const recipeId = 'recipe-123';
      const existingRecipe = {
        metadata: { recipe_id: recipeId, created_by: userId },
        ingredients: [],
        instructions: []
      };

      const allItems = [
        { PK: `RECIPE#${recipeId}`, SK: 'METADATA' },
        { PK: `RECIPE#${recipeId}`, SK: 'INGREDIENT#001' },
        { PK: `RECIPE#${recipeId}`, SK: 'INSTRUCTION#001' }
      ];

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(existingRecipe.metadata);
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({ Items: allItems });
      (DynamoDBHelper.batchWrite as jest.Mock).mockResolvedValue({});

      await RecipeService.deleteRecipe(userId, recipeId);

      expect(DynamoDBHelper.batchWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            DeleteRequest: expect.objectContaining({
              Key: { PK: `RECIPE#${recipeId}`, SK: 'METADATA' }
            })
          })
        ])
      );
    });

    it('should deny deletion if user is not owner', async () => {
      const userId = 'user-456';
      const recipeId = 'recipe-123';
      const existingRecipe = {
        metadata: { 
          recipe_id: recipeId, 
          created_by: 'user-123',
          is_approved: true // Make it approved so it passes the first check
        },
        ingredients: [],
        instructions: []
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(existingRecipe.metadata);
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({ Items: [] });

      await expect(RecipeService.deleteRecipe(userId, recipeId)).rejects.toThrow(
        'You can only delete your own recipes'
      );
    });
  });

  describe('listRecipes', () => {
    it('should return recipes with community stats and approval status', async () => {
      const userId = 'user-123';
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Popular Recipe',
          is_approved: true,
          approval_status: 'approved',
          average_rating: 4.8,
          rating_count: 20,
          source: 'ai_generated',
          created_at: '2025-01-20T10:00:00Z'
        },
        {
          recipe_id: 'recipe-2',
          title: 'New Recipe',
          is_approved: true,
          approval_status: 'approved',
          average_rating: 4.0,
          rating_count: 3,
          source: 'user_created',
          created_at: '2025-01-21T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 2
      });

      const result = await RecipeService.listRecipes(userId, {});

      expect(result.recipes).toHaveLength(2);
      expect(result.recipes[0]).toMatchObject({
        recipe_id: 'recipe-1',
        is_approved: true,
        average_rating: 4.8,
        rating_count: 20,
        source: 'ai_generated'
      });
      expect(result.recipes[1]).toMatchObject({
        recipe_id: 'recipe-2',
        is_approved: true,
        average_rating: 4.0,
        rating_count: 3,
        source: 'user_created'
      });
    });

    it('should list user recipes when filter_by_user is true', async () => {
      const userId = 'user-123';
      const mockRecipes = [
        { recipe_id: 'recipe-1', title: 'Recipe 1' },
        { recipe_id: 'recipe-2', title: 'Recipe 2' }
      ];

      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 2
      });

      const result = await RecipeService.listRecipes(userId, {
        filter_by_user: true
      });

      expect(result.recipes).toEqual(mockRecipes);
      expect(result.count).toBe(2);
      expect(DynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: expect.objectContaining({
            ':pk': `USER#${userId}`
          })
        })
      );
    });

    it('should filter by cooking method', async () => {
      const userId = 'user-123';
      const mockRecipes = [{ recipe_id: 'recipe-1', cooking_method: 'frying' }];

      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      const result = await RecipeService.listRecipes(userId, {
        cooking_method: 'frying',
        filter_by_approved: true
      });

      expect(result.recipes).toEqual(mockRecipes);
      expect(DynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          ExpressionAttributeValues: expect.objectContaining({
            ':pk': 'METHOD#frying',
            ':approved': true
          }),
          FilterExpression: 'is_approved = :approved'
        })
      );
    });

    it('should list all approved recipes by default', async () => {
      const userId = 'user-123';
      const mockRecipes = [
        { recipe_id: 'recipe-1', is_approved: true },
        { recipe_id: 'recipe-2', is_approved: true }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 2
      });

      const result = await RecipeService.listRecipes(userId, {});

      expect(result.recipes).toEqual(mockRecipes);
      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringContaining('is_approved'),
          ExpressionAttributeValues: expect.objectContaining({
            ':approved': true
          })
        })
      );
    });
  });

  describe('searchRecipes', () => {
    it('should return only approved recipes in search results', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Approved Recipe',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        },
        {
          recipe_id: 'recipe-2',
          title: 'Pending Recipe',
          is_approved: false,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-21T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 2
      });

      const result = await RecipeService.searchRecipes({});

      // Should filter to only approved recipes
      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringContaining('is_approved = :approved'),
          ExpressionAttributeValues: expect.objectContaining({
            ':approved': true
          })
        })
      );
    });

    it('should include community stats in recipe metadata', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Popular Recipe',
          is_approved: true,
          entity_type: 'recipe_metadata',
          average_rating: 4.5,
          rating_count: 25,
          source: 'ai_generated',
          created_at: '2025-01-20T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      const result = await RecipeService.searchRecipes({});

      expect(result.recipes[0]).toMatchObject({
        recipe_id: 'recipe-1',
        title: 'Popular Recipe',
        average_rating: 4.5,
        rating_count: 25,
        source: 'ai_generated'
      });
    });

    it('should search recipes by query string in title', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Gà xào cà chua',
          description: 'Món gà ngon',
          cooking_method: 'stir-fry',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z',
          average_rating: 4.5,
          rating_count: 10
        },
        {
          recipe_id: 'recipe-2',
          title: 'Cá kho tộ',
          description: 'Món cá truyền thống',
          cooking_method: 'braising',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-21T10:00:00Z',
          average_rating: 4.0,
          rating_count: 5
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 2
      });

      const result = await RecipeService.searchRecipes({
        q: 'gà',
        limit: 10,
        offset: 0
      });

      expect(result.recipes.length).toBeGreaterThan(0);
      expect(result.total_count).toBe(2);
      expect(result.has_more).toBe(false);
      expect(result.filters_applied.query).toBe('gà');

      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringContaining('contains'),
          ExpressionAttributeNames: expect.objectContaining({
            '#title': 'title',
            '#description': 'description'
          }),
          ExpressionAttributeValues: expect.objectContaining({
            ':search': 'gà',
            ':approved': true
          })
        })
      );
    });

    it('should filter by cuisine type', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Pasta Carbonara',
          cuisine_type: 'Italian',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      const result = await RecipeService.searchRecipes({
        cuisine_type: 'Italian'
      });

      expect(result.recipes).toHaveLength(1);
      expect(result.filters_applied.cuisine_type).toBe('Italian');

      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringContaining('cuisine_type'),
          ExpressionAttributeValues: expect.objectContaining({
            ':cuisine_type': 'Italian'
          })
        })
      );
    });

    it('should filter by cooking method', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Gà xào',
          cooking_method: 'stir-fry',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      const result = await RecipeService.searchRecipes({
        cooking_method: 'stir-fry'
      });

      expect(result.filters_applied.cooking_method).toBe('stir-fry');

      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringContaining('cooking_method'),
          ExpressionAttributeValues: expect.objectContaining({
            ':cooking_method': 'stir-fry'
          })
        })
      );
    });

    it('should filter by meal type', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Breakfast Burrito',
          meal_type: 'breakfast',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      const result = await RecipeService.searchRecipes({
        meal_type: 'breakfast'
      });

      expect(result.filters_applied.meal_type).toBe('breakfast');
    });

    it('should filter by minimum rating', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'High rated recipe',
          average_rating: 4.8,
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      const result = await RecipeService.searchRecipes({
        min_rating: 4.5
      });

      expect(result.filters_applied.min_rating).toBe(4.5);

      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringContaining('average_rating'),
          ExpressionAttributeValues: expect.objectContaining({
            ':min_rating': 4.5
          })
        })
      );
    });

    it('should filter by max prep time', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Quick recipe',
          prep_time_minutes: 10,
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      await RecipeService.searchRecipes({
        max_prep_time: 15
      });

      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringContaining('prep_time_minutes'),
          ExpressionAttributeValues: expect.objectContaining({
            ':max_prep_time': 15
          })
        })
      );
    });

    it('should filter by difficulty level', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Easy recipe',
          difficulty_level: 'easy',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      await RecipeService.searchRecipes({
        difficulty_level: 'easy'
      });

      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringContaining('difficulty_level'),
          ExpressionAttributeValues: expect.objectContaining({
            ':difficulty_level': 'easy'
          })
        })
      );
    });

    it('should sort by rating descending (default)', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Recipe 1',
          average_rating: 4.0,
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        },
        {
          recipe_id: 'recipe-2',
          title: 'Recipe 2',
          average_rating: 4.8,
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-21T10:00:00Z'
        },
        {
          recipe_id: 'recipe-3',
          title: 'Recipe 3',
          average_rating: 4.5,
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-22T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 3
      });

      const result = await RecipeService.searchRecipes({
        sort_by: 'rating',
        sort_order: 'desc'
      });

      expect(result.recipes[0].recipe_id).toBe('recipe-2'); // Highest rating first
      expect(result.recipes[1].recipe_id).toBe('recipe-3');
      expect(result.recipes[2].recipe_id).toBe('recipe-1');
    });

    it('should sort by created_at ascending', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-3',
          title: 'Recipe 3',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-22T10:00:00Z'
        },
        {
          recipe_id: 'recipe-1',
          title: 'Recipe 1',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        },
        {
          recipe_id: 'recipe-2',
          title: 'Recipe 2',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-21T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 3
      });

      const result = await RecipeService.searchRecipes({
        sort_by: 'created_at',
        sort_order: 'asc'
      });

      expect(result.recipes[0].recipe_id).toBe('recipe-1'); // Oldest first
      expect(result.recipes[1].recipe_id).toBe('recipe-2');
      expect(result.recipes[2].recipe_id).toBe('recipe-3');
    });

    it('should sort by popularity (rating_count)', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Recipe 1',
          rating_count: 5,
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        },
        {
          recipe_id: 'recipe-2',
          title: 'Recipe 2',
          rating_count: 20,
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-21T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 2
      });

      const result = await RecipeService.searchRecipes({
        sort_by: 'popularity',
        sort_order: 'desc'
      });

      expect(result.recipes[0].recipe_id).toBe('recipe-2'); // More ratings first
    });

    it('should handle pagination correctly', async () => {
      const mockRecipes = Array.from({ length: 25 }, (_, i) => ({
        recipe_id: `recipe-${i + 1}`,
        title: `Recipe ${i + 1}`,
        is_approved: true,
        entity_type: 'recipe_metadata',
        created_at: `2025-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`
      }));

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 25
      });

      // First page
      const page1 = await RecipeService.searchRecipes({
        limit: 10,
        offset: 0
      });

      expect(page1.recipes).toHaveLength(10);
      expect(page1.total_count).toBe(25);
      expect(page1.has_more).toBe(true);

      // Second page
      const page2 = await RecipeService.searchRecipes({
        limit: 10,
        offset: 10
      });

      expect(page2.recipes).toHaveLength(10);
      expect(page2.has_more).toBe(true);

      // Last page
      const page3 = await RecipeService.searchRecipes({
        limit: 10,
        offset: 20
      });

      expect(page3.recipes).toHaveLength(5);
      expect(page3.has_more).toBe(false);
    });

    it('should combine multiple filters', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Gà xào nấm',
          cuisine_type: 'Vietnamese',
          cooking_method: 'stir-fry',
          meal_type: 'lunch',
          difficulty_level: 'easy',
          average_rating: 4.5,
          prep_time_minutes: 15,
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      const result = await RecipeService.searchRecipes({
        q: 'gà',
        cuisine_type: 'Vietnamese',
        cooking_method: 'stir-fry',
        meal_type: 'lunch',
        min_rating: 4.0,
        max_prep_time: 20,
        difficulty_level: 'easy',
        sort_by: 'rating',
        sort_order: 'desc',
        limit: 20,
        offset: 0
      });

      expect(result.recipes).toHaveLength(1);
      expect(result.filters_applied).toEqual({
        query: 'gà',
        cuisine_type: 'Vietnamese',
        cooking_method: 'stir-fry',
        meal_type: 'lunch',
        min_rating: 4.0
      });

      // Verify all filters are applied
      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringMatching(/cuisine_type.*cooking_method.*meal_type/),
          ExpressionAttributeValues: expect.objectContaining({
            ':cuisine_type': 'Vietnamese',
            ':cooking_method': 'stir-fry',
            ':meal_type': 'lunch',
            ':min_rating': 4.0,
            ':max_prep_time': 20,
            ':difficulty_level': 'easy'
          })
        })
      );
    });

    it('should return empty results when no recipes match', async () => {
      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: [],
        Count: 0
      });

      const result = await RecipeService.searchRecipes({
        q: 'nonexistent dish'
      });

      expect(result.recipes).toHaveLength(0);
      expect(result.total_count).toBe(0);
      expect(result.has_more).toBe(false);
    });

    it('should search in both title and description fields', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Gà xào cà chua',
          description: 'Món gà ngon với cà chua tươi',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        },
        {
          recipe_id: 'recipe-2',
          title: 'Cá kho tộ',
          description: 'Món gà truyền thống', // Contains 'gà' in description
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-21T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 2
      });

      await RecipeService.searchRecipes({ q: 'gà' });

      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringContaining('(contains(#title, :search) OR contains(#description, :search))'),
          ExpressionAttributeNames: expect.objectContaining({
            '#title': 'title',
            '#description': 'description'
          }),
          ExpressionAttributeValues: expect.objectContaining({
            ':search': 'gà'
          })
        })
      );
    });

    it('should handle case-insensitive search', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Gà Xào Cà Chua',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      await RecipeService.searchRecipes({ q: 'GÀ XÀO' });

      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({
            ':search': 'gà xào' // Should be converted to lowercase
          })
        })
      );
    });

    it('should filter out non-recipe entities', async () => {
      const mockItems = [
        {
          recipe_id: 'recipe-1',
          title: 'Valid Recipe',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        },
        {
          id: 'other-1',
          title: 'Not a recipe',
          entity_type: 'user_profile'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockItems,
        Count: 2
      });

      await RecipeService.searchRecipes({});

      expect(DynamoDBHelper.scan).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: expect.stringContaining('entity_type = :entity_type'),
          ExpressionAttributeValues: expect.objectContaining({
            ':entity_type': 'recipe_metadata'
          })
        })
      );
    });

    it('should validate search filtering logic accuracy', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Vietnamese Pho',
          cuisine_type: 'Vietnamese',
          cooking_method: 'boiling',
          meal_type: 'lunch',
          difficulty_level: 'medium',
          average_rating: 4.5,
          prep_time_minutes: 30,
          cook_time_minutes: 120,
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
        },
        {
          recipe_id: 'recipe-2',
          title: 'Italian Pasta',
          cuisine_type: 'Italian',
          cooking_method: 'boiling',
          meal_type: 'dinner',
          difficulty_level: 'easy',
          average_rating: 4.0,
          prep_time_minutes: 10,
          cook_time_minutes: 15,
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-21T10:00:00Z'
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 2
      });

      // Test multiple filters work together correctly
      await RecipeService.searchRecipes({
        cuisine_type: 'Vietnamese',
        cooking_method: 'boiling',
        meal_type: 'lunch',
        min_rating: 4.0,
        max_prep_time: 60,
        difficulty_level: 'medium'
      });

      const scanCall = (DynamoDBHelper.scan as jest.Mock).mock.calls[0][0];
      
      // Verify all filters are present in the expression
      expect(scanCall.FilterExpression).toContain('cuisine_type = :cuisine_type');
      expect(scanCall.FilterExpression).toContain('cooking_method = :cooking_method');
      expect(scanCall.FilterExpression).toContain('meal_type = :meal_type');
      expect(scanCall.FilterExpression).toContain('average_rating >= :min_rating');
      expect(scanCall.FilterExpression).toContain('prep_time_minutes <= :max_prep_time');
      expect(scanCall.FilterExpression).toContain('difficulty_level = :difficulty_level');
      
      // Verify all filter values are correct
      expect(scanCall.ExpressionAttributeValues).toMatchObject({
        ':cuisine_type': 'Vietnamese',
        ':cooking_method': 'boiling',
        ':meal_type': 'lunch',
        ':min_rating': 4.0,
        ':max_prep_time': 60,
        ':difficulty_level': 'medium'
      });
    });

    it('should handle missing optional fields in filtering', async () => {
      const mockRecipes = [
        {
          recipe_id: 'recipe-1',
          title: 'Simple Recipe',
          is_approved: true,
          entity_type: 'recipe_metadata',
          created_at: '2025-01-20T10:00:00Z'
          // Missing prep_time_minutes, cook_time_minutes, average_rating
        }
      ];

      (DynamoDBHelper.scan as jest.Mock).mockResolvedValue({
        Items: mockRecipes,
        Count: 1
      });

      await RecipeService.searchRecipes({
        max_prep_time: 30,
        max_cook_time: 60
      });

      const scanCall = (DynamoDBHelper.scan as jest.Mock).mock.calls[0][0];
      
      // Should use attribute_not_exists for optional fields
      expect(scanCall.FilterExpression).toContain('(attribute_not_exists(prep_time_minutes) OR prep_time_minutes <= :max_prep_time)');
      expect(scanCall.FilterExpression).toContain('(attribute_not_exists(cook_time_minutes) OR cook_time_minutes <= :max_cook_time)');
    });
  });
});
