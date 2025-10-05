/**
 * Unit tests for Cooking Session Service
 * Tests cooking session lifecycle, rating calculation, auto-approval logic, and favorites functionality
 */

import { CookingSessionService } from './cooking-session-service';
import { DynamoDBHelper } from '../shared/dynamodb';
import { AppError } from '../shared/responses';
import { generateUUID, formatTimestamp, validateRating } from '../shared/utils';
import {
  CookingSession,
  CookingSessionDynamoItem,
  FavoriteRecipeDynamoItem,
  StartCookingRequest,
  CompleteCookingRequest,
  UpdateCookingStatusRequest,
  GetCookingHistoryRequest,
  ToggleFavoriteRequest,
  GetFavoritesRequest
} from './types';

// Mock dependencies
jest.mock('../shared/dynamodb');
jest.mock('../shared/utils', () => ({
  ...jest.requireActual('../shared/utils'),
  generateUUID: jest.fn(),
  formatTimestamp: jest.fn(),
  validateRating: jest.fn(),
  logStructured: jest.fn()
}));

const mockDynamoDBHelper = DynamoDBHelper as jest.Mocked<typeof DynamoDBHelper>;
const mockGenerateUUID = generateUUID as jest.MockedFunction<typeof generateUUID>;
const mockFormatTimestamp = formatTimestamp as jest.MockedFunction<typeof formatTimestamp>;
const mockValidateRating = validateRating as jest.MockedFunction<typeof validateRating>;

