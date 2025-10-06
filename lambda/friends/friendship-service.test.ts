/**
 * Friendship Service Test Suite
 * Tests bidirectional friendship data model with GSI4 reverse lookup
 */

import { FriendshipService } from './friendship-service';
import { DynamoDBHelper } from '../shared/dynamodb';
import { AppError } from '../shared/responses';
import { FriendshipStatus } from './types';

// Mock dependencies
jest.mock('../shared/dynamodb');
jest.mock('../shared/utils', () => ({
  formatTimestamp: jest.fn(() => '2025-10-06T10:00:00.000Z'),
  logStructured: jest.fn()
}));

describe('FriendshipService - Bidirectional Data Model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendFriendRequest', () => {
    it('should create bidirectional friendship records with GSI4 attributes', async () => {
      const requesterId = 'user-123';
      const addresseeId = 'user-456';

      // Mock addressee exists
      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
        user_id: addresseeId,
        username: 'john_doe'
      });

      // Mock no existing friendship
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);

      // Mock put operations
      (DynamoDBHelper.put as jest.Mock).mockResolvedValue({});

      const result = await FriendshipService.sendFriendRequest(requesterId, {
        addressee_id: addresseeId,
        message: 'Hi, let\'s be friends!'
      });

      // Verify result
      expect(result.requester_id).toBe(requesterId);
      expect(result.addressee_id).toBe(addresseeId);
      expect(result.status).toBe('pending');
      expect(result.requested_at).toBe('2025-10-06T10:00:00.000Z');

      // Verify bidirectional storage
      expect(DynamoDBHelper.put).toHaveBeenCalledTimes(2);

      // Verify Record 1: Requester's perspective
      expect(DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `USER#${requesterId}`,
          SK: `FRIEND#${addresseeId}`,
          EntityType: 'Friendship',
          user_id: requesterId,
          friend_id: addresseeId,
          status: 'pending',
          role: 'requester',
          GSI4PK: `FRIEND#${addresseeId}`,
          GSI4SK: expect.stringContaining(`USER#${requesterId}#`)
        })
      );

      // Verify Record 2: Addressee's perspective
      expect(DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `USER#${addresseeId}`,
          SK: `FRIEND#${requesterId}`,
          EntityType: 'Friendship',
          user_id: addresseeId,
          friend_id: requesterId,
          status: 'pending',
          role: 'addressee',
          GSI4PK: `FRIEND#${requesterId}`,
          GSI4SK: expect.stringContaining(`USER#${addresseeId}#`)
        })
      );
    });

    it('should throw error when sending friend request to self', async () => {
      const userId = 'user-123';

      await expect(
        FriendshipService.sendFriendRequest(userId, { addressee_id: userId })
      ).rejects.toThrow(AppError);
    });

    it('should throw error when addressee does not exist', async () => {
      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue(null);

      await expect(
        FriendshipService.sendFriendRequest('user-123', { addressee_id: 'user-999' })
      ).rejects.toThrow('User not found');
    });

    it('should throw error when friendship already exists', async () => {
      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
        user_id: 'user-456'
      });

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue({
        status: 'accepted'
      });

      await expect(
        FriendshipService.sendFriendRequest('user-123', { addressee_id: 'user-456' })
      ).rejects.toThrow('already friends');
    });

    it('should throw error when friend request already pending', async () => {
      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
        user_id: 'user-456'
      });

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue({
        status: 'pending'
      });

      await expect(
        FriendshipService.sendFriendRequest('user-123', { addressee_id: 'user-456' })
      ).rejects.toThrow('request already pending');
    });

    it('should throw error when user is blocked', async () => {
      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
        user_id: 'user-456'
      });

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue({
        status: 'blocked'
      });

      await expect(
        FriendshipService.sendFriendRequest('user-123', { addressee_id: 'user-456' })
      ).rejects.toThrow('Cannot send friend request to this user');
    });
  });

  describe('acceptFriendRequest', () => {
    it('should update both records to accepted status with timestamp', async () => {
      const addresseeId = 'user-456';
      const requesterId = 'user-123';
      const friendshipId = 'friendship-789';

      // Mock getting friendship
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: addresseeId,
          friend_id: requesterId,
          status: 'pending',
          role: 'addressee',
          requested_at: '2025-10-06T09:00:00.000Z',
          created_at: '2025-10-06T09:00:00.000Z'
        }]
      });

      // Mock update operations
      (DynamoDBHelper.update as jest.Mock).mockResolvedValue({});

      const result = await FriendshipService.acceptFriendRequest(addresseeId, friendshipId);

      // Verify result
      expect(result.status).toBe('accepted');
      expect(result.responded_at).toBe('2025-10-06T10:00:00.000Z');

      // Verify both records updated
      expect(DynamoDBHelper.update).toHaveBeenCalledTimes(2);

      // Verify addressee's record updated
      expect(DynamoDBHelper.update).toHaveBeenCalledWith(
        `USER#${addresseeId}`,
        `FRIEND#${requesterId}`,
        expect.any(String),
        expect.objectContaining({
          ':status': 'accepted'
        }),
        expect.any(Object)
      );

      // Verify requester's record updated
      expect(DynamoDBHelper.update).toHaveBeenCalledWith(
        `USER#${requesterId}`,
        `FRIEND#${addresseeId}`,
        expect.any(String),
        expect.objectContaining({
          ':status': 'accepted'
        }),
        expect.any(Object)
      );
    });

    it('should throw error when friendship not found', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({ Items: [] });

      await expect(
        FriendshipService.acceptFriendRequest('user-456', 'friendship-999')
      ).rejects.toThrow('Friend request not found');
    });

    it('should throw error when user is not addressee', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: [{
          friendship_id: 'friendship-789',
          role: 'requester',
          status: 'pending'
        }]
      });

      await expect(
        FriendshipService.acceptFriendRequest('user-123', 'friendship-789')
      ).rejects.toThrow('cannot accept this friend request');
    });

    it('should throw error when request already accepted', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: [{
          friendship_id: 'friendship-789',
          role: 'addressee',
          status: 'accepted'
        }]
      });

      await expect(
        FriendshipService.acceptFriendRequest('user-456', 'friendship-789')
      ).rejects.toThrow('already accepted');
    });
  });

  describe('rejectFriendRequest', () => {
    it('should update both records to rejected status', async () => {
      const addresseeId = 'user-456';
      const requesterId = 'user-123';
      const friendshipId = 'friendship-789';

      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: addresseeId,
          friend_id: requesterId,
          status: 'pending',
          role: 'addressee'
        }]
      });

      (DynamoDBHelper.update as jest.Mock).mockResolvedValue({});

      await FriendshipService.rejectFriendRequest(addresseeId, friendshipId);

      // Verify both records updated to rejected
      expect(DynamoDBHelper.update).toHaveBeenCalledTimes(2);
      expect(DynamoDBHelper.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          ':status': 'rejected'
        }),
        expect.any(Object)
      );
    });
  });

  describe('removeFriendship', () => {
    it('should delete both friendship records', async () => {
      const userId = 'user-123';
      const friendId = 'user-456';
      const friendshipId = 'friendship-789';

      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: [{
          friendship_id: friendshipId,
          user_id: userId,
          friend_id: friendId,
          status: 'accepted'
        }]
      });

      (DynamoDBHelper.delete as jest.Mock).mockResolvedValue({});

      await FriendshipService.removeFriendship(userId, friendshipId);

      // Verify both records deleted
      expect(DynamoDBHelper.delete).toHaveBeenCalledTimes(2);
      expect(DynamoDBHelper.delete).toHaveBeenCalledWith(
        `USER#${userId}`,
        `FRIEND#${friendId}`
      );
      expect(DynamoDBHelper.delete).toHaveBeenCalledWith(
        `USER#${friendId}`,
        `FRIEND#${userId}`
      );
    });

    it('should throw error when friendship not found', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({ Items: [] });

      await expect(
        FriendshipService.removeFriendship('user-123', 'friendship-999')
      ).rejects.toThrow('Friendship not found');
    });
  });

  describe('getFriends', () => {
    it('should query friends with status filter', async () => {
      const userId = 'user-123';

      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: [
          {
            friendship_id: 'friendship-1',
            friend_id: 'user-456',
            status: 'accepted',
            requested_at: '2025-10-06T09:00:00.000Z',
            responded_at: '2025-10-06T09:30:00.000Z'
          },
          {
            friendship_id: 'friendship-2',
            friend_id: 'user-789',
            status: 'accepted',
            requested_at: '2025-10-06T08:00:00.000Z',
            responded_at: '2025-10-06T08:30:00.000Z'
          }
        ]
      });

      (DynamoDBHelper.getUserProfile as jest.Mock)
        .mockResolvedValueOnce({
          user_id: 'user-456',
          username: 'john_doe',
          full_name: 'John Doe',
          avatar_url: 'avatar1.jpg'
        })
        .mockResolvedValueOnce({
          user_id: 'user-789',
          username: 'jane_doe',
          full_name: 'Jane Doe',
          avatar_url: 'avatar2.jpg'
        });

      const result = await FriendshipService.getFriends(userId, {
        status_filter: 'accepted',
        limit: 20
      });

      expect(result.friends).toHaveLength(2);
      expect(result.friends[0].user_id).toBe('user-456');
      expect(result.friends[0].friendship_status).toBe('accepted');
      expect(result.friends[1].user_id).toBe('user-789');

      // Verify query parameters
      expect(DynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: expect.objectContaining({
            ':pk': `USER#${userId}`,
            ':sk': 'FRIEND#',
            ':status': 'accepted'
          }),
          FilterExpression: '#status = :status'
        })
      );
    });

    it('should support pagination', async () => {
      const userId = 'user-123';
      const startKey = JSON.stringify({ PK: 'USER#user-123', SK: 'FRIEND#user-456' });

      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: [],
        LastEvaluatedKey: { PK: 'USER#user-123', SK: 'FRIEND#user-789' }
      });

      const result = await FriendshipService.getFriends(userId, {
        limit: 10,
        start_key: startKey
      });

      expect(DynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          Limit: 10,
          ExclusiveStartKey: { PK: 'USER#user-123', SK: 'FRIEND#user-456' }
        })
      );

      expect(result.last_evaluated_key).toBeDefined();
    });
  });

  describe('getReverseFriendships - GSI4 Reverse Lookup', () => {
    it('should query friendships using GSI4 for reverse lookup', async () => {
      const userId = 'user-123';

      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: [
          {
            friendship_id: 'friendship-1',
            user_id: 'user-456',
            friend_id: userId,
            status: 'pending',
            requested_at: '2025-10-06T09:00:00.000Z'
          },
          {
            friendship_id: 'friendship-2',
            user_id: 'user-789',
            friend_id: userId,
            status: 'pending',
            requested_at: '2025-10-06T08:00:00.000Z'
          }
        ]
      });

      (DynamoDBHelper.getUserProfile as jest.Mock)
        .mockResolvedValueOnce({
          user_id: 'user-456',
          username: 'john_doe',
          full_name: 'John Doe'
        })
        .mockResolvedValueOnce({
          user_id: 'user-789',
          username: 'jane_doe',
          full_name: 'Jane Doe'
        });

      const result = await FriendshipService.getReverseFriendships(userId);

      expect(result).toHaveLength(2);
      expect(result[0].user_id).toBe('user-456');
      expect(result[1].user_id).toBe('user-789');

      // Verify GSI4 query
      expect(DynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          IndexName: 'GSI4',
          KeyConditionExpression: 'GSI4PK = :gsi4pk',
          ExpressionAttributeValues: {
            ':gsi4pk': `FRIEND#${userId}`
          }
        })
      );
    });

    it('should filter reverse friendships by status', async () => {
      const userId = 'user-123';

      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: [
          {
            friendship_id: 'friendship-1',
            user_id: 'user-456',
            status: 'pending'
          }
        ]
      });

      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
        user_id: 'user-456',
        username: 'john_doe'
      });

      await FriendshipService.getReverseFriendships(userId, 'pending');

      // Verify status filter applied
      expect(DynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          IndexName: 'GSI4',
          FilterExpression: '#status = :status',
          ExpressionAttributeValues: expect.objectContaining({
            ':status': 'pending'
          })
        })
      );
    });
  });

  describe('Friendship Status Tracking', () => {
    const statuses: FriendshipStatus[] = ['pending', 'accepted', 'rejected', 'blocked'];

    statuses.forEach(status => {
      it(`should track ${status} status correctly`, async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: [{
            friendship_id: 'friendship-1',
            user_id: 'user-123',
            friend_id: 'user-456',
            status: status,
            requested_at: '2025-10-06T09:00:00.000Z',
            responded_at: status !== 'pending' ? '2025-10-06T09:30:00.000Z' : undefined
          }]
        });

        (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
          user_id: 'user-456',
          username: 'john_doe'
        });

        const result = await FriendshipService.getFriends('user-123', { status_filter: status });

        expect(result.friends[0].friendship_status).toBe(status);
      });
    });
  });

  describe('Timestamp Tracking', () => {
    it('should track requested_at timestamp on friend request', async () => {
      const requesterId = 'user-123';
      const addresseeId = 'user-456';

      (DynamoDBHelper.getUserProfile as jest.Mock).mockResolvedValue({
        user_id: addresseeId
      });
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);
      (DynamoDBHelper.put as jest.Mock).mockResolvedValue({});

      const result = await FriendshipService.sendFriendRequest(requesterId, {
        addressee_id: addresseeId
      });

      expect(result.requested_at).toBe('2025-10-06T10:00:00.000Z');
      expect(result.created_at).toBe('2025-10-06T10:00:00.000Z');
    });

    it('should track responded_at timestamp on accept', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: [{
          friendship_id: 'friendship-789',
          user_id: 'user-456',
          friend_id: 'user-123',
          status: 'pending',
          role: 'addressee',
          requested_at: '2025-10-06T09:00:00.000Z',
          created_at: '2025-10-06T09:00:00.000Z'
        }]
      });

      (DynamoDBHelper.update as jest.Mock).mockResolvedValue({});

      const result = await FriendshipService.acceptFriendRequest('user-456', 'friendship-789');

      expect(result.responded_at).toBe('2025-10-06T10:00:00.000Z');
      expect(result.updated_at).toBe('2025-10-06T10:00:00.000Z');
    });
  });
});
