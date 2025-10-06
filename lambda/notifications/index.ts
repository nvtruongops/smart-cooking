/**
 * Notifications Lambda Handler
 * Manages user notifications with real-time updates and TTL cleanup
 */

import { APIGatewayEvent, APIResponse, Notification, NotificationResponse } from '../shared/types';
import { successResponse, errorResponse, handleError, AppError } from '../shared/responses';
import { DynamoDBHelper } from '../shared/dynamodb';
import { getUserIdFromEvent, formatTimestamp, generateUUID, parseJSON } from '../shared/utils';
import { logger } from '../shared/logger';
import { metrics } from '../shared/metrics';
import { tracer } from '../shared/tracer';

const TTL_DAYS = 30; // Notifications auto-delete after 30 days

/**
 * Main Lambda handler
 */
export const handler = async (event: APIGatewayEvent): Promise<APIResponse> => {
  try {
    logger.initFromEvent(event);
    logger.logFunctionStart('notifications-handler', { 
      path: event.path, 
      method: event.httpMethod 
    });

    const { httpMethod, path, pathParameters } = event;
    
    // Check authentication
    const userId = event.requestContext?.authorizer?.claims?.sub;
    if (!userId) {
      throw new AppError(401, 'unauthorized', 'User not authenticated');
    }

    tracer.setUser(userId);

    // Route requests
    if (httpMethod === 'GET' && path === '/notifications') {
      return await getNotifications(userId, event.queryStringParameters);
    }

    if (httpMethod === 'PUT' && path.match(/^\/notifications\/[^/]+\/read$/)) {
      const notificationId = pathParameters?.id;
      if (!notificationId) {
        throw new AppError(400, 'invalid_request', 'Notification ID is required');
      }
      return await markAsRead(userId, notificationId);
    }

    if (httpMethod === 'PUT' && path === '/notifications/read-all') {
      return await markAllAsRead(userId);
    }

    throw new AppError(404, 'not_found', 'Endpoint not found');

  } catch (error: any) {
    logger.error('Error in notifications handler', { error: error.message });
    return handleError(error);
  } finally {
    const duration = Date.now();
    logger.logFunctionEnd('notifications-handler', 200, duration);
    await metrics.flush();
  }
};

/**
 * Get user notifications with filtering and pagination
 */
async function getNotifications(
  userId: string, 
  queryParams: { [key: string]: string } | null
): Promise<APIResponse> {
  try {
    const unreadOnly = queryParams?.unread_only === 'true';
    const limit = parseInt(queryParams?.limit || '20');
    const offset = parseInt(queryParams?.offset || '0');

    if (limit < 1 || limit > 100) {
      throw new AppError(400, 'invalid_limit', 'Limit must be between 1 and 100');
    }

    logger.info('Getting notifications', { userId, unreadOnly, limit, offset });

    let notifications: Notification[] = [];
    let unreadCount = 0;

    if (unreadOnly) {
      // Query unread notifications using sparse GSI
      const result = await DynamoDBHelper.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}#UNREAD`,
        },
        ScanIndexForward: false, // Newest first
        Limit: limit + offset,
      });

      const items = result.Items || [];
      notifications = items.slice(offset, offset + limit).map(mapToNotification);
      unreadCount = result.Count || 0;

    } else {
      // Query all notifications
      const result = await DynamoDBHelper.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'NOTIFICATION#',
        },
        ScanIndexForward: false, // Newest first
        Limit: limit + offset,
      });

      const items = result.Items || [];
      notifications = items.slice(offset, offset + limit).map(mapToNotification);
      
      // Count unread
      unreadCount = items.filter(item => !item.is_read).length;
    }

    // Get total count for has_more
    const totalResult = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'NOTIFICATION#',
      },
    });

    const totalCount = totalResult.Count || 0;
    const hasMore = offset + limit < totalCount;

    const response: NotificationResponse = {
      notifications,
      unread_count: unreadCount,
      total_count: totalCount,
      has_more: hasMore,
    };

    metrics.trackApiRequest(200, Date.now(), 'notifications');
    logger.info('Notifications retrieved', { 
      count: notifications.length, 
      unreadCount, 
      totalCount 
    });

    return successResponse(response);

  } catch (error: any) {
    logger.error('Error getting notifications', { error: error.message });
    throw error;
  }
}

/**
 * Mark single notification as read
 */
