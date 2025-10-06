/**
 * Comments System - Unit Tests
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
const mockCheckFriendship = checkFriendship as jest.MockedFunction<typeof checkFriendship>;

describe('Comments System - Unit Tests', () => {
  const mockUserId = 'user-123';
  const mockPostId = 'post-456';
  const mockCommentId = 'comment-789';

  const mockEvent: APIGatewayEvent = {
    httpMethod: 'POST',
    path: `/posts/${mockPostId}/comments`,
    pathParameters: { id: mockPostId },
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
    resource: '/posts/{id}/comments',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /posts/{id}/comments - Create Comment', () => {
    test('should create a top-level comment successfully', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        content: 'Test post',
        is_public: true,
        comments_count: 0,
      });

      // Mock user info
      mockGet.mockResolvedValue({
        user_id: mockUserId,
        username: 'testuser',
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          content: 'Great post!',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.data.comment.content).toBe('Great post!');
      expect(body.data.comment.post_id).toBe(mockPostId);
      expect(body.data.comment.user_id).toBe(mockUserId);
      expect(body.data.comment.parent_comment_id).toBeUndefined();

      // Verify comment was saved
      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'COMMENT',
          content: 'Great post!',
        })
      );

      // Verify comments_count was incremented
      expect(mockUpdate).toHaveBeenCalledWith(
        `POST#${mockPostId}`,
        'METADATA',
        expect.any(String),
        expect.objectContaining({
          ':inc': 1,
        })
      );
    });

    test('should create a nested comment (reply) successfully', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: true,
      });

      // Mock parent comment exists
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            comment_id: 'parent-comment-123',
            content: 'Parent comment',
          },
        ],
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          content: 'I agree!',
          parent_comment_id: 'parent-comment-123',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.data.comment.content).toBe('I agree!');
      expect(body.data.comment.parent_comment_id).toBe('parent-comment-123');

      // Verify SK pattern
      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          SK: expect.stringMatching(/^COMMENT#\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z#/),
        })
      );
    });

    test('should reject comment with empty content', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          content: '   ',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('missing_content');
    });

    test('should reject comment that is too long', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          content: 'a'.repeat(2001),
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('content_too_long');
    });

    test('should reject comment on non-existent post', async () => {
      // Mock post not found
      mockGet.mockResolvedValueOnce(undefined);

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          content: 'Comment on missing post',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('post_not_found');
    });

    test('should reject comment on private post by non-friend', async () => {
      // Mock private post
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: false,
      });

      // Mock not friends
      mockCheckFriendship.mockResolvedValueOnce(false);

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          content: 'Cannot comment',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('forbidden');
    });

    test('should reject reply to non-existent parent comment', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: true,
      });

      // Mock parent comment not found
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          content: 'Reply to nothing',
          parent_comment_id: 'nonexistent-comment',
        }),
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('parent_comment_not_found');
    });
  });

  describe('GET /posts/{id}/comments - Get Comments', () => {
    test('should get all comments for a post', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: mockUserId,
        is_public: true,
      });

      // Mock comments query
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            comment_id: 'comment-1',
            post_id: mockPostId,
            user_id: 'user-1',
            content: 'First comment',
            created_at: '2025-10-06T10:00:00Z',
            updated_at: '2025-10-06T10:00:00Z',
          },
          {
            comment_id: 'comment-2',
            post_id: mockPostId,
            user_id: 'user-2',
            content: 'Second comment',
            created_at: '2025-10-06T11:00:00Z',
            updated_at: '2025-10-06T11:00:00Z',
          },
        ],
        Count: 2,
        LastEvaluatedKey: undefined,
      });

      // Mock user info queries
      mockGet.mockResolvedValue({
        user_id: 'user-1',
        username: 'user1',
      });

      const event = {
        ...mockEvent,
        httpMethod: 'GET',
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.comments).toHaveLength(2);
      expect(body.data.comments[0].comment.content).toBe('First comment');
      expect(body.data.has_more).toBe(false);
    });

    test('should build nested comment tree structure', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: mockUserId,
        is_public: true,
      });

      // Mock comments with parent-child relationship
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            comment_id: 'parent-1',
            post_id: mockPostId,
            user_id: 'user-1',
            content: 'Parent comment',
            created_at: '2025-10-06T10:00:00Z',
            updated_at: '2025-10-06T10:00:00Z',
          },
          {
            comment_id: 'reply-1',
            post_id: mockPostId,
            user_id: 'user-2',
            parent_comment_id: 'parent-1',
            content: 'Reply to parent',
            created_at: '2025-10-06T10:05:00Z',
            updated_at: '2025-10-06T10:05:00Z',
          },
        ],
        Count: 2,
        LastEvaluatedKey: undefined,
      });

      // Mock user info
      mockGet.mockResolvedValue({
        user_id: 'user-1',
        username: 'user1',
      });

      const event = {
        ...mockEvent,
        httpMethod: 'GET',
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      // Should have 1 top-level comment
      expect(body.data.comments).toHaveLength(1);
      
      // Top-level comment should have replies
      expect(body.data.comments[0].comment.comment_id).toBe('parent-1');
      expect(body.data.comments[0].replies).toHaveLength(1);
      expect(body.data.comments[0].replies[0].comment.comment_id).toBe('reply-1');
    });

    test('should support pagination with limit', async () => {
      // Mock post exists
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: mockUserId,
        is_public: true,
      });

      // Mock paginated comments
      mockQuery.mockResolvedValueOnce({
        Items: Array(10).fill(null).map((_, i) => ({
          comment_id: `comment-${i}`,
          post_id: mockPostId,
          user_id: 'user-1',
          content: `Comment ${i}`,
          created_at: new Date(Date.now() + i * 1000).toISOString(),
          updated_at: new Date(Date.now() + i * 1000).toISOString(),
        })),
        Count: 10,
        LastEvaluatedKey: { PK: `POST#${mockPostId}`, SK: 'COMMENT#last' },
      });

      // Mock user info
      mockGet.mockResolvedValue({
        user_id: 'user-1',
        username: 'user1',
      });

      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        queryStringParameters: { limit: '5' },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.comments.length).toBeLessThanOrEqual(10);
      expect(body.data.has_more).toBe(true);
      expect(body.data.next_key).toBeDefined();
    });

    test('should reject get comments on non-existent post', async () => {
      // Mock post not found
      mockGet.mockResolvedValueOnce(undefined);

      const event = {
        ...mockEvent,
        httpMethod: 'GET',
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('post_not_found');
    });

    test('should reject get comments on private post by non-friend', async () => {
      // Mock private post
      mockGet.mockResolvedValueOnce({
        post_id: mockPostId,
        user_id: 'other-user',
        is_public: false,
      });

      // Mock not friends
      mockCheckFriendship.mockResolvedValueOnce(false);

      const event = {
        ...mockEvent,
        httpMethod: 'GET',
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('forbidden');
    });

    test('should handle invalid limit parameter', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        queryStringParameters: { limit: '200' },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_limit');
    });
  });
});
