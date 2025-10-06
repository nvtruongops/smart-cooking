/**
 * Notifications Lambda - Unit Tests
 */

import { handler, createNotification } from './index';
import { APIGatewayEvent } from '../shared/types';
import { DynamoDBHelper } from '../shared/dynamodb';

// Mock dependencies
jest.mock('../shared/dynamodb', () => ({
  DynamoDBHelper: {
    query: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    update: jest.fn(),
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

const mockQuery = DynamoDBHelper.query as jest.MockedFunction<typeof DynamoDBHelper.query>;
const mockGet = DynamoDBHelper.get as jest.MockedFunction<typeof DynamoDBHelper.get>;
const mockPut = DynamoDBHelper.put as jest.MockedFunction<typeof DynamoDBHelper.put>;
const mockUpdate = DynamoDBHelper.update as jest.MockedFunction<typeof DynamoDBHelper.update>;

describe('Notifications Lambda - Unit Tests', () => {
  const mockUserId = 'user-123';
  const mockNotificationId = 'notification-abc';
  const mockActorId = 'user-456';

  const mockEvent: APIGatewayEvent = {
    httpMethod: 'GET',
    path: '/notifications',
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
    resource: '/notifications',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockGet.mockReset();
    mockPut.mockReset();
    mockUpdate.mockReset();
  });

  describe('GET /notifications - Get Notifications', () => {
    test('should get all notifications with default pagination', async () => {
      // Mock notifications
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            notification_id: 'notif-1',
            user_id: mockUserId,
            type: 'friend_request',
            actor_id: mockActorId,
            actor_username: 'friend1',
            target_type: 'friendship',
            target_id: 'friendship-123',
            content: 'friend1 sent you a friend request',
            is_read: false,
            created_at: '2025-10-06T10:00:00.000Z',
          },
          {
            notification_id: 'notif-2',
            user_id: mockUserId,
            type: 'comment',
            actor_id: 'user-789',
            actor_username: 'commenter',
            target_type: 'post',
            target_id: 'post-456',
            content: 'commenter commented on your post',
            is_read: true,
            created_at: '2025-10-05T10:00:00.000Z',
          },
        ],
        Count: 2,
        LastEvaluatedKey: undefined,
      });

      // Mock total count query
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 2,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        queryStringParameters: {},
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.notifications).toHaveLength(2);
      expect(body.data.unread_count).toBe(1);
      expect(body.data.total_count).toBe(2);
      expect(body.data.has_more).toBe(false);
    });

    test('should filter unread notifications only', async () => {
      // Mock unread notifications via GSI
      mockQuery.mockResolvedValueOnce({
        Items: [
          {
            notification_id: 'notif-1',
            user_id: mockUserId,
            type: 'friend_request',
            is_read: false,
            created_at: '2025-10-06T10:00:00.000Z',
          },
        ],
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      // Mock total count
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 5,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        queryStringParameters: { unread_only: 'true' },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.notifications).toHaveLength(1);
      expect(body.data.notifications[0].is_read).toBe(false);

      // Verify GSI query was used
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `USER#${mockUserId}#UNREAD`,
          },
        })
      );
    });

    test('should support pagination with limit and offset', async () => {
      const notifications = Array.from({ length: 30 }, (_, i) => ({
        notification_id: `notif-${i}`,
        user_id: mockUserId,
        type: 'comment',
        is_read: false,
        created_at: `2025-10-06T10:${i}:00.000Z`,
      }));

      mockQuery.mockResolvedValueOnce({
        Items: notifications.slice(0, 25), // Limit + offset
        Count: 25,
        LastEvaluatedKey: undefined,
      });

      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 30,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        queryStringParameters: { limit: '10', offset: '5' },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.notifications).toHaveLength(10); // Sliced from offset 5
      expect(body.data.has_more).toBe(true); // 30 total, showing 5-15
    });

    test('should validate limit range', async () => {
      const event = {
        ...mockEvent,
        queryStringParameters: { limit: '150' }, // > 100
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_limit');
    });

    test('should handle empty notifications', async () => {
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined,
      });

      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined,
      });

      const event = { ...mockEvent } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.notifications).toHaveLength(0);
      expect(body.data.unread_count).toBe(0);
      expect(body.data.total_count).toBe(0);
    });
  });

  describe('PUT /notifications/{id}/read - Mark as Read', () => {
    test('should mark notification as read', async () => {
      // Mock existing unread notification
      mockGet.mockResolvedValueOnce({
        notification_id: mockNotificationId,
        user_id: mockUserId,
        type: 'comment',
        is_read: false,
        created_at: '2025-10-06T10:00:00.000Z',
      });

      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        path: `/notifications/${mockNotificationId}/read`,
        pathParameters: { id: mockNotificationId },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.message).toContain('marked as read');

      // Verify update called
      expect(mockUpdate).toHaveBeenCalledWith(
        `USER#${mockUserId}`,
        `NOTIFICATION#${mockNotificationId}`,
        'SET is_read = :true REMOVE GSI1PK, GSI1SK',
        {
          ':true': true,
        }
      );
    });

    test('should handle already read notification', async () => {
      // Mock already read notification
      mockGet.mockResolvedValueOnce({
        notification_id: mockNotificationId,
        user_id: mockUserId,
        is_read: true,
      });

      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        path: `/notifications/${mockNotificationId}/read`,
        pathParameters: { id: mockNotificationId },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.message).toContain('already marked as read');

      // Verify update NOT called
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    test('should reject marking non-existent notification', async () => {
      mockGet.mockResolvedValueOnce(undefined);

      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        path: `/notifications/${mockNotificationId}/read`,
        pathParameters: { id: mockNotificationId },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('not_found');
    });

    test('should reject marking another user notification', async () => {
      mockGet.mockResolvedValueOnce({
        notification_id: mockNotificationId,
        user_id: 'other-user',
        is_read: false,
      });

      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        path: `/notifications/${mockNotificationId}/read`,
        pathParameters: { id: mockNotificationId },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('forbidden');
    });
  });

  describe('PUT /notifications/read-all - Mark All as Read', () => {
    test('should mark all unread notifications as read', async () => {
      const unreadNotifications = [
        {
          SK: 'NOTIFICATION#notif-1',
          notification_id: 'notif-1',
          is_read: false,
        },
        {
          SK: 'NOTIFICATION#notif-2',
          notification_id: 'notif-2',
          is_read: false,
        },
        {
          SK: 'NOTIFICATION#notif-3',
          notification_id: 'notif-3',
          is_read: false,
        },
      ];

      mockQuery.mockResolvedValueOnce({
        Items: unreadNotifications,
        Count: 3,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        path: '/notifications/read-all',
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.message).toContain('All notifications marked as read');
      expect(body.data.updated_count).toBe(3);

      // Verify 3 updates called
      expect(mockUpdate).toHaveBeenCalledTimes(3);
    });

    test('should handle no unread notifications', async () => {
      mockQuery.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: undefined,
      });

      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        path: '/notifications/read-all',
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.message).toContain('No unread notifications');
      expect(body.data.updated_count).toBe(0);

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('createNotification - Helper Function', () => {
    test('should create notification with TTL', async () => {
      mockGet.mockResolvedValueOnce({
        username: 'actoruser',
        avatar_url: 'https://avatar.png',
      });

      await createNotification(
        mockUserId,
        'friend_request',
        mockActorId,
        'friendship',
        'friendship-123',
        'actoruser sent you a friend request'
      );

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `USER#${mockUserId}`,
          SK: expect.stringContaining('NOTIFICATION#'),
          GSI1PK: `USER#${mockUserId}#UNREAD`,
          GSI1SK: expect.stringContaining('NOTIFICATION#'),
          entity_type: 'NOTIFICATION',
          user_id: mockUserId,
          type: 'friend_request',
          actor_id: mockActorId,
          actor_username: 'actoruser',
          actor_avatar_url: 'https://avatar.png',
          target_type: 'friendship',
          target_id: 'friendship-123',
          content: 'actoruser sent you a friend request',
          is_read: false,
          ttl: expect.any(Number),
        })
      );
    });

    test('should handle actor profile fetch failure gracefully', async () => {
      mockGet.mockRejectedValueOnce(new Error('DynamoDB error'));

      // Should not throw
      await expect(
        createNotification(
          mockUserId,
          'comment',
          mockActorId,
          'post',
          'post-123',
          'Someone commented'
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Notification Types', () => {
    test('should create friend_request notification', async () => {
      mockGet.mockResolvedValueOnce({ username: 'friend' });

      await createNotification(
        mockUserId,
        'friend_request',
        mockActorId,
        'friendship',
        'friendship-123',
        'friend sent you a friend request'
      );

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'friend_request',
          target_type: 'friendship',
        })
      );
    });

    test('should create comment notification', async () => {
      mockGet.mockResolvedValueOnce({ username: 'commenter' });

      await createNotification(
        mockUserId,
        'comment',
        mockActorId,
        'post',
        'post-123',
        'commenter commented on your post'
      );

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'comment',
          target_type: 'post',
        })
      );
    });

    test('should create reaction notification', async () => {
      mockGet.mockResolvedValueOnce({ username: 'reactor' });

      await createNotification(
        mockUserId,
        'reaction',
        mockActorId,
        'post',
        'post-456',
        'reactor loved your post'
      );

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'reaction',
          target_type: 'post',
        })
      );
    });

    test('should create recipe_approved notification', async () => {
      mockGet.mockResolvedValueOnce({ username: 'system' });

      await createNotification(
        mockUserId,
        'recipe_approved',
        'system',
        'recipe',
        'recipe-789',
        'Your recipe has been auto-approved!'
      );

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recipe_approved',
          target_type: 'recipe',
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should require authentication', async () => {
      const event = {
        ...mockEvent,
        requestContext: {
          requestId: 'test-request-id',
        },
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('unauthorized');
    });

    test('should handle invalid endpoint', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        path: '/notifications/invalid',
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('not_found');
    });

    test('should handle DynamoDB errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DynamoDB error'));

      const event = { ...mockEvent } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
    });
  });
});