async function markAsRead(userId: string, notificationId: string): Promise<APIResponse> {
  try {
    logger.info('Marking notification as read', { userId, notificationId });

    // Get notification to verify ownership
    const notification = await DynamoDBHelper.get(
      `USER#${userId}`,
      `NOTIFICATION#${notificationId}`
    );

    if (!notification) {
      throw new AppError(404, 'not_found', 'Notification not found');
    }

    if (notification.user_id !== userId) {
      throw new AppError(403, 'forbidden', 'You do not own this notification');
    }

    if (notification.is_read) {
      // Already read, just return success
      return successResponse({ message: 'Notification already marked as read' });
    }

    // Update notification: set is_read = true, remove from UNREAD GSI
    await DynamoDBHelper.update(
      `USER#${userId}`,
      `NOTIFICATION#${notificationId}`,
      'SET is_read = :true REMOVE GSI1PK, GSI1SK',
      {
        ':true': true,
      }
    );

    metrics.trackApiRequest(200, Date.now(), 'notifications');
    logger.info('Notification marked as read', { notificationId });

    return successResponse({ message: 'Notification marked as read' });

  } catch (error: any) {
    logger.error('Error marking notification as read', { error: error.message });
    throw error;
  }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead(userId: string): Promise<APIResponse> {
  try {
    logger.info('Marking all notifications as read', { userId });

    // Get all unread notifications
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}#UNREAD`,
      },
    });

    const unreadNotifications = result.Items || [];

    if (unreadNotifications.length === 0) {
      return successResponse({ 
        message: 'No unread notifications', 
        updated_count: 0 
      });
    }

    // Update each notification
    const updatePromises = unreadNotifications.map(notification =>
      DynamoDBHelper.update(
        `USER#${userId}`,
        notification.SK,
        'SET is_read = :true REMOVE GSI1PK, GSI1SK',
        {
          ':true': true,
        }
      )
    );

    await Promise.all(updatePromises);

    metrics.trackApiRequest(200, Date.now(), 'notifications');
    logger.info('All notifications marked as read', { 
      count: unreadNotifications.length 
    });

    return successResponse({ 
      message: 'All notifications marked as read',
      updated_count: unreadNotifications.length
    });

  } catch (error: any) {
    logger.error('Error marking all notifications as read', { error: error.message });
    throw error;
  }
}

/**
 * Helper: Map DynamoDB item to Notification
 */
function mapToNotification(item: any): Notification {
  return {
    notification_id: item.notification_id,
    user_id: item.user_id,
    type: item.type,
    actor_id: item.actor_id,
    actor_username: item.actor_username,
    actor_avatar_url: item.actor_avatar_url,
    target_type: item.target_type,
    target_id: item.target_id,
    content: item.content,
    is_read: item.is_read || false,
    created_at: item.created_at,
    ttl: item.ttl,
  };
}

/**
 * Helper: Create notification (called by other services)
 * This will be used by DynamoDB Streams trigger in Task 15.2
 */
export async function createNotification(
  userId: string,
  type: string,
  actorId: string,
  targetType: string,
  targetId: string,
  content: string
): Promise<void> {
  try {
    const now = formatTimestamp();
    const notificationId = generateUUID();
    const ttl = Math.floor(Date.now() / 1000) + (TTL_DAYS * 24 * 60 * 60);

    // Get actor info for display
    const actorProfile = await DynamoDBHelper.get(`USER#${actorId}`, 'PROFILE');
    
    const notification = {
      PK: `USER#${userId}`,
      SK: `NOTIFICATION#${notificationId}`,
      GSI1PK: `USER#${userId}#UNREAD`, // Sparse index for unread
      GSI1SK: `NOTIFICATION#${now}`,
      entity_type: 'NOTIFICATION',
      notification_id: notificationId,
      user_id: userId,
      type,
      actor_id: actorId,
      actor_username: actorProfile?.username,
      actor_avatar_url: actorProfile?.avatar_url,
      target_type: targetType,
      target_id: targetId,
      content,
      is_read: false,
      created_at: now,
      ttl,
    };

    await DynamoDBHelper.put(notification);

    logger.info('Notification created', { 
      notificationId, 
      userId, 
      type 
    });

  } catch (error: any) {
    logger.error('Error creating notification', { error: error.message });
    // Don't throw - notification failure shouldn't break main operations
  }
}
