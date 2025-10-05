import { RatingService } from './rating-service';
import { DynamoDBHelper } from '../shared/dynamodb';
import { AppError } from '../shared/responses';

// Mock DynamoDB helper
jest.mock('../shared/dynamodb');

describe('RatingService', () => {
  let mockGet: jest.Mock;
  let mockPut: jest.Mock;
  let mockQuery: jest.Mock;
  let mockUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGet = jest.fn();
    mockPut = jest.fn();
    mockQuery = jest.fn();
    mockUpdate = jest.fn();

    // Mock static methods
    (DynamoDBHelper.get as jest.Mock) = mockGet;
    (DynamoDBHelper.put as jest.Mock) = mockPut;
    (DynamoDBHelper.query as jest.Mock) = mockQuery;
    (DynamoDBHelper.update as jest.Mock) = mockUpdate;
  });

  describe('submitRating', () => {
    const mockRecipe = {
      recipe_id: 'recipe-123',
      user_id: 'owner-123',
      title: 'Test Recipe',
      is_approved: false,
      average_rating: 0,
      rating_count: 0,
    };

    it('should submit rating successfully', async () => {
      mockGet
        .mockResolvedValueOnce(mockRecipe) // getRecipeById
        .mockResolvedValueOnce({ // verifyUserCookedRecipe
          recipe_id: 'recipe-123',
          status: 'completed',
        });

      mockQuery
        .mockResolvedValueOnce({ // getUserRatingForRecipe
          Items: [],
          Count: 0,
          LastEvaluatedKey: undefined,
        })
        .mockResolvedValueOnce({ // calculateAverageRating
          Items: [{ rating: 4 }],
          Count: 1,
          LastEvaluatedKey: undefined,
        });

      mockPut.mockResolvedValue({});
      mockUpdate.mockResolvedValue({});

      const result = await RatingService.submitRating({
        recipeId: 'recipe-123',
        userId: 'user-123',
        rating: 4,
        comment: 'Good recipe',
        historyId: 'history-123',
      });

      expect(result.rating.rating).toBe(4);
      expect(result.rating.comment).toBe('Good recipe');
      expect(result.rating.is_verified_cook).toBe(true);
      expect(result.average_rating).toBe(4);
      expect(result.rating_count).toBe(1);
      expect(result.auto_approved).toBe(false);
      expect(mockPut).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should trigger auto-approval when threshold is met', async () => {
      mockGet.mockResolvedValueOnce(mockRecipe);

      mockQuery
        .mockResolvedValueOnce({ // getUserRatingForRecipe
          Items: [],
          Count: 0,
          LastEvaluatedKey: undefined,
        })
        .mockResolvedValueOnce({ // calculateAverageRating
          Items: [
            { rating: 4 },
            { rating: 5 },
            { rating: 4 },
          ],
          Count: 3,
          LastEvaluatedKey: undefined,
        });

      mockPut.mockResolvedValue({});
      mockUpdate.mockResolvedValue({});

      const result = await RatingService.submitRating({
        recipeId: 'recipe-123',
        userId: 'user-123',
        rating: 4,
      });

      expect(result.auto_approved).toBe(true);
      expect(result.average_rating).toBe(4.33);
      expect(result.rating_count).toBe(3);
      expect(result.message).toContain('auto-approved');

      // Verify auto-approval update was called
      expect(mockUpdate).toHaveBeenCalledWith(
        'RECIPE#recipe-123',
        'METADATA',
        expect.stringContaining('is_approved'),
        expect.any(Object)
      );

      // Verify notification was sent
      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'NOTIFICATION',
          type: 'recipe_approved',
        })
      );
    });

    it('should not auto-approve if rating count is below threshold', async () => {
      mockGet.mockResolvedValueOnce(mockRecipe);

      mockQuery
        .mockResolvedValueOnce({ // getUserRatingForRecipe
          Items: [],
          Count: 0,
          LastEvaluatedKey: undefined,
        })
        .mockResolvedValueOnce({ // calculateAverageRating
          Items: [
            { rating: 5 },
            { rating: 5 },
          ],
          Count: 2,
          LastEvaluatedKey: undefined,
        });

      mockPut.mockResolvedValue({});
      mockUpdate.mockResolvedValue({});

      const result = await RatingService.submitRating({
        recipeId: 'recipe-123',
        userId: 'user-123',
        rating: 5,
      });

      expect(result.auto_approved).toBe(false);
      expect(result.average_rating).toBe(5);
      expect(result.rating_count).toBe(2);
    });

    it('should not auto-approve if average rating is below 4.0', async () => {
      mockGet.mockResolvedValueOnce(mockRecipe);

      mockQuery
        .mockResolvedValueOnce({ // getUserRatingForRecipe
          Items: [],
          Count: 0,
          LastEvaluatedKey: undefined,
        })
        .mockResolvedValueOnce({ // calculateAverageRating
          Items: [
            { rating: 3 },
            { rating: 4 },
            { rating: 3 },
          ],
          Count: 3,
          LastEvaluatedKey: undefined,
        });

      mockPut.mockResolvedValue({});
      mockUpdate.mockResolvedValue({});

      const result = await RatingService.submitRating({
        recipeId: 'recipe-123',
        userId: 'user-123',
        rating: 3,
      });

      expect(result.auto_approved).toBe(false);
      expect(result.average_rating).toBe(3.33);
      expect(result.rating_count).toBe(3);
    });

    it('should throw error if recipe not found', async () => {
      mockGet.mockResolvedValue(null);

      await expect(
        RatingService.submitRating({
          recipeId: 'nonexistent',
          userId: 'user-123',
          rating: 5,
        })
      ).rejects.toThrow(AppError);

      await expect(
        RatingService.submitRating({
          recipeId: 'nonexistent',
          userId: 'user-123',
          rating: 5,
        })
      ).rejects.toThrow('Recipe not found');
    });

    it('should throw error if user already rated the recipe', async () => {
      mockGet.mockResolvedValueOnce(mockRecipe);

      mockQuery.mockResolvedValue({
        Items: [
          {
            rating_id: 'existing-rating',
            recipe_id: 'recipe-123',
            user_id: 'user-123',
            rating: 4,
          },
        ],
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      await expect(
        RatingService.submitRating({
          recipeId: 'recipe-123',
          userId: 'user-123',
          rating: 5,
        })
      ).rejects.toThrow('You have already rated this recipe');
    });

    it('should set is_verified_cook to false if no history_id provided', async () => {
      mockGet.mockResolvedValueOnce(mockRecipe);

      mockQuery
        .mockResolvedValueOnce({ // getUserRatingForRecipe
          Items: [],
          Count: 0,
          LastEvaluatedKey: undefined,
        })
        .mockResolvedValueOnce({ // calculateAverageRating
          Items: [{ rating: 5 }],
          Count: 1,
          LastEvaluatedKey: undefined,
        });

      mockPut.mockResolvedValue({});
      mockUpdate.mockResolvedValue({});

      const result = await RatingService.submitRating({
        recipeId: 'recipe-123',
        userId: 'user-123',
        rating: 5,
      });

      expect(result.rating.is_verified_cook).toBe(false);
    });
  });

  describe('getRecipeRatings', () => {
    it('should get ratings for a recipe', async () => {
      const mockRecipe = {
        recipe_id: 'recipe-123',
        average_rating: 4.5,
        rating_count: 10,
      };

      mockGet.mockResolvedValue(mockRecipe);
      mockQuery.mockResolvedValue({
        Items: [
          { rating_id: 'r1', rating: 5 },
          { rating_id: 'r2', rating: 4 },
        ],
        Count: 2,
        LastEvaluatedKey: undefined,
      });

      const result = await RatingService.getRecipeRatings('recipe-123');

      expect(result.average_rating).toBe(4.5);
      expect(result.rating_count).toBe(10);
      expect(result.ratings).toHaveLength(2);
      expect(result.last_evaluated_key).toBeUndefined();
    });

    it('should support pagination', async () => {
      const mockRecipe = {
        recipe_id: 'recipe-123',
        average_rating: 4.5,
        rating_count: 10,
      };

      const mockLastKey = { PK: 'RECIPE#recipe-123', SK: 'RATING#2025-01-20' };

      mockGet.mockResolvedValue(mockRecipe);
      mockQuery.mockResolvedValue({
        Items: [{ rating_id: 'r1', rating: 5 }],
        Count: 1,
        LastEvaluatedKey: mockLastKey,
      });

      const result = await RatingService.getRecipeRatings('recipe-123', 10, 'eyJQSyI6IlJFQ0lQRSNyZWNpcGUtMTIzIiwiU0siOiJSQVRJTkcjMjAyNS0wMS0yMCJ9');

      expect(result.last_evaluated_key).toBeDefined();
    });

    it('should throw error if recipe not found', async () => {
      mockGet.mockResolvedValue(null);

      await expect(
        RatingService.getRecipeRatings('nonexistent')
      ).rejects.toThrow('Recipe not found');
    });
  });

  describe('getUserRatings', () => {
    it('should get all ratings by a user', async () => {
      mockQuery.mockResolvedValue({
        Items: [
          { rating_id: 'r1', recipe_id: 'recipe-1', rating: 5 },
          { rating_id: 'r2', recipe_id: 'recipe-2', rating: 4 },
        ],
        Count: 2,
        LastEvaluatedKey: undefined,
      });

      const result = await RatingService.getUserRatings('user-123');

      expect(result.ratings).toHaveLength(2);
      expect(result.last_evaluated_key).toBeUndefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          IndexName: 'GSI1',
          KeyConditionExpression: expect.stringContaining('GSI1PK'),
        })
      );
    });

    it('should support pagination', async () => {
      const mockLastKey = { GSI1PK: 'USER#user-123', GSI1SK: 'RATING#2025-01-20' };

      mockQuery.mockResolvedValue({
        Items: [{ rating_id: 'r1', rating: 5 }],
        Count: 1,
        LastEvaluatedKey: mockLastKey,
      });

      const result = await RatingService.getUserRatings('user-123', 5, 'eyJzdGFydCI6ImtleSJ9');

      expect(result.last_evaluated_key).toBeDefined();
    });
  });
});
