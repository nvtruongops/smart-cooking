/**
 * Reactions and Likes System - Unit Tests
 */

import { handler } from './index';
import { APIGatewayEvent } from '../shared/types';
import { DynamoDBHelper } from '../shared/dynamodb';
import { checkFriendship } from '../shared/privacy-middleware';

// Mock dependencies
jest.mock('../shared/dynamodb', () => ({
  DynamoDBHelper: {
    query: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock('../shared/logger', () => ({
  logger: {
    initFromEvent: jest.fn(),
    logFunctionStart: jest.fn(),
    logFunctionEnd: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../shared/metrics', () => ({
  metrics: {
    trackApiRequest: jest.fn(),
    flush: jest.fn(),
  },
}));
jest.mock('../shared/tracer', () => ({
  tracer: {
    setUser: jest.fn(),
  },
}));
jest.mock('../shared/privacy-middleware', () => ({
  getUserPrivacySettings: jest.fn().mockResolvedValue({
    profile_visibility: 'public',
  }),
  createPrivacyContext: jest.fn().mockResolvedValue({
    isSelf: false,
    isFriend: true,
  }),
  checkFriendship: jest.fn().mockResolvedValue(true),
}));

const mockQuery = DynamoDBHelper.query as jest.MockedFunction<typeof DynamoDBHelper.query>;
const mockGet = DynamoDBHelper.get as jest.MockedFunction<typeof DynamoDBHelper.get>;
const mockPut = DynamoDBHelper.put as jest.MockedFunction<typeof DynamoDBHelper.put>;
const mockUpdate = DynamoDBHelper.update as jest.MockedFunction<typeof DynamoDBHelper.update>;
const mockDelete = DynamoDBHelper.delete as jest.MockedFunction<typeof DynamoDBHelper.delete>;
const mockCheckFriendship = checkFriendship as jest.MockedFunction<typeof checkFriendship>;

describe('Reactions and Likes System - Unit Tests', () => {
  const mockUserId = 'user-123';
  const mockPostId = 'post-456';
  const mockCommentId = 'comment-789';
  const mockReactionId = 'reaction-abc';

  const mockEvent: APIGatewayEvent = {
    httpMethod: 'POST',
    path: '/reactions',
    pathParameters: null,
    queryStringParameters: null,
    headers: {
      'Content-Type': 'application/json',
    },
    body: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: {
          sub: mockUserId,
          email: 'test@example.com',
          username: 'testuser',
        },
      },
    },
    multiValueHeaders: {},
    multiValueQueryStringParameters: {},
    stageVariables: null,
    isBase64Encoded: false,
    resource: '/reactions',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockQuery.mockReset();
    mockPut.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockCheckFriendship.mockReset();
    
    // Re-apply default mocks
    mockCheckFriendship.mockResolvedValue(true);
  });

  describe('POST /reactions - Create Reaction', () => {
    test('should create a "like" reaction on a post', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: true,
        likes_count: 0,
      });

      // Mock no existing reaction
      mockGet.mockResolvedValueOnce(undefined);

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'post',
          target_id: mockPostId,
          reaction_type: 'like',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.data.reaction.target_type).toBe('post');
      expect(body.data.reaction.target_id).toBe(mockPostId);
      expect(body.data.reaction.reaction_type).toBe('like');
      expect(body.data.reaction.user_id).toBe(mockUserId);

      // Verify reaction was saved with correct SK pattern
      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `POST#${mockPostId}`,
          SK: `REACTION#${mockUserId}`,
          entity_type: 'REACTION',
          reaction_type: 'like',
        })
      );

      // Verify likes_count was incremented
      expect(mockUpdate).toHaveBeenCalledWith(
        `POST#${mockPostId}`,
        'METADATA',
        expect.any(String),
        expect.objectContaining({
          ':inc': 1,
        })
      );
    });

    test('should create a "love" reaction on a post', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: true,
      });

      // Mock no existing reaction
      mockGet.mockResolvedValueOnce(undefined);

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'post',
          target_id: mockPostId,
          reaction_type: 'love',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.data.reaction.reaction_type).toBe('love');
    });

    test('should create a "wow" reaction on a post', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: true,
      });

      // Mock no existing reaction
      mockGet.mockResolvedValueOnce(undefined);

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'post',
          target_id: mockPostId,
          reaction_type: 'wow',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.data.reaction.reaction_type).toBe('wow');
    });

    test('should create a reaction on a comment', async () => {
      // Mock post exists (for privacy check)
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: true,
      });

      // Mock comment exists
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            comment_id: mockCommentId,
            post_id: mockPostId,
            content: 'Test comment',
            SK: `COMMENT#2025-10-06T10:00:00Z#${mockCommentId}`,
          },
        ],
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      // Mock post exists again for privacy check
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        is_public: true,
      });

      // Mock no existing reaction
      mockGet.mockResolvedValueOnce(undefined);

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'comment',
          target_id: `${mockPostId}#${mockCommentId}`,
          reaction_type: 'like',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.data.reaction.target_type).toBe('comment');
    });

    test('should toggle off existing reaction (remove when clicking same type)', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: true,
      });

      // Mock existing reaction of same type
      mockGet.mockResolvedValueOnce({
        reaction_id: mockReactionId,
        reaction_type: 'like',
        user_id: mockUserId,
        PK: `POST#${mockPostId}`,
        SK: `REACTION#${mockUserId}`,
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'post',
          target_id: mockPostId,
          reaction_type: 'like',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.removed).toBe(true);

      // Verify reaction was deleted
      expect(mockDelete).toHaveBeenCalledWith(
        `POST#${mockPostId}`,
        `REACTION#${mockUserId}`
      );

      // Verify likes_count was decremented
      expect(mockUpdate).toHaveBeenCalledWith(
        `POST#${mockPostId}`,
        'METADATA',
        expect.any(String),
        expect.objectContaining({
          ':dec': 1,
        })
      );
    });

    test('should update reaction when changing type', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: true,
      });

      // Mock existing reaction of different type
      mockGet.mockResolvedValueOnce({
        reaction_id: mockReactionId,
        reaction_type: 'like',
        user_id: mockUserId,
        created_at: '2025-10-06T09:00:00Z',
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'post',
          target_id: mockPostId,
          reaction_type: 'love', // Different from existing 'like'
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.data.reaction.reaction_type).toBe('love');
      expect(body.data.reaction.reaction_id).toBe(mockReactionId); // Same ID

      // Verify reaction was updated (not created new)
      expect(mockUpdate).toHaveBeenCalledWith(
        `POST#${mockPostId}`,
        `REACTION#${mockUserId}`,
        expect.any(String),
        expect.objectContaining({
          ':type': 'love',
        })
      );

      // Should NOT increment/decrement count when updating
      expect(mockUpdate).not.toHaveBeenCalledWith(
        `POST#${mockPostId}`,
        'METADATA',
        expect.stringContaining('likes_count'),
        expect.anything()
      );
    });

    test('should reject invalid reaction type', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'post',
          target_id: mockPostId,
          reaction_type: 'invalid',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_reaction_type');
    });

    test('should reject invalid target type', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'invalid',
          target_id: mockPostId,
          reaction_type: 'like',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_target_type');
    });

    test('should reject reaction on non-existent post', async () => {
      // Mock post not found  
      mockGet.mockResolvedValueOnce(undefined);

      // Mock no existing reaction (won't be reached but needed for completeness)
      mockGet.mockResolvedValueOnce(undefined);

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'post',
          target_id: mockPostId,
          reaction_type: 'like',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('post_not_found');
    });

    test('should reject reaction on non-existent comment', async () => {
      // Mock post exists but comment not found
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        is_public: true,
      });

      // Mock comment not found
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'comment',
          target_id: `${mockPostId}#nonexistent`,
          reaction_type: 'like',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('comment_not_found');
    });

    test('should reject reaction on private post by non-friend', async () => {
      // Mock private post
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: false,
      });

      // Mock not friends
      mockCheckFriendship.mockResolvedValueOnce(false);

      // Mock no existing reaction (won't be reached)
      mockGet.mockResolvedValueOnce(undefined);

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          target_type: 'post',
          target_id: mockPostId,
          reaction_type: 'like',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('forbidden');
    });
  });

  describe('DELETE /reactions/{id} - Delete Reaction', () => {
    test('should delete a reaction successfully', async () => {
      // Mock find reaction by ID
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            reaction_id: mockReactionId,
            PK: `POST#${mockPostId}`,
            SK: `REACTION#${mockUserId}`,
            target_type: 'post',
            target_id: mockPostId,
            reaction_type: 'like',
          },
        ],
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        path: `/reactions/${mockReactionId}`,
        pathParameters: { id: mockReactionId },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.message).toBe('Reaction deleted successfully');

      // Verify reaction was deleted
      expect(mockDelete).toHaveBeenCalledWith(
        `POST#${mockPostId}`,
        `REACTION#${mockUserId}`
      );

      // Verify likes_count was decremented
      expect(mockUpdate).toHaveBeenCalledWith(
        `POST#${mockPostId}`,
        'METADATA',
        expect.any(String),
        expect.objectContaining({
          ':dec': 1,
        })
      );
    });

    test('should delete a reaction on a comment successfully', async () => {
      // Mock find reaction
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            reaction_id: mockReactionId,
            PK: `POST#${mockPostId}`,
            SK: `REACTION#${mockUserId}`,
            target_type: 'comment',
            target_id: mockCommentId,
            reaction_type: 'love',
          },
        ],
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      // Mock find comment for SK
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            comment_id: mockCommentId,
            SK: `COMMENT#2025-10-06T10:00:00Z#${mockCommentId}`,
          },
        ],
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        path: `/reactions/${mockReactionId}`,
        pathParameters: { id: mockReactionId },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify decrement on comment
      expect(mockUpdate).toHaveBeenCalledWith(
        `POST#${mockPostId}`,
        `COMMENT#2025-10-06T10:00:00Z#${mockCommentId}`,
        expect.any(String),
        expect.objectContaining({
          ':dec': 1,
        })
      );
    });

    test('should reject delete of non-existent reaction', async () => {
      // Mock reaction not found
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        path: `/reactions/${mockReactionId}`,
        pathParameters: { id: mockReactionId },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('reaction_not_found');
    });

    test('should reject delete of another user\'s reaction', async () => {
      // Mock reaction belonging to different user
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        path: `/reactions/${mockReactionId}`,
        pathParameters: { id: mockReactionId },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('reaction_not_found');
    });
  });
});