describe('CookingSessionService', () => {
  const mockUserId = 'test-user-123';
  const mockRecipeId = 'test-recipe-456';
  const mockSessionId = 'test-session-789';
  const mockTimestamp = '2025-01-20T10:00:00.000Z';
  const mockLaterTimestamp = '2025-01-20T11:00:00.000Z';

  const mockRecipe = {
    recipe_id: mockRecipeId,
    title: 'Test Recipe',
    description: 'A delicious test recipe',
    user_id: 'recipe-owner-123',
    is_approved: false,
    average_rating: 0,
    rating_count: 0
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateUUID.mockReturnValue(mockSessionId);
    mockFormatTimestamp.mockReturnValue(mockTimestamp);
    mockValidateRating.mockReturnValue(true);
  });

  describe('Cooking Session Lifecycle', () => {
    describe('startCooking', () => {
      it('should start a new cooking session successfully', async () => {
        mockDynamoDBHelper.getRecipe.mockResolvedValue(mockRecipe);
        mockDynamoDBHelper.put.mockResolvedValue({} as any);

        const request: StartCookingRequest = {
          user_id: mockUserId,
          recipe_id: mockRecipeId,
          recipe_title: 'Test Recipe'
        };

        const result = await CookingSessionService.startCooking(mockUserId, request);

        expect(result).toEqual({
          session_id: mockSessionId,
          user_id: mockUserId,
          recipe_id: mockRecipeId,
          recipe_title: 'Test Recipe',
          status: 'cooking',
          started_at: mockTimestamp,
          created_at: mockTimestamp,
          updated_at: mockTimestamp
        });

        expect(mockDynamoDBHelper.getRecipe).toHaveBeenCalledWith(mockRecipeId);
        expect(mockDynamoDBHelper.put).toHaveBeenCalledWith({
          PK: `USER#${mockUserId}`,
          SK: `SESSION#${mockTimestamp}#${mockSessionId}`,
          GSI1PK: `SESSION#${mockSessionId}`,
          GSI1SK: `STATUS#cooking#${mockTimestamp}`,
          GSI2PK: `RECIPE#${mockRecipeId}`,
          GSI2SK: `USER#${mockUserId}#${mockTimestamp}`,
          EntityType: 'CookingSession',
          session_id: mockSessionId,
          user_id: mockUserId,
          recipe_id: mockRecipeId,
          recipe_title: 'Test Recipe',
          status: 'cooking',
          started_at: mockTimestamp,
          created_at: mockTimestamp,
          updated_at: mockTimestamp
        });
      });

      it('should use recipe title from database if not provided', async () => {
        mockDynamoDBHelper.getRecipe.mockResolvedValue(mockRecipe);
        mockDynamoDBHelper.put.mockResolvedValue({} as any);

        const request: StartCookingRequest = {
          user_id: mockUserId,
          recipe_id: mockRecipeId
        };

        const result = await CookingSessionService.startCooking(mockUserId, request);

        expect(result.recipe_title).toBe('Test Recipe');
        expect(mockDynamoDBHelper.put).toHaveBeenCalledWith(
          expect.objectContaining({
            recipe_title: 'Test Recipe'
          })
        );
      });

      it('should throw error if recipe not found', async () => {
        mockDynamoDBHelper.getRecipe.mockResolvedValue(undefined);

        const request: StartCookingRequest = {
          user_id: mockUserId,
          recipe_id: 'non-existent-recipe'
        };

        await expect(CookingSessionService.startCooking(mockUserId, request))
          .rejects.toThrow(AppError);
        
        await expect(CookingSessionService.startCooking(mockUserId, request))
          .rejects.toThrow('Recipe not found');
      });
    });

    describe('completeCooking', () => {
      const mockExistingSession: CookingSessionDynamoItem = {
        PK: `USER#${mockUserId}`,
        SK: `SESSION#${mockTimestamp}#${mockSessionId}`,
        GSI1PK: `SESSION#${mockSessionId}`,
        GSI1SK: `STATUS#cooking#${mockTimestamp}`,
        GSI2PK: `RECIPE#${mockRecipeId}`,
        GSI2SK: `USER#${mockUserId}#${mockTimestamp}`,
        EntityType: 'CookingSession',
        session_id: mockSessionId,
        user_id: mockUserId,
        recipe_id: mockRecipeId,
        recipe_title: 'Test Recipe',
        status: 'cooking',
        started_at: mockTimestamp,
        created_at: mockTimestamp,
        updated_at: mockTimestamp
      };

      beforeEach(() => {
        mockFormatTimestamp.mockReturnValue(mockLaterTimestamp);
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [mockExistingSession],
          Count: 1,
          LastEvaluatedKey: undefined
        });
      });

      it('should complete cooking session with rating and review', async () => {
        const updatedSession = {
          ...mockExistingSession,
          status: 'completed',
          completed_at: mockLaterTimestamp,
          cooking_duration_minutes: 60,
          rating: 5,
          review: 'Excellent recipe!',
          notes: 'Added extra spices',
          updated_at: mockLaterTimestamp
        };

        mockDynamoDBHelper.update.mockResolvedValue(updatedSession);

        const request: CompleteCookingRequest = {
          user_id: mockUserId,
          session_id: mockSessionId,
          rating: 5,
          review: 'Excellent recipe!',
          notes: 'Added extra spices'
        };

        const result = await CookingSessionService.completeCooking(mockUserId, request);

        expect(result).toEqual({
          session_id: mockSessionId,
          user_id: mockUserId,
          recipe_id: mockRecipeId,
          recipe_title: 'Test Recipe',
          status: 'completed',
          started_at: mockTimestamp,
          completed_at: mockLaterTimestamp,
          cooking_duration_minutes: 60,
          rating: 5,
          review: 'Excellent recipe!',
          notes: 'Added extra spices',
          created_at: mockTimestamp,
          updated_at: mockLaterTimestamp
        });

        expect(mockDynamoDBHelper.update).toHaveBeenCalledWith(
          `USER#${mockUserId}`,
          `SESSION#${mockTimestamp}#${mockSessionId}`,
          expect.stringContaining('SET #status = :status'),
          expect.objectContaining({
            ':status': 'completed',
            ':completed_at': mockLaterTimestamp,
            ':duration': 60,
            ':updated_at': mockLaterTimestamp,
            ':gsi1sk': `STATUS#completed#${mockLaterTimestamp}`,
            ':rating': 5,
            ':review': 'Excellent recipe!',
            ':notes': 'Added extra spices'
          }),
          { '#status': 'status' }
        );
      });

      it('should complete cooking session without optional fields', async () => {
        const updatedSession = {
          ...mockExistingSession,
          status: 'completed',
          completed_at: mockLaterTimestamp,
          cooking_duration_minutes: 60,
          updated_at: mockLaterTimestamp
        };

        mockDynamoDBHelper.update.mockResolvedValue(updatedSession);

        const request: CompleteCookingRequest = {
          user_id: mockUserId,
          session_id: mockSessionId
        };

        const result = await CookingSessionService.completeCooking(mockUserId, request);

        expect(result.status).toBe('completed');
        expect(result.cooking_duration_minutes).toBe(60);
        expect(result.rating).toBeUndefined();
        expect(result.review).toBeUndefined();
        expect(result.notes).toBeUndefined();
      });

      it('should calculate cooking duration correctly', async () => {
        // Mock different start time (9:00 AM) and completion time (11:30 AM) = 150 minutes
        const startTime = '2025-01-20T09:00:00.000Z';
        const endTime = '2025-01-20T11:30:00.000Z';
        
        const sessionWithEarlierStart = {
          ...mockExistingSession,
          started_at: startTime
        };

        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [sessionWithEarlierStart],
          Count: 1,
          LastEvaluatedKey: undefined
        });

        mockFormatTimestamp.mockReturnValue(endTime);

        const updatedSession = {
          ...sessionWithEarlierStart,
          status: 'completed',
          completed_at: endTime,
          cooking_duration_minutes: 150,
          updated_at: endTime
        };

        mockDynamoDBHelper.update.mockResolvedValue(updatedSession);

        const request: CompleteCookingRequest = {
          user_id: mockUserId,
          session_id: mockSessionId
        };

        const result = await CookingSessionService.completeCooking(mockUserId, request);

        expect(result.cooking_duration_minutes).toBe(150);
        expect(mockDynamoDBHelper.update).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            ':duration': 150
          }),
          expect.any(Object)
        );
      });

      it('should throw error for invalid rating', async () => {
        mockValidateRating.mockReturnValue(false);

        const request: CompleteCookingRequest = {
          user_id: mockUserId,
          session_id: mockSessionId,
          rating: 6 // Invalid rating
        };

        await expect(CookingSessionService.completeCooking(mockUserId, request))
          .rejects.toThrow(AppError);
        
        await expect(CookingSessionService.completeCooking(mockUserId, request))
          .rejects.toThrow('Rating must be between 1 and 5');
      });

      it('should throw error if user tries to complete another user\'s session', async () => {
        const otherUserSession = {
          ...mockExistingSession,
          user_id: 'other-user-123'
        };

        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [otherUserSession],
          Count: 1,
          LastEvaluatedKey: undefined
        });

        const request: CompleteCookingRequest = {
          user_id: mockUserId,
          session_id: mockSessionId
        };

        await expect(CookingSessionService.completeCooking(mockUserId, request))
          .rejects.toThrow(AppError);
        
        await expect(CookingSessionService.completeCooking(mockUserId, request))
          .rejects.toThrow('You can only complete your own cooking sessions');
      });

      it('should throw error if session is already completed', async () => {
        const completedSession = {
          ...mockExistingSession,
          status: 'completed' as const
        };

        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [completedSession],
          Count: 1,
          LastEvaluatedKey: undefined
        });

        const request: CompleteCookingRequest = {
          user_id: mockUserId,
          session_id: mockSessionId
        };

        await expect(CookingSessionService.completeCooking(mockUserId, request))
          .rejects.toThrow(AppError);
        
        await expect(CookingSessionService.completeCooking(mockUserId, request))
          .rejects.toThrow('Cooking session is already completed');
      });

      it('should throw error if session not found', async () => {
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [],
          Count: 0,
          LastEvaluatedKey: undefined
        });

        const request: CompleteCookingRequest = {
          user_id: mockUserId,
          session_id: 'non-existent-session'
        };

        await expect(CookingSessionService.completeCooking(mockUserId, request))
          .rejects.toThrow(AppError);
        
        await expect(CookingSessionService.completeCooking(mockUserId, request))
          .rejects.toThrow('Cooking session not found');
      });
    });

    describe('updateCookingStatus', () => {
      const mockExistingSession: CookingSessionDynamoItem = {
        PK: `USER#${mockUserId}`,
        SK: `SESSION#${mockTimestamp}#${mockSessionId}`,
        GSI1PK: `SESSION#${mockSessionId}`,
        GSI1SK: `STATUS#cooking#${mockTimestamp}`,
        GSI2PK: `RECIPE#${mockRecipeId}`,
        GSI2SK: `USER#${mockUserId}#${mockTimestamp}`,
        EntityType: 'CookingSession',
        session_id: mockSessionId,
        user_id: mockUserId,
        recipe_id: mockRecipeId,
        recipe_title: 'Test Recipe',
        status: 'cooking',
        started_at: mockTimestamp,
        created_at: mockTimestamp,
        updated_at: mockTimestamp
      };

      beforeEach(() => {
        mockFormatTimestamp.mockReturnValue(mockLaterTimestamp);
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [mockExistingSession],
          Count: 1,
          LastEvaluatedKey: undefined
        });
      });

      it('should update status to completed with duration calculation', async () => {
        const updatedSession = {
          ...mockExistingSession,
          status: 'completed',
          completed_at: mockLaterTimestamp,
          cooking_duration_minutes: 60,
          updated_at: mockLaterTimestamp
        };

        mockDynamoDBHelper.update.mockResolvedValue(updatedSession);

        const request: UpdateCookingStatusRequest = {
          user_id: mockUserId,
          session_id: mockSessionId,
          status: 'completed'
        };

        const result = await CookingSessionService.updateCookingStatus(mockUserId, request);

        expect(result.status).toBe('completed');
        expect(result.cooking_duration_minutes).toBe(60);
        expect(result.completed_at).toBe(mockLaterTimestamp);

        expect(mockDynamoDBHelper.update).toHaveBeenCalledWith(
          `USER#${mockUserId}`,
          `SESSION#${mockTimestamp}#${mockSessionId}`,
          expect.stringContaining('SET #status = :status'),
          expect.objectContaining({
            ':status': 'completed',
            ':updated_at': mockLaterTimestamp,
            ':gsi1sk': `STATUS#completed#${mockLaterTimestamp}`,
            ':duration': 60,
            ':completed_at': mockLaterTimestamp
          }),
          { '#status': 'status' }
        );
      });

      it('should update status to abandoned with duration calculation', async () => {
        const updatedSession = {
          ...mockExistingSession,
          status: 'abandoned',
          abandoned_at: mockLaterTimestamp,
          cooking_duration_minutes: 60,
          updated_at: mockLaterTimestamp
        };

        mockDynamoDBHelper.update.mockResolvedValue(updatedSession);

        const request: UpdateCookingStatusRequest = {
          user_id: mockUserId,
          session_id: mockSessionId,
          status: 'abandoned',
          notes: 'Ran out of time'
        };

        const result = await CookingSessionService.updateCookingStatus(mockUserId, request);

        expect(result.status).toBe('abandoned');
        expect(result.cooking_duration_minutes).toBe(60);
        expect(result.abandoned_at).toBe(mockLaterTimestamp);

        expect(mockDynamoDBHelper.update).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.stringContaining('SET #status = :status'),
          expect.objectContaining({
            ':status': 'abandoned',
            ':duration': 60,
            ':abandoned_at': mockLaterTimestamp,
            ':notes': 'Ran out of time'
          }),
          expect.any(Object)
        );
      });

      it('should update status to cooking without duration calculation', async () => {
        const updatedSession = {
          ...mockExistingSession,
          status: 'cooking',
          updated_at: mockLaterTimestamp
        };

        mockDynamoDBHelper.update.mockResolvedValue(updatedSession);

        const request: UpdateCookingStatusRequest = {
          user_id: mockUserId,
          session_id: mockSessionId,
          status: 'cooking'
        };

        const result = await CookingSessionService.updateCookingStatus(mockUserId, request);

        expect(result.status).toBe('cooking');
        expect(result.cooking_duration_minutes).toBeUndefined();

        expect(mockDynamoDBHelper.update).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          'SET #status = :status, updated_at = :updated_at, GSI1SK = :gsi1sk',
          expect.objectContaining({
            ':status': 'cooking',
            ':updated_at': mockLaterTimestamp,
            ':gsi1sk': `STATUS#cooking#${mockLaterTimestamp}`
          }),
          { '#status': 'status' }
        );
      });

      it('should include rating and review when provided', async () => {
        const updatedSession = {
          ...mockExistingSession,
          status: 'completed',
          rating: 4,
          review: 'Good recipe',
          updated_at: mockLaterTimestamp
        };

        mockDynamoDBHelper.update.mockResolvedValue(updatedSession);

        const request: UpdateCookingStatusRequest = {
          user_id: mockUserId,
          session_id: mockSessionId,
          status: 'completed',
          rating: 4,
          review: 'Good recipe'
        };

        await CookingSessionService.updateCookingStatus(mockUserId, request);

        expect(mockDynamoDBHelper.update).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.stringContaining(', rating = :rating'),
          expect.objectContaining({
            ':rating': 4,
            ':review': 'Good recipe'
          }),
          expect.any(Object)
        );
      });

      it('should throw error for invalid status', async () => {
        const request: UpdateCookingStatusRequest = {
          user_id: mockUserId,
          session_id: mockSessionId,
          status: 'invalid-status' as any
        };

        await expect(CookingSessionService.updateCookingStatus(mockUserId, request))
          .rejects.toThrow(AppError);
        
        await expect(CookingSessionService.updateCookingStatus(mockUserId, request))
          .rejects.toThrow('Status must be cooking, completed, or abandoned');
      });

      it('should throw error for invalid rating', async () => {
        // Reset the mock to return false for invalid rating
        mockValidateRating.mockReset();
        mockValidateRating.mockReturnValue(false);

        const request: UpdateCookingStatusRequest = {
          user_id: mockUserId,
          session_id: mockSessionId,
          status: 'completed',
          rating: 0 // Invalid rating
        };

        await expect(CookingSessionService.updateCookingStatus(mockUserId, request))
          .rejects.toThrow(AppError);
        
        await expect(CookingSessionService.updateCookingStatus(mockUserId, request))
          .rejects.toThrow('Rating must be between 1 and 5');
      });

      it('should throw error if user tries to update another user\'s session', async () => {
        const otherUserSession = {
          ...mockExistingSession,
          user_id: 'other-user-123'
        };

        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [otherUserSession],
          Count: 1,
          LastEvaluatedKey: undefined
        });

        const request: UpdateCookingStatusRequest = {
          user_id: mockUserId,
          session_id: mockSessionId,
          status: 'completed'
        };

        await expect(CookingSessionService.updateCookingStatus(mockUserId, request))
          .rejects.toThrow(AppError);
        
        await expect(CookingSessionService.updateCookingStatus(mockUserId, request))
          .rejects.toThrow('You can only update your own cooking sessions');
      });
    });
  });

  describe('Cooking History and Filtering', () => {
    const mockSessions = [
      {
        session_id: 'session-1',
        user_id: mockUserId,
        recipe_id: 'recipe-1',
        recipe_title: 'Recipe 1',
        status: 'completed',
        rating: 5,
        started_at: '2025-01-20T10:00:00.000Z',
        completed_at: '2025-01-20T11:00:00.000Z',
        cooking_duration_minutes: 60,
        created_at: '2025-01-20T10:00:00.000Z',
        updated_at: '2025-01-20T11:00:00.000Z'
      },
      {
        session_id: 'session-2',
        user_id: mockUserId,
        recipe_id: 'recipe-2',
        recipe_title: 'Recipe 2',
        status: 'cooking',
        started_at: '2025-01-20T09:00:00.000Z',
        created_at: '2025-01-20T09:00:00.000Z',
        updated_at: '2025-01-20T09:00:00.000Z'
      },
      {
        session_id: 'session-3',
        user_id: mockUserId,
        recipe_id: 'recipe-3',
        recipe_title: 'Recipe 3',
        status: 'abandoned',
        started_at: '2025-01-19T15:00:00.000Z',
        abandoned_at: '2025-01-19T15:30:00.000Z',
        cooking_duration_minutes: 30,
        created_at: '2025-01-19T15:00:00.000Z',
        updated_at: '2025-01-19T15:30:00.000Z'
      }
    ];

    describe('getCookingHistory', () => {
      it('should return cooking history with default parameters', async () => {
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: mockSessions,
          Count: 3,
          LastEvaluatedKey: undefined
        });

        const request: GetCookingHistoryRequest = {
          user_id: mockUserId
        };

        const result = await CookingSessionService.getCookingHistory(mockUserId, request);

        expect(result.sessions).toHaveLength(3);
        expect(result.total_count).toBe(3);
        expect(result.last_evaluated_key).toBeUndefined();
        expect(result.sessions[0].session_id).toBe('session-1');

        expect(mockDynamoDBHelper.query).toHaveBeenCalledWith({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${mockUserId}`,
            ':sk': 'SESSION#'
          },
          ScanIndexForward: false, // Default desc order
          Limit: 20 // Default limit
        });
      });

      it('should filter by status', async () => {
        const completedSessions = [mockSessions[0]];
        
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: completedSessions,
          Count: 1,
          LastEvaluatedKey: undefined
        });

        const request: GetCookingHistoryRequest = {
          user_id: mockUserId,
          status_filter: 'completed'
        };

        const result = await CookingSessionService.getCookingHistory(mockUserId, request);

        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0].status).toBe('completed');

        expect(mockDynamoDBHelper.query).toHaveBeenCalledWith({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${mockUserId}`,
            ':sk': 'SESSION#',
            ':status': 'completed'
          },
          FilterExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ScanIndexForward: false,
          Limit: 20
        });
      });

      it('should filter by recipe ID', async () => {
        const recipe1Sessions = [mockSessions[0]];
        
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: recipe1Sessions,
          Count: 1,
          LastEvaluatedKey: undefined
        });

        const request: GetCookingHistoryRequest = {
          user_id: mockUserId,
          recipe_id_filter: 'recipe-1'
        };

        const result = await CookingSessionService.getCookingHistory(mockUserId, request);

        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0].recipe_id).toBe('recipe-1');

        expect(mockDynamoDBHelper.query).toHaveBeenCalledWith({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${mockUserId}`,
            ':sk': 'SESSION#',
            ':recipe_id': 'recipe-1'
          },
          FilterExpression: 'recipe_id = :recipe_id',
          ScanIndexForward: false,
          Limit: 20,
          ExclusiveStartKey: undefined
        });
      });

      it('should filter by both status and recipe ID', async () => {
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [mockSessions[0]],
          Count: 1,
          LastEvaluatedKey: undefined
        });

        const request: GetCookingHistoryRequest = {
          user_id: mockUserId,
          status_filter: 'completed',
          recipe_id_filter: 'recipe-1'
        };

        await CookingSessionService.getCookingHistory(mockUserId, request);

        expect(mockDynamoDBHelper.query).toHaveBeenCalledWith({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${mockUserId}`,
            ':sk': 'SESSION#',
            ':status': 'completed',
            ':recipe_id': 'recipe-1'
          },
          FilterExpression: '#status = :status AND recipe_id = :recipe_id',
          ExpressionAttributeNames: { '#status': 'status' },
          ScanIndexForward: false,
          Limit: 20
        });
      });

      it('should support ascending sort order', async () => {
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: mockSessions.reverse(),
          Count: 3,
          LastEvaluatedKey: undefined
        });

        const request: GetCookingHistoryRequest = {
          user_id: mockUserId,
          sort_order: 'asc'
        };

        await CookingSessionService.getCookingHistory(mockUserId, request);

        expect(mockDynamoDBHelper.query).toHaveBeenCalledWith(
          expect.objectContaining({
            ScanIndexForward: true
          })
        );
      });

      it('should support custom limit and pagination', async () => {
        const mockLastKey = { PK: `USER#${mockUserId}`, SK: 'SESSION#2025-01-20' };
        
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [mockSessions[0]],
          Count: 1,
          LastEvaluatedKey: mockLastKey
        });

        const request: GetCookingHistoryRequest = {
          user_id: mockUserId,
          limit: 5,
          start_key: JSON.stringify(mockLastKey)
        };

        const result = await CookingSessionService.getCookingHistory(mockUserId, request);

        expect(result.last_evaluated_key).toBe(JSON.stringify(mockLastKey));

        expect(mockDynamoDBHelper.query).toHaveBeenCalledWith(
          expect.objectContaining({
            Limit: 5,
            ExclusiveStartKey: mockLastKey
          })
        );
      });
    });

    describe('getCookingStats', () => {
      const mockFavorites = {
        Items: [
          { recipe_id: 'fav-1' },
          { recipe_id: 'fav-2' },
          { recipe_id: 'fav-3' }
        ],
        Count: 3,
        LastEvaluatedKey: undefined
      };

      it('should calculate cooking statistics correctly', async () => {
        mockDynamoDBHelper.query
          .mockResolvedValueOnce({ // Sessions query
            Items: mockSessions,
            Count: 3,
            LastEvaluatedKey: undefined
          })
          .mockResolvedValueOnce(mockFavorites); // Favorites query

        const result = await CookingSessionService.getCookingStats(mockUserId);

        expect(result).toEqual({
          user_id: mockUserId,
          total_sessions: 3,
          completed_sessions: 1,
          abandoned_sessions: 1,
          total_cooking_time_minutes: 90, // 60 + 30 (both completed and abandoned have duration)
          average_session_duration_minutes: 60, // 60 / 1 completed session (only completed sessions count)
          favorite_recipes_count: 3,
          most_cooked_recipe: {
            recipe_id: 'recipe-1',
            recipe_title: 'Recipe 1',
            times_cooked: 1
          },
          average_rating: 5.0 // Only one rating of 5
        });
      });

      it('should handle user with no sessions', async () => {
        mockDynamoDBHelper.query
          .mockResolvedValueOnce({ // Sessions query
            Items: [],
            Count: 0,
            LastEvaluatedKey: undefined
          })
          .mockResolvedValueOnce({ // Favorites query
            Items: [],
            Count: 0,
            LastEvaluatedKey: undefined
          });

        const result = await CookingSessionService.getCookingStats(mockUserId);

        expect(result).toEqual({
          user_id: mockUserId,
          total_sessions: 0,
          completed_sessions: 0,
          abandoned_sessions: 0,
          total_cooking_time_minutes: 0,
          average_session_duration_minutes: 0,
          favorite_recipes_count: 0,
          most_cooked_recipe: undefined,
          average_rating: undefined
        });
      });

      it('should calculate most cooked recipe correctly with multiple sessions', async () => {
        const sessionsWithDuplicates = [
          ...mockSessions,
          {
            session_id: 'session-4',
            user_id: mockUserId,
            recipe_id: 'recipe-1', // Duplicate recipe
            recipe_title: 'Recipe 1',
            status: 'completed',
            rating: 4,
            cooking_duration_minutes: 45,
            started_at: '2025-01-18T10:00:00.000Z',
            created_at: '2025-01-18T10:00:00.000Z',
            updated_at: '2025-01-18T10:45:00.000Z'
          }
        ];

        mockDynamoDBHelper.query
          .mockResolvedValueOnce({
            Items: sessionsWithDuplicates,
            Count: 4,
            LastEvaluatedKey: undefined
          })
          .mockResolvedValueOnce(mockFavorites);

        const result = await CookingSessionService.getCookingStats(mockUserId);

        expect(result.most_cooked_recipe).toEqual({
          recipe_id: 'recipe-1',
          recipe_title: 'Recipe 1',
          times_cooked: 2 // Two sessions for recipe-1
        });
        expect(result.average_rating).toBe(4.5); // (5 + 4) / 2
      });
    });
  });

  describe('Favorite Recipes Functionality', () => {
    describe('toggleFavorite', () => {
      it('should add recipe to favorites when not already favorited', async () => {
        mockDynamoDBHelper.get.mockResolvedValue(undefined); // Not favorited
        mockDynamoDBHelper.put.mockResolvedValue({} as any);

        const request: ToggleFavoriteRequest = {
          user_id: mockUserId,
          recipe_id: mockRecipeId,
          recipe_title: 'Test Recipe'
        };

        const result = await CookingSessionService.toggleFavorite(mockUserId, request);

        expect(result).toEqual({
          is_favorite: true,
          message: 'Recipe added to favorites'
        });

        expect(mockDynamoDBHelper.get).toHaveBeenCalledWith(
          `USER#${mockUserId}`,
          `FAVORITE#${mockRecipeId}`
        );

        expect(mockDynamoDBHelper.put).toHaveBeenCalledWith({
          PK: `USER#${mockUserId}`,
          SK: `FAVORITE#${mockRecipeId}`,
          GSI1PK: `RECIPE#${mockRecipeId}`,
          GSI1SK: `USER#${mockUserId}`,
          EntityType: 'FavoriteRecipe',
          user_id: mockUserId,
          recipe_id: mockRecipeId,
          recipe_title: 'Test Recipe',
          favorited_at: mockTimestamp,
          times_cooked: 0
        });
      });

      it('should remove recipe from favorites when already favorited', async () => {
        const existingFavorite = {
          user_id: mockUserId,
          recipe_id: mockRecipeId,
          recipe_title: 'Test Recipe',
          favorited_at: mockTimestamp
        };

        mockDynamoDBHelper.get.mockResolvedValue(existingFavorite);
        mockDynamoDBHelper.delete.mockResolvedValue({} as any);

        const request: ToggleFavoriteRequest = {
          user_id: mockUserId,
          recipe_id: mockRecipeId
        };

        const result = await CookingSessionService.toggleFavorite(mockUserId, request);

        expect(result).toEqual({
          is_favorite: false,
          message: 'Recipe removed from favorites'
        });

        expect(mockDynamoDBHelper.delete).toHaveBeenCalledWith(
          `USER#${mockUserId}`,
          `FAVORITE#${mockRecipeId}`
        );
      });

      it('should handle missing recipe title gracefully', async () => {
        mockDynamoDBHelper.get.mockResolvedValue(undefined);
        mockDynamoDBHelper.put.mockResolvedValue({} as any);

        const request: ToggleFavoriteRequest = {
          user_id: mockUserId,
          recipe_id: mockRecipeId
          // No recipe_title provided
        };

        const result = await CookingSessionService.toggleFavorite(mockUserId, request);

        expect(result.is_favorite).toBe(true);
        expect(mockDynamoDBHelper.put).toHaveBeenCalledWith(
          expect.objectContaining({
            recipe_title: undefined
          })
        );
      });
    });

    describe('getFavorites', () => {
      const mockFavorites = [
        {
          user_id: mockUserId,
          recipe_id: 'recipe-1',
          recipe_title: 'Favorite Recipe 1',
          favorited_at: '2025-01-20T10:00:00.000Z',
          times_cooked: 3,
          average_rating: 4.5
        },
        {
          user_id: mockUserId,
          recipe_id: 'recipe-2',
          recipe_title: 'Favorite Recipe 2',
          favorited_at: '2025-01-19T10:00:00.000Z',
          times_cooked: 1,
          last_cooked_at: '2025-01-19T15:00:00.000Z'
        }
      ];

      it('should return user favorites with default parameters', async () => {
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: mockFavorites,
          Count: 2,
          LastEvaluatedKey: undefined
        });

        const request: GetFavoritesRequest = {
          user_id: mockUserId
        };

        const result = await CookingSessionService.getFavorites(mockUserId, request);

        expect(result.favorites).toHaveLength(2);
        expect(result.total_count).toBe(2);
        expect(result.last_evaluated_key).toBeUndefined();
        expect(result.favorites[0].recipe_id).toBe('recipe-1');
        expect(result.favorites[1].recipe_id).toBe('recipe-2');

        expect(mockDynamoDBHelper.query).toHaveBeenCalledWith({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `USER#${mockUserId}`,
            ':sk': 'FAVORITE#'
          },
          ScanIndexForward: false, // Most recent first
          Limit: 20
        });
      });

      it('should support custom limit and pagination', async () => {
        const mockLastKey = { PK: `USER#${mockUserId}`, SK: 'FAVORITE#recipe-1' };
        
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [mockFavorites[0]],
          Count: 1,
          LastEvaluatedKey: mockLastKey
        });

        const request: GetFavoritesRequest = {
          user_id: mockUserId,
          limit: 5,
          start_key: JSON.stringify(mockLastKey)
        };

        const result = await CookingSessionService.getFavorites(mockUserId, request);

        expect(result.favorites).toHaveLength(1);
        expect(result.last_evaluated_key).toBe(JSON.stringify(mockLastKey));

        expect(mockDynamoDBHelper.query).toHaveBeenCalledWith(
          expect.objectContaining({
            Limit: 5,
            ExclusiveStartKey: mockLastKey
          })
        );
      });

      it('should return empty array when user has no favorites', async () => {
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: [],
          Count: 0,
          LastEvaluatedKey: undefined
        });

        const request: GetFavoritesRequest = {
          user_id: mockUserId
        };

        const result = await CookingSessionService.getFavorites(mockUserId, request);

        expect(result.favorites).toHaveLength(0);
        expect(result.total_count).toBe(0);
        expect(result.last_evaluated_key).toBeUndefined();
      });

      it('should transform DynamoDB items to FavoriteRecipe objects correctly', async () => {
        mockDynamoDBHelper.query.mockResolvedValue({
          Items: mockFavorites,
          Count: 2,
          LastEvaluatedKey: undefined
        });

        const request: GetFavoritesRequest = {
          user_id: mockUserId
        };

        const result = await CookingSessionService.getFavorites(mockUserId, request);

        expect(result.favorites[0]).toEqual({
          user_id: mockUserId,
          recipe_id: 'recipe-1',
          recipe_title: 'Favorite Recipe 1',
          favorited_at: '2025-01-20T10:00:00.000Z',
          times_cooked: 3,
          average_rating: 4.5,
          last_cooked_at: undefined
        });

        expect(result.favorites[1]).toEqual({
          user_id: mockUserId,
          recipe_id: 'recipe-2',
          recipe_title: 'Favorite Recipe 2',
          favorited_at: '2025-01-19T10:00:00.000Z',
          times_cooked: 1,
          last_cooked_at: '2025-01-19T15:00:00.000Z',
          average_rating: undefined
        });
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle DynamoDB errors gracefully', async () => {
      mockDynamoDBHelper.getRecipe.mockRejectedValue(new Error('DynamoDB connection error'));

      const request: StartCookingRequest = {
        user_id: mockUserId,
        recipe_id: mockRecipeId
      };

      await expect(CookingSessionService.startCooking(mockUserId, request))
        .rejects.toThrow('DynamoDB connection error');
    });

    it('should handle malformed start_key in pagination', async () => {
      const request: GetCookingHistoryRequest = {
        user_id: mockUserId,
        start_key: 'invalid-json'
      };

      await expect(CookingSessionService.getCookingHistory(mockUserId, request))
        .rejects.toThrow();
    });

    it('should handle empty query results', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined
      });

      const request: GetCookingHistoryRequest = {
        user_id: mockUserId
      };

      const result = await CookingSessionService.getCookingHistory(mockUserId, request);

      expect(result.sessions).toHaveLength(0);
      expect(result.total_count).toBe(0);
    });

    it('should handle sessions with missing optional fields', async () => {
      const minimalSession = {
        session_id: 'minimal-session',
        user_id: mockUserId,
        recipe_id: mockRecipeId,
        status: 'cooking',
        started_at: mockTimestamp,
        created_at: mockTimestamp,
        updated_at: mockTimestamp
      };

      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [minimalSession],
        Count: 1,
        LastEvaluatedKey: undefined
      });

      const request: GetCookingHistoryRequest = {
        user_id: mockUserId
      };

      const result = await CookingSessionService.getCookingHistory(mockUserId, request);

      expect(result.sessions[0]).toEqual({
        session_id: 'minimal-session',
        user_id: mockUserId,
        recipe_id: mockRecipeId,
        recipe_title: undefined,
        status: 'cooking',
        started_at: mockTimestamp,
        completed_at: undefined,
        abandoned_at: undefined,
        cooking_duration_minutes: undefined,
        rating: undefined,
        review: undefined,
        notes: undefined,
        created_at: mockTimestamp,
        updated_at: mockTimestamp
      });
    });
  });
});