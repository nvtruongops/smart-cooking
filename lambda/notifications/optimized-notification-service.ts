/**
 * Optimized Notification Query Service  
 * Task 18.2: Optimize social queries and performance
 * 
 * Implements efficient notification queries using:
 * - Sparse index for UNREAD notifications
 * - Pagination with cursor-based tokens
 * - Cost optimization through targeted queries
 */

import { DynamoDBHelper } from '../shared/dynamodb';

interface Notification {
  notification_id: string;
  user_id: string;
  type: string;
  actor_id: string;
  target_type?: string;
  target_id?: string;
  is_read: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

interface NotificationQueryOptions {
  userId: string;
  filter?: 'UNREAD' | 'ALL';
  limit?: number;
  nextToken?: string;
}

interface NotificationQueryResult {
  items: Notification[];
  nextToken?: string;
  metadata: {
    totalCount: number;
    unreadCount: number;
    usesSparseIndex: boolean;
    executionTimeMs: number;
  };
}

export class OptimizedNotificationService {
  /**
   * Get notifications with optimal query strategy
   * 
   * Strategy:
   * - UNREAD filter: Use sparse index GSI4 (user_id#is_read) for efficiency
   * - ALL: Use standard query on user_id with pagination
   * 
   * Sparse Index Benefits:
   * - Only indexes unread notifications (is_read = false)
   * - Reduces index size by 80-90% (assuming most notifications are read)
   * - Lower storage costs and faster queries
   */
  async getNotifications(options: NotificationQueryOptions): Promise<NotificationQueryResult> {
    const startTime = Date.now();
    const { userId, filter = 'ALL', limit = 20, nextToken } = options;

    let result;
    let usesSparseIndex = false;

    if (filter === 'UNREAD') {
      // Use sparse index for unread notifications (optimized)
      result = await this.queryUnreadNotifications(userId, limit, nextToken);
      usesSparseIndex = true;
    } else {
      // Use standard query for all notifications
      result = await this.queryAllNotifications(userId, limit, nextToken);
    }

    // Get unread count (for badge display)
    const unreadCount = filter === 'UNREAD' 
      ? result.items.length 
      : await this.getUnreadCount(userId);

    const executionTimeMs = Date.now() - startTime;

    return {
      items: result.items,
      nextToken: result.nextToken,
      metadata: {
        totalCount: result.items.length,
        unreadCount,
        usesSparseIndex,
        executionTimeMs
      }
    };
  }

  /**
   * Query unread notifications using sparse index GSI4
   * 
   * GSI4 Structure:
   * - PK: user_id
   * - SK: is_read#created_at (only for is_read = false)
   * - Sparse: Only unread notifications are indexed
   */
  private async queryUnreadNotifications(
    userId: string,
    limit: number,
    nextToken?: string
  ): Promise<{ items: Notification[]; nextToken?: string }> {
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI4', // Sparse index for unread notifications
      KeyConditionExpression: 'user_id = :userId AND begins_with(is_read_created_at, :unread)',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':unread': 'false#' // Only query unread
      },
      Limit: limit,
      ScanIndexForward: false, // Newest first
      ExclusiveStartKey: nextToken ? this.decodeToken(nextToken) : undefined
    });

    return {
      items: (result.Items || []) as Notification[],
      nextToken: result.LastEvaluatedKey ? this.encodeToken(result.LastEvaluatedKey) : undefined
    };
  }

  /**
   * Query all notifications using standard query
   */
  private async queryAllNotifications(
    userId: string,
    limit: number,
    nextToken?: string
  ): Promise<{ items: Notification[]; nextToken?: string }> {
    const result = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :notification)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':notification': 'NOTIFICATION#'
      },
      Limit: limit,
      ScanIndexForward: false,
      ExclusiveStartKey: nextToken ? this.decodeToken(nextToken) : undefined
    });

    return {
      items: (result.Items || []) as Notification[],
      nextToken: result.LastEvaluatedKey ? this.encodeToken(result.LastEvaluatedKey) : undefined
    };
  }

  /**
   * Get count of unread notifications (cached query)
   * Uses sparse index for efficient counting
   */
  private async getUnreadCount(userId: string): Promise<number> {
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI4',
      KeyConditionExpression: 'user_id = :userId AND begins_with(is_read_created_at, :unread)',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':unread': 'false#'
      }
      // Note: DynamoDB will return all items, we count them manually
    });

    return result.Count || 0;
  }

  /**
   * Mark notification as read
   * Also maintains sparse index by removing from GSI4
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    // Update the notification
    await DynamoDBHelper.update(
      `USER#${userId}`,
      `NOTIFICATION#${notificationId}`,
      'SET is_read = :true, is_read_created_at = :null, read_at = :now',
      {
        ':true': true,
        ':null': null, // Remove from sparse index
        ':now': new Date().toISOString()
      }
    );
  }

  /**
   * Mark all notifications as read (batch operation)
   * Cost-optimized to use sparse index
   */
  async markAllAsRead(userId: string): Promise<number> {
    // Query only unread notifications using sparse index
    const unreadResult = await DynamoDBHelper.query({
      IndexName: 'GSI4',
      KeyConditionExpression: 'user_id = :userId AND begins_with(is_read_created_at, :unread)',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':unread': 'false#'
      }
    });

    const unreadNotifications = unreadResult.Items || [];

    // Batch update all unread notifications
    const updatePromises = unreadNotifications.map((notif: any) =>
      this.markAsRead(userId, notif.notification_id)
    );

    await Promise.all(updatePromises);

    return unreadNotifications.length;
  }

  /**
   * Delete old read notifications (cleanup job)
   * Helps reduce table size and costs
   */
  async deleteOldReadNotifications(userId: string, olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    const cutoffIso = cutoffDate.toISOString();

    // Query all notifications (read and unread)
    const result = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :notification)',
      FilterExpression: 'is_read = :true AND created_at < :cutoff',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':notification': 'NOTIFICATION#',
        ':true': true,
        ':cutoff': cutoffIso
      }
    });

    const oldNotifications = result.Items || [];

    // Batch delete old notifications
    const deletePromises = oldNotifications.map((notif: any) =>
      DynamoDBHelper.delete(`USER#${userId}`, notif.SK)
    );

    await Promise.all(deletePromises);

    return oldNotifications.length;
  }

  /**
   * Encode pagination token
   */
  private encodeToken(key: Record<string, any>): string {
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }

  /**
   * Decode pagination token
   */
  private decodeToken(token: string): Record<string, any> {
    try {
      return JSON.parse(Buffer.from(token, 'base64').toString());
    } catch {
      return {};
    }
  }
}

/**
 * Singleton instance for Lambda execution context reuse
 */
let notificationServiceInstance: OptimizedNotificationService | null = null;

export function getOptimizedNotificationService(): OptimizedNotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new OptimizedNotificationService();
  }
  return notificationServiceInstance;
}
