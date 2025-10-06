/**
 * Stream Processor - Unit Tests
 */

import { handler } from './stream-processor';
import { DynamoDBStreamEvent } from 'aws-lambda';
import { createNotification } from './index';
import { DynamoDBHelper } from '../shared/dynamodb';

// Mock dependencies
jest.mock('./index', () => ({
  createNotification: jest.fn(),
}));

jest.mock('../shared/dynamodb', () => ({
  DynamoDBHelper: {
    get: jest.fn(),
    query: jest.fn(),
  },
}));

jest.mock('../shared/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockCreateNotification = createNotification as jest.MockedFunction<typeof createNotification>;
const mockGet = DynamoDBHelper.get as jest.MockedFunction<typeof DynamoDBHelper.get>;
const mockQuery = DynamoDBHelper.query as jest.MockedFunction<typeof DynamoDBHelper.query>;

describe('Stream Processor - Notification Triggers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Friend Request Events', () => {
    test('should create notification for new friend request', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'USER#user-123' },
                SK: { S: 'FRIEND#user-456' },
                status: { S: 'pending' },
                user_id: { S: 'user-123' },
                friend_id: { S: 'user-456' },
                friend_username: { S: 'friend456' },
                requested_at: { S: '2025-10-06T10:00:00.000Z' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).toHaveBeenCalledWith(
        'user-456', // Recipient
        'friend_request',
        'user-123', // Actor
        'friendship',
        'user-123#user-456',
        'sent you a friend request'
      );
    });

    test('should create notification for accepted friend request', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'MODIFY',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              OldImage: {
                PK: { S: 'USER#user-123' },
                SK: { S: 'FRIEND#user-456' },
                status: { S: 'pending' },
                user_id: { S: 'user-123' },
                friend_id: { S: 'user-456' },
              },
              NewImage: {
                PK: { S: 'USER#user-123' },
                SK: { S: 'FRIEND#user-456' },
                status: { S: 'accepted' },
                user_id: { S: 'user-123' },
                friend_id: { S: 'user-456' },
                responded_at: { S: '2025-10-06T10:05:00.000Z' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).toHaveBeenCalledWith(
        'user-123', // Original requester
        'friend_accept',
        'user-456', // Actor who accepted
        'friendship',
        'user-123#user-456',
        'accepted your friend request'
      );
    });

    test('should not create notification for rejected friend request', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'MODIFY',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              OldImage: {
                status: { S: 'pending' },
              },
              NewImage: {
                PK: { S: 'USER#user-123' },
                SK: { S: 'FRIEND#user-456' },
                status: { S: 'rejected' },
                user_id: { S: 'user-123' },
                friend_id: { S: 'user-456' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });

  describe('Comment Events', () => {
    test('should create notification for new comment on post', async () => {
      mockGet.mockResolvedValueOnce({
        user_id: 'post-owner-123',
      });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-456' },
                SK: { S: 'COMMENT#2025-10-06T10:00:00.000Z#comment-789' },
                user_id: { S: 'commenter-123' },
                post_id: { S: 'post-456' },
                comment_id: { S: 'comment-789' },
                content: { S: 'Great post!' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockGet).toHaveBeenCalledWith('POST#post-456', 'METADATA');
      expect(mockCreateNotification).toHaveBeenCalledWith(
        'post-owner-123',
        'comment',
        'commenter-123',
        'post',
        'post-456',
        'commented on your post'
      );
    });

    test('should create notification for reply to comment', async () => {
      mockGet.mockResolvedValueOnce({
        user_id: 'post-owner-123',
      });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-456' },
                SK: { S: 'COMMENT#2025-10-06T10:05:00.000Z#reply-789' },
                user_id: { S: 'replier-123' },
                post_id: { S: 'post-456' },
                comment_id: { S: 'reply-789' },
                parent_comment_id: { S: 'comment-original' },
                content: { S: 'I agree!' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).toHaveBeenCalledWith(
        'post-owner-123',
        'comment',
        'replier-123',
        'post',
        'post-456',
        'replied to a comment on your post'
      );
    });

    test('should not notify self when commenting on own post', async () => {
      mockGet.mockResolvedValueOnce({
        user_id: 'user-123', // Same as commenter
      });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-456' },
                SK: { S: 'COMMENT#2025-10-06T10:00:00.000Z#comment-789' },
                user_id: { S: 'user-123' },
                post_id: { S: 'post-456' },
                comment_id: { S: 'comment-789' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });

  describe('Reaction Events', () => {
    test('should create notification for reaction on post', async () => {
      mockGet.mockResolvedValueOnce({
        user_id: 'post-owner-123',
      });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-456' },
                SK: { S: 'REACTION#user-789' },
                user_id: { S: 'user-789' },
                reaction_type: { S: 'like' },
                target_type: { S: 'post' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockGet).toHaveBeenCalledWith('POST#post-456', 'METADATA');
      expect(mockCreateNotification).toHaveBeenCalledWith(
        'post-owner-123',
        'reaction',
        'user-789',
        'post',
        'post-456',
        'liked your post'
      );
    });

    test('should create notification for love reaction', async () => {
      mockGet.mockResolvedValueOnce({
        user_id: 'post-owner-123',
      });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-456' },
                SK: { S: 'REACTION#user-789' },
                user_id: { S: 'user-789' },
                reaction_type: { S: 'love' },
                target_type: { S: 'post' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).toHaveBeenCalledWith(
        'post-owner-123',
        'reaction',
        'user-789',
        'post',
        'post-456',
        'reacted love to your post'
      );
    });

    test('should create notification for reaction on comment', async () => {
      mockQuery.mockResolvedValueOnce({
        Items: [{ user_id: 'comment-owner-123' }],
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'COMMENT#comment-456' },
                SK: { S: 'REACTION#user-789' },
                user_id: { S: 'user-789' },
                reaction_type: { S: 'wow' },
                target_type: { S: 'comment' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockQuery).toHaveBeenCalledWith({
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'COMMENT#comment-456',
        },
        Limit: 1,
      });

      expect(mockCreateNotification).toHaveBeenCalledWith(
        'comment-owner-123',
        'reaction',
        'user-789',
        'comment',
        'comment-456',
        'reacted wow to your comment'
      );
    });

    test('should not notify self when reacting to own post', async () => {
      mockGet.mockResolvedValueOnce({
        user_id: 'user-123', // Same as reactor
      });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-456' },
                SK: { S: 'REACTION#user-123' },
                user_id: { S: 'user-123' },
                reaction_type: { S: 'like' },
                target_type: { S: 'post' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });

  describe('Recipe Approval Events', () => {
    test('should create notification for recipe auto-approval', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'MODIFY',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              OldImage: {
                PK: { S: 'RECIPE#recipe-123' },
                SK: { S: 'METADATA' },
                approval_status: { S: 'pending' },
                average_rating: { N: '3.5' },
                created_by: { S: 'chef-456' },
              },
              NewImage: {
                PK: { S: 'RECIPE#recipe-123' },
                SK: { S: 'METADATA' },
                approval_status: { S: 'approved' },
                average_rating: { N: '4.2' },
                created_by: { S: 'chef-456' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).toHaveBeenCalledWith(
        'chef-456',
        'recipe_approved',
        'system',
        'recipe',
        'recipe-123',
        'Your recipe has been auto-approved! (4.2 ⭐)'
      );
    });

    test('should not create notification if already approved', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'MODIFY',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              OldImage: {
                approval_status: { S: 'approved' },
              },
              NewImage: {
                PK: { S: 'RECIPE#recipe-123' },
                SK: { S: 'METADATA' },
                approval_status: { S: 'approved' },
                average_rating: { N: '4.5' },
                created_by: { S: 'chef-456' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });

  describe('Mention Events', () => {
    test('should create notification for @mention in post', async () => {
      mockQuery.mockResolvedValueOnce({
        Items: [{ user_id: 'user-mentioned-123' }],
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-789' },
                SK: { S: 'METADATA' },
                post_id: { S: 'post-789' },
                user_id: { S: 'author-456' },
                content: { S: 'Hey @johndoe check this out!' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockQuery).toHaveBeenCalledWith({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'USERNAME#johndoe',
        },
        Limit: 1,
      });

      expect(mockCreateNotification).toHaveBeenCalledWith(
        'user-mentioned-123',
        'mention',
        'author-456',
        'post',
        'post-789',
        'mentioned you in a post'
      );
    });

    test('should create notifications for multiple mentions', async () => {
      mockQuery
        .mockResolvedValueOnce({
          Items: [{ user_id: 'user-1' }],
          Count: 1,
          LastEvaluatedKey: undefined,
        })
        .mockResolvedValueOnce({
          Items: [{ user_id: 'user-2' }],
          Count: 1,
          LastEvaluatedKey: undefined,
        });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-789' },
                SK: { S: 'METADATA' },
                post_id: { S: 'post-789' },
                user_id: { S: 'author-456' },
                content: { S: 'Thanks @alice and @bob for the help!' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).toHaveBeenCalledTimes(2);
      expect(mockCreateNotification).toHaveBeenCalledWith(
        'user-1',
        'mention',
        'author-456',
        'post',
        'post-789',
        'mentioned you in a post'
      );
      expect(mockCreateNotification).toHaveBeenCalledWith(
        'user-2',
        'mention',
        'author-456',
        'post',
        'post-789',
        'mentioned you in a post'
      );
    });

    test('should not create notification for self-mention', async () => {
      mockQuery.mockResolvedValueOnce({
        Items: [{ user_id: 'author-456' }], // Same as post author
        Count: 1,
        LastEvaluatedKey: undefined,
      });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-789' },
                SK: { S: 'METADATA' },
                post_id: { S: 'post-789' },
                user_id: { S: 'author-456' },
                content: { S: 'I think @myself should check this' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).not.toHaveBeenCalled();
    });

    test('should handle posts without mentions', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-789' },
                SK: { S: 'METADATA' },
                post_id: { S: 'post-789' },
                user_id: { S: 'author-456' },
                content: { S: 'Regular post without mentions' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should continue processing records if one fails', async () => {
      mockGet
        .mockRejectedValueOnce(new Error('DynamoDB error'))
        .mockResolvedValueOnce({ user_id: 'owner-123' });

      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-1' },
                SK: { S: 'COMMENT#2025-10-06T10:00:00.000Z#comment-1' },
                user_id: { S: 'user-1' },
                post_id: { S: 'post-1' },
                comment_id: { S: 'comment-1' },
              },
            },
          },
          {
            eventID: '2',
            eventName: 'INSERT',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              NewImage: {
                PK: { S: 'POST#post-2' },
                SK: { S: 'COMMENT#2025-10-06T10:01:00.000Z#comment-2' },
                user_id: { S: 'user-2' },
                post_id: { S: 'post-2' },
                comment_id: { S: 'comment-2' },
              },
            },
          },
        ],
      };

      await handler(event);

      // Second record should still be processed
      expect(mockCreateNotification).toHaveBeenCalledWith(
        'owner-123',
        'comment',
        'user-2',
        'post',
        'post-2',
        'commented on your post'
      );
    });

    test('should skip records without NewImage', async () => {
      const event: DynamoDBStreamEvent = {
        Records: [
          {
            eventID: '1',
            eventName: 'REMOVE',
            eventVersion: '1.0',
            eventSource: 'aws:dynamodb',
            awsRegion: 'us-east-1',
            dynamodb: {
              OldImage: {
                PK: { S: 'POST#post-1' },
                SK: { S: 'METADATA' },
              },
            },
          },
        ],
      };

      await handler(event);

      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });
});
