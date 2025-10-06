/**
 * Unit Tests for Friendship Management Lambda
 */

// Mock UUID first before any imports
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-friendship-id')
}));

// Mock privacy middleware
jest.mock('../shared/privacy-middleware', () => ({
  createPrivacyContext: jest.fn(() => Promise.resolve({
    viewerId: 'test-user-1',
    targetUserId: 'test-user-1',
    isSelf: true,
    isFriend: false
  }))
}));

import { handler } from './index';
import { DynamoDBHelper } from '../shared/dynamodb';
import { APIGatewayEvent } from '../shared/types';

// Mock DynamoDB Helper
jest.mock('../shared/dynamodb');
const mockDynamoDBHelper = DynamoDBHelper as jest.Mocked<typeof DynamoDBHelper>;

// Mock getUserProfile
(DynamoDBHelper.getUserProfile as jest.Mock) = jest.fn();

describe('Friendship Management Lambda', () => {
  const user1 = 'user-alice';
  const user2 = 'user-bob';
  const friendshipId = 'test-friendship-id';

  const createMockEvent = (
    method: string,
    path: string,
    userId: string,
    body?: any,
    pathParams?: any,
    queryParams?: any
  ): APIGatewayEvent => ({
    httpMethod: method,
    path,
    pathParameters: pathParams || null,
    queryStringParameters: queryParams || null,
    headers: {},
    body: body ? JSON.stringify(body) : null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: {
          sub: userId,
          email: `${userId}@example.com`,
          username: userId
        }
      }
    },
    multiValueHeaders: undefined,
    multiValueQueryStringParameters: undefined,
    stageVariables: null,
    isBase64Encoded: false,
    resource: path
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Send Friend Request', () => {
    it('should send friend request successfully', async () => {
      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
        user_id: user2,
        username: 'bob',
        email: 'bob@example.com'
      });

      mockDynamoDBHelper.get.mockResolvedValue(undefined); // No existing friendship
      mockDynamoDBHelper.put.mockResolvedValue({} as any);

      const event = createMockEvent('POST', '/friends/request', user1, {
        addressee_id: user2,
        message: 'Hi, let\'s be friends!'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const response = JSON.parse(result.body);
      expect(response.data.message).toBe('Friend request sent successfully');
      expect(response.data.friendship.friendship_id).toBe(friendshipId);
      expect(response.data.friendship.requester_id).toBe(user1);
      expect(response.data.friendship.addressee_id).toBe(user2);
      expect(response.data.friendship.status).toBe('pending');

      // Verify bidirectional records were created
      expect(mockDynamoDBHelper.put).toHaveBeenCalledTimes(2);
      expect(mockDynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `USER#${user1}`,
          SK: `FRIEND#${user2}`,
          role: 'requester',
          status: 'pending'
        })
      );
      expect(mockDynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `USER#${user2}`,
          SK: `FRIEND#${user1}`,
          role: 'addressee',
          status: 'pending'
        })
      );
    });

    it('should return 400 if addressee_id is missing', async () => {
      const event = createMockEvent('POST', '/friends/request', user1, {});

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('missing_addressee_id');
    });

    it('should return 400 if trying to friend self', async () => {
      const event = createMockEvent('POST', '/friends/request', user1, {
        addressee_id: user1
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('invalid_request');
    });

    it('should return 404 if addressee does not exist', async () => {
      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue(undefined);

      const event = createMockEvent('POST', '/friends/request', user1, {
        addressee_id: 'non-existent-user'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('user_not_found');
    });

    it('should return 409 if friendship already exists', async () => {
      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
        user_id: user2,
        username: 'bob'
      });

      mockDynamoDBHelper.get.mockResolvedValue({
        status: 'accepted'
      });

      const event = createMockEvent('POST', '/friends/request', user1, {
        addressee_id: user2
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('already_friends');
    });

    it('should return 409 if friend request already pending', async () => {
      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
        user_id: user2,
        username: 'bob'
      });

      mockDynamoDBHelper.get.mockResolvedValue({
        status: 'pending'
      });

      const event = createMockEvent('POST', '/friends/request', user1, {
        addressee_id: user2
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('request_pending');
    });
  });

  describe('Accept Friend Request', () => {
    it('should accept friend request successfully', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: user2,
          friend_id: user1,
          status: 'pending',
          role: 'addressee',
          requested_at: '2025-01-20T10:00:00.000Z',
          created_at: '2025-01-20T10:00:00.000Z'
        }],
        LastEvaluatedKey: undefined,
        Count: 1
      });

      mockDynamoDBHelper.update.mockResolvedValue({} as any);

      const event = createMockEvent('PUT', `/friends/${friendshipId}/accept`, user2, {
        friendship_id: friendshipId
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.data.message).toBe('Friend request accepted');
      expect(response.data.friendship.status).toBe('accepted');

      // Verify both records were updated
      expect(mockDynamoDBHelper.update).toHaveBeenCalledTimes(2);
    });

    it('should return 404 if friendship not found', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [],
        LastEvaluatedKey: undefined,
        Count: 0
      });

      const event = createMockEvent('PUT', `/friends/${friendshipId}/accept`, user2, {
        friendship_id: friendshipId
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('friendship_not_found');
    });

    it('should return 403 if user is not addressee', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: user1,
          friend_id: user2,
          status: 'pending',
          role: 'requester', // User is requester, not addressee
          requested_at: '2025-01-20T10:00:00.000Z'
        }],
        LastEvaluatedKey: undefined,
        Count: 1
      });

      const event = createMockEvent('PUT', `/friends/${friendshipId}/accept`, user1, {
        friendship_id: friendshipId
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('not_addressee');
    });

    it('should return 409 if already accepted', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: user2,
          friend_id: user1,
          status: 'accepted',
          role: 'addressee',
          requested_at: '2025-01-20T10:00:00.000Z'
        }],
        LastEvaluatedKey: undefined,
        Count: 1
      });

      const event = createMockEvent('PUT', `/friends/${friendshipId}/accept`, user2, {
        friendship_id: friendshipId
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('already_accepted');
    });
  });

  describe('Reject Friend Request', () => {
    it('should reject friend request successfully', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: user2,
          friend_id: user1,
          status: 'pending',
          role: 'addressee',
          requested_at: '2025-01-20T10:00:00.000Z'
        }],
        LastEvaluatedKey: undefined,
        Count: 1
      });

      mockDynamoDBHelper.update.mockResolvedValue({} as any);

      const event = createMockEvent('PUT', `/friends/${friendshipId}/reject`, user2, {
        friendship_id: friendshipId,
        reason: 'Not interested'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.data.message).toBe('Friend request rejected');

      // Verify both records were updated to rejected
      expect(mockDynamoDBHelper.update).toHaveBeenCalledTimes(2);
    });

    it('should return 403 if user is not addressee', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: user1,
          friend_id: user2,
          status: 'pending',
          role: 'requester',
          requested_at: '2025-01-20T10:00:00.000Z'
        }],
        LastEvaluatedKey: undefined,
        Count: 1
      });

      const event = createMockEvent('PUT', `/friends/${friendshipId}/reject`, user1, {
        friendship_id: friendshipId
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('not_addressee');
    });
  });

  describe('Remove Friendship', () => {
    it('should remove friendship successfully', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: user1,
          friend_id: user2,
          status: 'accepted',
          role: 'requester'
        }],
        LastEvaluatedKey: undefined,
        Count: 1
      });

      mockDynamoDBHelper.delete.mockResolvedValue({} as any);

      const event = createMockEvent('DELETE', `/friends/${friendshipId}`, user1, null, {
        id: friendshipId
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.data.message).toBe('Friendship removed successfully');

      // Verify both records were deleted
      expect(mockDynamoDBHelper.delete).toHaveBeenCalledTimes(2);
      expect(mockDynamoDBHelper.delete).toHaveBeenCalledWith(`USER#${user1}`, `FRIEND#${user2}`);
      expect(mockDynamoDBHelper.delete).toHaveBeenCalledWith(`USER#${user2}`, `FRIEND#${user1}`);
    });

    it('should return 404 if friendship not found', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [],
        LastEvaluatedKey: undefined,
        Count: 0
      });

      const event = createMockEvent('DELETE', `/friends/${friendshipId}`, user1, null, {
        id: friendshipId
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('friendship_not_found');
    });
  });

  describe('Get Friends List', () => {
    const mockFriends = [
      {
        friendship_id: 'friendship-1',
        user_id: user1,
        friend_id: 'user-charlie',
        status: 'accepted',
        role: 'requester',
        requested_at: '2025-01-20T10:00:00.000Z',
        responded_at: '2025-01-20T10:05:00.000Z'
      },
      {
        friendship_id: 'friendship-2',
        user_id: user1,
        friend_id: user2,
        status: 'accepted',
        role: 'addressee',
        requested_at: '2025-01-19T10:00:00.000Z',
        responded_at: '2025-01-19T10:10:00.000Z'
      }
    ];

    it('should return friends list', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: mockFriends,
        LastEvaluatedKey: undefined,
        Count: 2
      });

      (DynamoDBHelper.getUserProfile as jest.Mock)
        .mockResolvedValueOnce({
          user_id: 'user-charlie',
          username: 'charlie',
          full_name: 'Charlie Brown',
          avatar_url: 'https://example.com/charlie.jpg'
        })
        .mockResolvedValueOnce({
          user_id: user2,
          username: 'bob',
          full_name: 'Bob Smith',
          avatar_url: 'https://example.com/bob.jpg'
        });

      const event = createMockEvent('GET', '/friends', user1, null, null, {
        limit: '10'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.data.friends).toHaveLength(2);
      expect(response.data.total_count).toBe(2);
      expect(response.data.friends[0].username).toBe('charlie');
      expect(response.data.friends[1].username).toBe('bob');
    });

    it('should filter friends by status', async () => {
      const pendingFriend = {
        friendship_id: 'friendship-3',
        user_id: user1,
        friend_id: 'user-david',
        status: 'pending',
        role: 'addressee',
        requested_at: '2025-01-21T10:00:00.000Z'
      };

      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [pendingFriend],
        LastEvaluatedKey: undefined,
        Count: 1
      });

      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
        user_id: 'user-david',
        username: 'david',
        full_name: 'David Lee'
      });

      const event = createMockEvent('GET', '/friends', user1, null, null, {
        status_filter: 'pending'
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.data.friends).toHaveLength(1);
      expect(response.data.friends[0].friendship_status).toBe('pending');
      expect(response.data.friends[0].username).toBe('david');

      // Verify query included status filter
      expect(mockDynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: '#status = :status',
          ExpressionAttributeValues: expect.objectContaining({
            ':status': 'pending'
          })
        })
      );
    });

    it('should return empty list if no friends', async () => {
      mockDynamoDBHelper.query.mockResolvedValue({
        Items: [],
        LastEvaluatedKey: undefined,
        Count: 0
      });

      const event = createMockEvent('GET', '/friends', user1);

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const response = JSON.parse(result.body);
      expect(response.data.friends).toHaveLength(0);
      expect(response.data.total_count).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoint', async () => {
      const event = createMockEvent('GET', '/unknown/endpoint', user1);

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('not_found');
    });

    it('should handle DynamoDB errors', async () => {
      (DynamoDBHelper.getUserProfile as jest.Mock).mockRejectedValue(
        new Error('DynamoDB error')
      );

      const event = createMockEvent('POST', '/friends/request', user1, {
        addressee_id: user2
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('internal_server_error');
    });
  });
});
