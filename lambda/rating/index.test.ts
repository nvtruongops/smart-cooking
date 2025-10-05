import { handler } from './index';
import { RatingService } from './rating-service';
import { APIGatewayEvent } from '../shared/types';

// Mock the RatingService
jest.mock('./rating-service');
const mockRatingService = RatingService as jest.Mocked<typeof RatingService>;

describe('Rating Lambda Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockEvent = (overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent => ({
    httpMethod: 'POST',
    path: '/ratings',
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    body: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: {
          sub: 'test-user-id',
          email: 'test@example.com',
          username: 'testuser',
        },
      },
    },
    multiValueHeaders: undefined,
    multiValueQueryStringParameters: undefined,
    stageVariables: null,
    isBase64Encoded: false,
    resource: '/ratings',
    ...overrides,
  });

  describe('Submit Rating', () => {
    it('should submit rating successfully', async () => {
      const mockResult = {
        rating: {
          rating_id: 'rating-123',
          recipe_id: 'recipe-123',
          user_id: 'test-user-id',
          rating: 5,
          comment: 'Excellent!',
          is_verified_cook: true,
          created_at: '2025-01-20T10:00:00Z',
          updated_at: '2025-01-20T10:00:00Z',
        },
        average_rating: 4.5,
        rating_count: 10,
        auto_approved: false,
        message: 'Rating submitted successfully',
      };

      mockRatingService.submitRating.mockResolvedValue(mockResult);

      const event = createMockEvent({
        body: JSON.stringify({
          recipe_id: 'recipe-123',
          rating: 5,
          comment: 'Excellent!',
          history_id: 'history-123',
        }),
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(201);
      expect(body.success).toBe(true);
      expect(body.average_rating).toBe(4.5);
      expect(body.rating_count).toBe(10);
      expect(body.auto_approved).toBe(false);
      expect(mockRatingService.submitRating).toHaveBeenCalledWith({
        recipeId: 'recipe-123',
        userId: 'test-user-id',
        rating: 5,
        comment: 'Excellent!',
        historyId: 'history-123',
      });
    });

    it('should trigger auto-approval when threshold met', async () => {
      const mockResult = {
        rating: {
          rating_id: 'rating-123',
          recipe_id: 'recipe-123',
          user_id: 'test-user-id',
          rating: 5,
          is_verified_cook: true,
          created_at: '2025-01-20T10:00:00Z',
          updated_at: '2025-01-20T10:00:00Z',
        },
        average_rating: 4.2,
        rating_count: 3,
        auto_approved: true,
        message: 'Rating submitted successfully. Recipe auto-approved with average rating of 4.20!',
      };

      mockRatingService.submitRating.mockResolvedValue(mockResult);

      const event = createMockEvent({
        body: JSON.stringify({
          recipe_id: 'recipe-123',
          rating: 5,
        }),
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(201);
      expect(body.auto_approved).toBe(true);
      expect(body.average_rating).toBe(4.2);
      expect(body.rating_count).toBe(3);
      expect(body.message).toContain('auto-approved');
    });

    it('should return 400 if rating is missing', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          recipe_id: 'recipe-123',
        }),
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Rating must be between 1 and 5');
    });

    it('should return 400 if rating is out of range', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          recipe_id: 'recipe-123',
          rating: 6,
        }),
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Rating must be between 1 and 5');
    });

    it('should return 400 if recipe_id is missing', async () => {
      const event = createMockEvent({
        body: JSON.stringify({
          rating: 5,
        }),
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Recipe ID is required');
    });

    it('should return 400 if request body is missing', async () => {
      const event = createMockEvent({
        body: null,
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Request body is required');
    });
  });

  describe('Get Recipe Ratings', () => {
    it('should get ratings for a recipe', async () => {
      const mockRatings = {
        average_rating: 4.5,
        rating_count: 10,
        ratings: [
          {
            rating_id: 'rating-1',
            recipe_id: 'recipe-123',
            user_id: 'user-1',
            rating: 5,
            comment: 'Great!',
            is_verified_cook: true,
            created_at: '2025-01-20T10:00:00Z',
            updated_at: '2025-01-20T10:00:00Z',
          },
          {
            rating_id: 'rating-2',
            recipe_id: 'recipe-123',
            user_id: 'user-2',
            rating: 4,
            is_verified_cook: false,
            created_at: '2025-01-19T10:00:00Z',
            updated_at: '2025-01-19T10:00:00Z',
          },
        ],
        last_evaluated_key: undefined,
      };

      mockRatingService.getRecipeRatings.mockResolvedValue(mockRatings);

      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/ratings/recipe-123',
        pathParameters: { recipeId: 'recipe-123' },
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.recipe_id).toBe('recipe-123');
      expect(body.average_rating).toBe(4.5);
      expect(body.rating_count).toBe(10);
      expect(body.ratings).toHaveLength(2);
      expect(mockRatingService.getRecipeRatings).toHaveBeenCalledWith('recipe-123', 20, undefined);
    });

    it('should support pagination', async () => {
      const mockRatings = {
        average_rating: 4.5,
        rating_count: 10,
        ratings: [],
        last_evaluated_key: 'encoded-key',
      };

      mockRatingService.getRecipeRatings.mockResolvedValue(mockRatings);

      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/ratings/recipe-123',
        pathParameters: { recipeId: 'recipe-123' },
        queryStringParameters: {
          limit: '10',
          start_key: 'start-key',
        },
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.last_evaluated_key).toBe('encoded-key');
      expect(mockRatingService.getRecipeRatings).toHaveBeenCalledWith('recipe-123', 10, 'start-key');
    });

    it('should return 400 if recipe_id is missing', async () => {
      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/ratings/',
        pathParameters: null,
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Get User Ratings', () => {
    it('should get ratings for a user', async () => {
      const mockRatings = {
        ratings: [
          {
            rating_id: 'rating-1',
            recipe_id: 'recipe-1',
            user_id: 'test-user-id',
            rating: 5,
            created_at: '2025-01-20T10:00:00Z',
            updated_at: '2025-01-20T10:00:00Z',
          },
        ],
        last_evaluated_key: undefined,
      };

      mockRatingService.getUserRatings.mockResolvedValue(mockRatings);

      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/ratings/user/test-user-id',
        pathParameters: { userId: 'test-user-id' },
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.user_id).toBe('test-user-id');
      expect(body.ratings).toHaveLength(1);
      expect(mockRatingService.getUserRatings).toHaveBeenCalledWith('test-user-id', 20, undefined);
    });
  });

  describe('Error Handling', () => {
    it('should return 401 if user is not authenticated', async () => {
      const event = createMockEvent({
        requestContext: {
          requestId: 'test-request-id',
        },
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(response.body).toContain('User is not authenticated');
    });

    it('should return 404 for unknown endpoint', async () => {
      const event = createMockEvent({
        httpMethod: 'GET',
        path: '/unknown',
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(response.body).toContain('Endpoint not found');
    });

    it('should handle service errors', async () => {
      mockRatingService.submitRating.mockRejectedValue(new Error('Database error'));

      const event = createMockEvent({
        body: JSON.stringify({
          recipe_id: 'recipe-123',
          rating: 5,
        }),
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(500);
    });
  });
});
