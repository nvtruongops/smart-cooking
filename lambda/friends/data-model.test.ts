/**
 * Integration Tests for Friendship Bidirectional Data Model
 * Tests the DynamoDB schema, bidirectional storage, and query patterns
 */

import { DynamoDBHelper } from '../shared/dynamodb';
import { FriendshipService } from './friendship-service';
import { v4 as uuidv4 } from 'uuid';

// Mock DynamoDB Helper
jest.mock('../shared/dynamodb');
const mockDynamoDBHelper = DynamoDBHelper as jest.Mocked<typeof DynamoDBHelper>;

describe('Friendship Bidirectional Data Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Bidirectional Storage Pattern', () => {
    it('should store friendship from both user perspectives', async () => {
      const userId1 = 'user-alice';
      const userId2 = 'user-bob';

      mockDynamoDBHelper.getUserProfile = jest.fn().mockResolvedValue({
        user_id: userId2,
        username: 'bob',
        email: 'bob@example.com'
      });

      mockDynamoDBHelper.get = jest.fn().mockResolvedValue(undefined);
      mockDynamoDBHelper.put = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.sendFriendRequest(userId1, {
        addressee_id: userId2,
        message: 'Hi!'
      });

      // Verify two records were created
      expect(mockDynamoDBHelper.put).toHaveBeenCalledTimes(2);

      // Verify Record 1: Requester's perspective
      expect(mockDynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `USER#${userId1}`,
          SK: `FRIEND#${userId2}`,
          EntityType: 'Friendship',
          user_id: userId1,
          friend_id: userId2,
          role: 'requester',
          status: 'pending'
        })
      );

      // Verify Record 2: Addressee's perspective
      expect(mockDynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `USER#${userId2}`,
          SK: `FRIEND#${userId1}`,
          EntityType: 'Friendship',
          user_id: userId2,
          friend_id: userId1,
          role: 'addressee',
          status: 'pending'
        })
      );
    });

    it('should maintain same friendship_id for both records', async () => {
      const userId1 = 'user-alice';
      const userId2 = 'user-bob';

      mockDynamoDBHelper.getUserProfile = jest.fn().mockResolvedValue({
        user_id: userId2,
        username: 'bob'
      });

      mockDynamoDBHelper.get = jest.fn().mockResolvedValue(undefined);
      mockDynamoDBHelper.put = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.sendFriendRequest(userId1, {
        addressee_id: userId2
      });

      const calls = (mockDynamoDBHelper.put as jest.Mock).mock.calls;
      const record1 = calls[0][0];
      const record2 = calls[1][0];

      // Both records should have the same friendship_id
      expect(record1.friendship_id).toBeDefined();
      expect(record1.friendship_id).toBe(record2.friendship_id);
    });

    it('should update both records when accepting friendship', async () => {
      const userId1 = 'user-alice';
      const userId2 = 'user-bob';
      const friendshipId = uuidv4();

      mockDynamoDBHelper.query = jest.fn().mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: userId2,
          friend_id: userId1,
          status: 'pending',
          role: 'addressee',
          requested_at: '2025-01-20T10:00:00.000Z',
          created_at: '2025-01-20T10:00:00.000Z'
        }],
        Count: 1
      });

      mockDynamoDBHelper.update = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.acceptFriendRequest(userId2, friendshipId);

      // Verify both records were updated
      expect(mockDynamoDBHelper.update).toHaveBeenCalledTimes(2);

      // Addressee's record
      expect(mockDynamoDBHelper.update).toHaveBeenCalledWith(
        `USER#${userId2}`,
        `FRIEND#${userId1}`,
        expect.any(String),
        expect.objectContaining({
          ':status': 'accepted'
        }),
        expect.any(Object)
      );

      // Requester's record
      expect(mockDynamoDBHelper.update).toHaveBeenCalledWith(
        `USER#${userId1}`,
        `FRIEND#${userId2}`,
        expect.any(String),
        expect.objectContaining({
          ':status': 'accepted'
        }),
        expect.any(Object)
      );
    });

    it('should delete both records when removing friendship', async () => {
      const userId1 = 'user-alice';
      const userId2 = 'user-bob';
      const friendshipId = uuidv4();

      mockDynamoDBHelper.query = jest.fn().mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: userId1,
          friend_id: userId2,
          status: 'accepted',
          role: 'requester'
        }],
        Count: 1
      });

      mockDynamoDBHelper.delete = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.removeFriendship(userId1, friendshipId);

      // Verify both records were deleted
      expect(mockDynamoDBHelper.delete).toHaveBeenCalledTimes(2);
      expect(mockDynamoDBHelper.delete).toHaveBeenCalledWith(
        `USER#${userId1}`,
        `FRIEND#${userId2}`
      );
      expect(mockDynamoDBHelper.delete).toHaveBeenCalledWith(
        `USER#${userId2}`,
        `FRIEND#${userId1}`
      );
    });
  });

  describe('Friendship Status Tracking', () => {
    it('should support pending status', async () => {
      const userId1 = 'user-alice';
      const userId2 = 'user-bob';

      mockDynamoDBHelper.getUserProfile = jest.fn().mockResolvedValue({
        user_id: userId2
      });

      mockDynamoDBHelper.get = jest.fn().mockResolvedValue(undefined);
      mockDynamoDBHelper.put = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.sendFriendRequest(userId1, {
        addressee_id: userId2
      });

      const calls = (mockDynamoDBHelper.put as jest.Mock).mock.calls;
      expect(calls[0][0].status).toBe('pending');
      expect(calls[1][0].status).toBe('pending');
    });

    it('should support accepted status', async () => {
      const userId = 'user-alice';
      const friendId = 'user-bob';
      const friendshipId = uuidv4();

      mockDynamoDBHelper.query = jest.fn().mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: userId,
          friend_id: friendId,
          status: 'pending',
          role: 'addressee',
          requested_at: '2025-01-20T10:00:00.000Z',
          created_at: '2025-01-20T10:00:00.000Z'
        }],
        Count: 1
      });

      mockDynamoDBHelper.update = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.acceptFriendRequest(userId, friendshipId);

      expect(mockDynamoDBHelper.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ':status': 'accepted'
        }),
        expect.any(Object)
      );
    });

    it('should support rejected status', async () => {
      const userId = 'user-alice';
      const friendId = 'user-bob';
      const friendshipId = uuidv4();

      mockDynamoDBHelper.query = jest.fn().mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: userId,
          friend_id: friendId,
          status: 'pending',
          role: 'addressee',
          requested_at: '2025-01-20T10:00:00.000Z'
        }],
        Count: 1
      });

      mockDynamoDBHelper.update = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.rejectFriendRequest(userId, friendshipId);

      expect(mockDynamoDBHelper.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ':status': 'rejected'
        }),
        expect.any(Object)
      );
    });

    it('should prevent friendship with blocked status', async () => {
      const userId1 = 'user-alice';
      const userId2 = 'user-bob';

      mockDynamoDBHelper.getUserProfile = jest.fn().mockResolvedValue({
        user_id: userId2
      });

      mockDynamoDBHelper.get = jest.fn().mockResolvedValue({
        status: 'blocked'
      });

      await expect(
        FriendshipService.sendFriendRequest(userId1, {
          addressee_id: userId2
        })
      ).rejects.toThrow('Cannot send friend request to this user');
    });
  });

  describe('Timestamp Tracking', () => {
    it('should track requested_at timestamp', async () => {
      const userId1 = 'user-alice';
      const userId2 = 'user-bob';

      mockDynamoDBHelper.getUserProfile = jest.fn().mockResolvedValue({
        user_id: userId2
      });

      mockDynamoDBHelper.get = jest.fn().mockResolvedValue(undefined);
      mockDynamoDBHelper.put = jest.fn().mockResolvedValue({} as any);

      const beforeTime = new Date().toISOString();

      await FriendshipService.sendFriendRequest(userId1, {
        addressee_id: userId2
      });

      const afterTime = new Date().toISOString();

      const calls = (mockDynamoDBHelper.put as jest.Mock).mock.calls;
      const record = calls[0][0];

      expect(record.requested_at).toBeDefined();
      expect(record.requested_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(record.requested_at >= beforeTime).toBe(true);
      expect(record.requested_at <= afterTime).toBe(true);
    });

    it('should track responded_at when accepting request', async () => {
      const userId = 'user-alice';
      const friendId = 'user-bob';
      const friendshipId = uuidv4();

      mockDynamoDBHelper.query = jest.fn().mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: userId,
          friend_id: friendId,
          status: 'pending',
          role: 'addressee',
          requested_at: '2025-01-20T10:00:00.000Z',
          created_at: '2025-01-20T10:00:00.000Z'
        }],
        Count: 1
      });

      mockDynamoDBHelper.update = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.acceptFriendRequest(userId, friendshipId);

      const calls = (mockDynamoDBHelper.update as jest.Mock).mock.calls;

      // Check that responded_at timestamp was set (it's passed as :timestamp in the update)
      const firstCallValues = calls[0][3]; // Fourth parameter is ExpressionAttributeValues

      expect(firstCallValues).toHaveProperty(':timestamp');
      expect(firstCallValues[':timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should track created_at and updated_at timestamps', async () => {
      const userId1 = 'user-alice';
      const userId2 = 'user-bob';

      mockDynamoDBHelper.getUserProfile = jest.fn().mockResolvedValue({
        user_id: userId2
      });

      mockDynamoDBHelper.get = jest.fn().mockResolvedValue(undefined);
      mockDynamoDBHelper.put = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.sendFriendRequest(userId1, {
        addressee_id: userId2
      });

      const calls = (mockDynamoDBHelper.put as jest.Mock).mock.calls;
      const record = calls[0][0];

      expect(record.created_at).toBeDefined();
      expect(record.updated_at).toBeDefined();
      expect(record.created_at).toBe(record.updated_at); // Initially the same
    });
  });

  describe('Query Patterns', () => {
    it('should query user friends with PK = USER#userId pattern', async () => {
      const userId = 'user-alice';

      mockDynamoDBHelper.query = jest.fn().mockResolvedValue({
        Items: [],
        Count: 0
      });

      mockDynamoDBHelper.getUserProfile = jest.fn();

      await FriendshipService.getFriends(userId, {});

      expect(mockDynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: expect.objectContaining({
            ':pk': `USER#${userId}`,
            ':sk': 'FRIEND#'
          })
        })
      );
    });

    it('should support status filtering in queries', async () => {
      const userId = 'user-alice';

      mockDynamoDBHelper.query = jest.fn().mockResolvedValue({
        Items: [],
        Count: 0
      });

      await FriendshipService.getFriends(userId, {
        status_filter: 'pending'
      });

      expect(mockDynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: '#status = :status',
          ExpressionAttributeValues: expect.objectContaining({
            ':status': 'pending'
          }),
          ExpressionAttributeNames: expect.objectContaining({
            '#status': 'status'
          })
        })
      );
    });

    it('should support pagination with limit and start_key', async () => {
      const userId = 'user-alice';

      mockDynamoDBHelper.query = jest.fn().mockResolvedValue({
        Items: [],
        Count: 0
      });

      await FriendshipService.getFriends(userId, {
        limit: 10,
        start_key: JSON.stringify({ PK: 'USER#alice', SK: 'FRIEND#bob' })
      });

      expect(mockDynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          Limit: 10,
          ExclusiveStartKey: { PK: 'USER#alice', SK: 'FRIEND#bob' }
        })
      );
    });
  });

  describe('Reverse Lookup (Who Friended Me)', () => {
    it('should find incoming friend requests via bidirectional storage', async () => {
      const userId = 'user-bob';

      // When Alice sends a friend request to Bob,
      // Bob can query his friendships with role='addressee' to see incoming requests
      mockDynamoDBHelper.query = jest.fn().mockResolvedValue({
        Items: [
          {
            friendship_id: 'friendship-1',
            user_id: userId,
            friend_id: 'user-alice',
            status: 'pending',
            role: 'addressee', // Bob is the addressee
            requested_at: '2025-01-20T10:00:00.000Z'
          },
          {
            friendship_id: 'friendship-2',
            user_id: userId,
            friend_id: 'user-charlie',
            status: 'pending',
            role: 'addressee',
            requested_at: '2025-01-21T10:00:00.000Z'
          }
        ],
        Count: 2
      });

      mockDynamoDBHelper.getUserProfile = jest.fn()
        .mockResolvedValueOnce({ user_id: 'user-alice', username: 'alice' })
        .mockResolvedValueOnce({ user_id: 'user-charlie', username: 'charlie' });

      const result = await FriendshipService.getFriends(userId, {
        status_filter: 'pending'
      });

      // Should return friends who sent requests to Bob
      expect(result.friends).toHaveLength(2);
      expect(result.friends[0].user_id).toBe('user-alice');
      expect(result.friends[1].user_id).toBe('user-charlie');
    });
  });

  describe('Data Model Schema Validation', () => {
    it('should have required fields in friendship record', async () => {
      const userId1 = 'user-alice';
      const userId2 = 'user-bob';

      mockDynamoDBHelper.getUserProfile = jest.fn().mockResolvedValue({
        user_id: userId2
      });

      mockDynamoDBHelper.get = jest.fn().mockResolvedValue(undefined);
      mockDynamoDBHelper.put = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.sendFriendRequest(userId1, {
        addressee_id: userId2
      });

      const calls = (mockDynamoDBHelper.put as jest.Mock).mock.calls;
      const record = calls[0][0];

      // Verify all required fields exist
      expect(record).toHaveProperty('PK');
      expect(record).toHaveProperty('SK');
      expect(record).toHaveProperty('EntityType');
      expect(record).toHaveProperty('friendship_id');
      expect(record).toHaveProperty('user_id');
      expect(record).toHaveProperty('friend_id');
      expect(record).toHaveProperty('status');
      expect(record).toHaveProperty('role');
      expect(record).toHaveProperty('requested_at');
      expect(record).toHaveProperty('created_at');
      expect(record).toHaveProperty('updated_at');
    });

    it('should use correct PK/SK pattern for friendship records', async () => {
      const userId1 = 'user-alice';
      const userId2 = 'user-bob';

      mockDynamoDBHelper.getUserProfile = jest.fn().mockResolvedValue({
        user_id: userId2
      });

      mockDynamoDBHelper.get = jest.fn().mockResolvedValue(undefined);
      mockDynamoDBHelper.put = jest.fn().mockResolvedValue({} as any);

      await FriendshipService.sendFriendRequest(userId1, {
        addressee_id: userId2
      });

      const calls = (mockDynamoDBHelper.put as jest.Mock).mock.calls;

      // Record 1: USER#alice -> FRIEND#bob
      expect(calls[0][0].PK).toBe(`USER#${userId1}`);
      expect(calls[0][0].SK).toBe(`FRIEND#${userId2}`);

      // Record 2: USER#bob -> FRIEND#alice
      expect(calls[1][0].PK).toBe(`USER#${userId2}`);
      expect(calls[1][0].SK).toBe(`FRIEND#${userId1}`);
    });
  });
});
