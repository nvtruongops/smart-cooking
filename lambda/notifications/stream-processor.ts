/**
 * DynamoDB Streams Processor for Notification Triggers
 * Listens to changes in friends, posts, comments, reactions, and recipes tables
 * Creates notifications for relevant events
 */

import { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { createNotification } from './index';
import { logger } from '../shared/logger';

interface StreamRecord {
  PK: string;
  SK: string;
  [key: string]: any;
}

/**
 * Main Stream Handler
 */
export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  logger.info('Stream processor started', { recordCount: event.Records.length });

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      logger.error('Failed to process stream record', {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventID: record.eventID,
        eventName: record.eventName,
      });
      // Continue processing other records
    }
  }

  logger.info('Stream processor completed');
}

/**
 * Process individual DynamoDB Stream record
 */
async function processRecord(record: DynamoDBRecord): Promise<void> {
  const { eventName, dynamodb } = record;

  if (!dynamodb?.NewImage) {
    return; // Skip records without new image
  }

  // Unmarshall DynamoDB record
  const newImage = unmarshall(
    dynamodb.NewImage as Record<string, AttributeValue>
  ) as StreamRecord;

  const oldImage = dynamodb.OldImage
    ? (unmarshall(dynamodb.OldImage as Record<string, AttributeValue>) as StreamRecord)
    : null;

  // Route to appropriate handler based on entity type
  const { PK, SK } = newImage;

  // Friend requests: PK=USER#<id>, SK=FRIEND#<friend_id>
  if (SK.startsWith('FRIEND#')) {
    await handleFriendshipEvent(eventName, newImage, oldImage);
  }
  // Comments: PK=POST#<id>, SK=COMMENT#<timestamp>#<id>
  else if (SK.startsWith('COMMENT#')) {
    await handleCommentEvent(eventName, newImage);
  }
  // Reactions: PK=POST#<id> or COMMENT#<id>, SK=REACTION#<user_id>
  else if (SK.startsWith('REACTION#')) {
    await handleReactionEvent(eventName, newImage);
  }
  // Recipe auto-approval: PK=RECIPE#<id>, SK=METADATA
  else if (PK.startsWith('RECIPE#') && SK === 'METADATA') {
    await handleRecipeApprovalEvent(eventName, newImage, oldImage);
  }
  // Posts with mentions: PK=POST#<id>, SK=METADATA
  else if (PK.startsWith('POST#') && SK === 'METADATA' && eventName === 'INSERT') {
    await handlePostMentions(newImage);
  }
}

/**
 * Handle friendship events (friend_request, friend_accept)
 */
async function handleFriendshipEvent(
  eventName: string | undefined,
  newImage: StreamRecord,
  oldImage: StreamRecord | null
): Promise<void> {
  const { PK, SK, status, user_id, friend_id, friend_username } = newImage;

  // Friend request sent (new record with status=pending)
  if (eventName === 'INSERT' && status === 'pending') {
    await createNotification(
      friend_id, // Recipient
      'friend_request',
      user_id, // Actor
      'friendship',
      `${user_id}#${friend_id}`, // Friendship ID
      `sent you a friend request`
    );
    logger.info('Friend request notification created', { user_id, friend_id });
  }

  // Friend request accepted (status changed from pending to accepted)
  if (
    eventName === 'MODIFY' &&
    oldImage?.status === 'pending' &&
    newImage.status === 'accepted'
  ) {
    // Notify the original requester
    await createNotification(
      user_id, // Original requester
      'friend_accept',
      friend_id, // Actor who accepted
      'friendship',
      `${user_id}#${friend_id}`,
      `accepted your friend request`
    );
    logger.info('Friend accept notification created', { user_id, friend_id });
  }
}

/**
 * Handle comment events
 */
async function handleCommentEvent(
  eventName: string | undefined,
  newImage: StreamRecord
): Promise<void> {
  if (eventName !== 'INSERT') {
    return; // Only process new comments
  }

  const { PK, user_id, post_id, comment_id, parent_comment_id } = newImage;

  // Extract post_id from PK (POST#<post_id>)
  const targetPostId = PK.replace('POST#', '');

  // Get post owner to send notification
  const postOwner = await getPostOwner(targetPostId);
  if (!postOwner || postOwner === user_id) {
    return; // Don't notify self
  }

  await createNotification(
    postOwner, // Post owner
    'comment',
    user_id, // Commenter
    'post',
    targetPostId,
    parent_comment_id
      ? `replied to a comment on your post`
      : `commented on your post`
  );

  logger.info('Comment notification created', {
    post_id: targetPostId,
    comment_id,
    commenter: user_id,
    post_owner: postOwner,
  });
}

/**
 * Handle reaction events (like, love, wow)
 */
