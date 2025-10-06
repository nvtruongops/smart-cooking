/**
 * Posts Feed Lambda Function - Unit Tests
 */

import { handler } from './index';
import { APIGatewayEvent } from '../shared/types';
import { DynamoDBHelper } from '../shared/dynamodb';

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
  getUserPrivacySettings: jest.fn(),
  createPrivacyContext: jest.fn(),
  checkFriendship: jest.fn().mockResolvedValue(true),
}));

const mockQuery = DynamoDBHelper.query as jest.MockedFunction<typeof DynamoDBHelper.query>;
const mockGet = DynamoDBHelper.get as jest.MockedFunction<typeof DynamoDBHelper.get>;

describe('Posts Feed - Unit Tests', () => {
  const mockUserId = 'user-123';
  const mockFriendId = 'friend-456';

  const mockEvent: APIGatewayEvent = {
    httpMethod: 'GET',
    path: '/posts/feed',
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
    resource: '/posts/feed',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /posts/feed', () => {
    test('should get feed with public posts successfully', async () => {
      // Mock friends query (no friends)
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined,
      });

      // Mock GSI3 query for public posts
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            post_id: 'post-1',
            user_id: mockFriendId,
            content: 'Public post 1',
            images: [],
            is_public: true,
            likes_count: 5,
            comments_count: 2,
            created_at: '2025-10-06T10:00:00Z',
            updated_at: '2025-10-06T10:00:00Z',
          },
        ],
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      // Mock user info queries
      mockGet.mockResolvedValue({
        user_id: mockFriendId,
        username: 'frienduser',
        full_name: 'Friend User',
      });

      const event = {
        ...mockEvent,
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.posts).toHaveLength(1);
      expect(body.data.posts[0].post.post_id).toBe('post-1');
      expect(body.data.has_more).toBe(false);
    });

    test('should support pagination with limit parameter', async () => {
      // Mock friends query
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined,
      });

      // Mock GSI3 query
      mockQuery.mockResolvedValueOnce({
        Items: Array(20).fill(null).map((_, i) => ({
          post_id: `post-${i}`,
          user_id: mockUserId,
          content: `Post ${i}`,
          images: [],
          is_public: true,
          likes_count: 0,
          comments_count: 0,
          created_at: new Date(Date.now() - i * 1000).toISOString(),
          updated_at: new Date(Date.now() - i * 1000).toISOString(),
        })),
        Count: 20,
        LastEvaluatedKey: { PK: 'POST#last', SK: 'METADATA' },
      });

      // Mock user info
      mockGet.mockResolvedValue({
        user_id: mockUserId,
        username: 'testuser',
      });

      const event = {
        ...mockEvent,
        queryStringParameters: { limit: '5' },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.posts.length).toBeLessThanOrEqual(5);
      expect(body.data.has_more).toBe(true);
      expect(body.data.next_key).toBeDefined();
    });

    test('should sort posts by created_at descending', async () => {
      // Mock friends query
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined,
      });

      // Mock GSI3 query with unsorted posts
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            post_id: 'post-old',
            user_id: mockUserId,
            content: 'Old post',
            images: [],
            is_public: true,
            likes_count: 0,
            comments_count: 0,
            created_at: '2025-10-06T08:00:00Z',
            updated_at: '2025-10-06T08:00:00Z',
          },
          {
            post_id: 'post-new',
            user_id: mockUserId,
            content: 'New post',
            images: [],
            is_public: true,
            likes_count: 0,
            comments_count: 0,
            created_at: '2025-10-06T10:00:00Z',
            updated_at: '2025-10-06T10:00:00Z',
          },
        ],
        Count: 2,
        LastEvaluatedKey: undefined,
      });

      // Mock user info
      mockGet.mockResolvedValue({
        user_id: mockUserId,
        username: 'testuser',
      });

      const event = {
        ...mockEvent,
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.posts[0].post.post_id).toBe('post-new'); // Newest first
      expect(body.data.posts[1].post.post_id).toBe('post-old');
    });

    test('should handle invalid limit parameter', async () => {
      const event = {
        ...mockEvent,
        queryStringParameters: { limit: '200' }, // Over max
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_limit');
    });

    test('should handle errors gracefully', async () => {
      // Mock query to throw error
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const event = {
        ...mockEvent,
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
    });
  });
});