async function handleReactionEvent(
  eventName: string | undefined,
  newImage: StreamRecord
): Promise<void> {
  if (eventName !== 'INSERT') {
    return; // Only process new reactions
  }

  const { PK, SK, user_id, reaction_type, target_type } = newImage;

  // Extract target ID from PK
  let targetId: string;
  let targetOwner: string | null = null;

  if (target_type === 'post') {
    targetId = PK.replace('POST#', '');
    targetOwner = await getPostOwner(targetId);
  } else if (target_type === 'comment') {
    targetId = PK.replace('COMMENT#', '');
    targetOwner = await getCommentOwner(targetId);
  } else {
    return; // Unknown target type
  }

  if (!targetOwner || targetOwner === user_id) {
    return; // Don't notify self
  }

  // Create human-readable reaction text
  const reactionText = reaction_type === 'like' ? 'liked' : `reacted ${reaction_type} to`;

  await createNotification(
    targetOwner,
    'reaction',
    user_id,
    target_type as 'post' | 'comment',
    targetId,
    `${reactionText} your ${target_type}`
  );

  logger.info('Reaction notification created', {
    target_type,
    target_id: targetId,
    reaction_type,
    reactor: user_id,
    owner: targetOwner,
  });
}

/**
 * Handle recipe auto-approval events
 */
async function handleRecipeApprovalEvent(
  eventName: string | undefined,
  newImage: StreamRecord,
  oldImage: StreamRecord | null
): Promise<void> {
  if (eventName !== 'MODIFY') {
    return; // Only process updates
  }

  const { PK, approval_status, average_rating, created_by } = newImage;

  // Check if approval status changed to approved
  if (
    oldImage?.approval_status !== 'approved' &&
    newImage.approval_status === 'approved'
  ) {
    const recipeId = PK.replace('RECIPE#', '');

    await createNotification(
      created_by, // Recipe creator
      'recipe_approved',
      'system', // System notification
      'recipe',
      recipeId,
      `Your recipe has been auto-approved! (${average_rating?.toFixed(1)} ⭐)`
    );

    logger.info('Recipe approval notification created', {
      recipe_id: recipeId,
      creator: created_by,
      average_rating,
    });
  }
}

/**
 * Handle @mentions in posts
 */
async function handlePostMentions(newImage: StreamRecord): Promise<void> {
  const { content, user_id, post_id } = newImage;

  if (!content) {
    return;
  }

  // Extract mentions using regex: @username
  const mentionRegex = /@(\w+)/g;
  const mentions = content.match(mentionRegex);

  if (!mentions || mentions.length === 0) {
    return;
  }

  // Get unique mentioned usernames
  const uniqueMentions = [...new Set(mentions.map((m: string) => m.substring(1)))];

  // Create notifications for each mentioned user
  for (const mentionedUsername of uniqueMentions) {
    const mentionedUserId = await getUserIdByUsername(String(mentionedUsername));

    if (!mentionedUserId || mentionedUserId === user_id) {
      continue; // Skip if user not found or self-mention
    }

    await createNotification(
      mentionedUserId,
      'mention',
      user_id,
      'post',
      post_id,
      `mentioned you in a post`
    );

    logger.info('Mention notification created', {
      post_id,
      mentioned_user: mentionedUserId,
      mentioned_username: mentionedUsername,
      author: user_id,
    });
  }
}

/**
 * Helper: Get post owner from DynamoDB
 */
async function getPostOwner(postId: string): Promise<string | null> {
  try {
    const { DynamoDBHelper } = await import('../shared/dynamodb');
    const post = await DynamoDBHelper.get(`POST#${postId}`, 'METADATA');
    return post?.user_id || null;
  } catch (error) {
    logger.error('Failed to get post owner', { postId, error });
    return null;
  }
}

/**
 * Helper: Get comment owner from DynamoDB
 */
async function getCommentOwner(commentId: string): Promise<string | null> {
  try {
    const { DynamoDBHelper } = await import('../shared/dynamodb');
    // Query to find comment by comment_id in GSI
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `COMMENT#${commentId}`,
      },
      Limit: 1,
    });

    return result.Items?.[0]?.user_id || null;
  } catch (error) {
    logger.error('Failed to get comment owner', { commentId, error });
    return null;
  }
}

/**
 * Helper: Get user ID by username
 */
async function getUserIdByUsername(username: string): Promise<string | null> {
  try {
    const { DynamoDBHelper } = await import('../shared/dynamodb');
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `USERNAME#${username.toLowerCase()}`,
      },
      Limit: 1,
    });

    return result.Items?.[0]?.user_id || null;
  } catch (error) {
    logger.error('Failed to get user by username', { username, error });
    return null;
  }
}
