/**
 * Friendship Management Lambda Function
 * Handles friend requests, accept/reject, remove friendship, and list friends
 */

import { APIGatewayEvent, APIResponse } from '../shared/types';
import { successResponse, errorResponse, handleError, AppError } from '../shared/responses';
import { getUserIdFromEvent } from '../shared/utils';
import { FriendshipService } from './friendship-service';
import { logger } from '../shared/logger';
import { metrics } from '../shared/metrics';
import { tracer } from '../shared/tracer';
import {
  FriendRequest,
  AcceptFriendRequest,
  RejectFriendRequest,
  RemoveFriendRequest,
  GetFriendsRequest
} from './types';

export async function handler(event: APIGatewayEvent): Promise<APIResponse> {
  const startTime = Date.now();

  // Initialize logger with request context
  logger.initFromEvent(event);
  logger.logFunctionStart('friends', event);

  try {
    const userId = getUserIdFromEvent(event);
    const method = event.httpMethod;
    const path = event.path;

    // Set X-Ray user context
    tracer.setUser(userId);

    logger.info('Friends request received', {
      method,
      path,
      userId,
      pathParameters: event.pathParameters
    });

    // Route requests based on HTTP method and path
    if (method === 'POST' && path.includes('/friends/request')) {
      return await sendFriendRequest(userId, event.body);
    }

    if (method === 'PUT' && path.match(/\/friends\/.*\/accept/)) {
      return await acceptFriendRequest(userId, event.body);
    }

    if (method === 'PUT' && path.match(/\/friends\/.*\/reject/)) {
      return await rejectFriendRequest(userId, event.body);
    }

    if (method === 'DELETE' && path.match(/\/friends\/.+/)) {
      return await removeFriendship(userId, event.pathParameters?.id || '');
    }

    if (method === 'GET' && path === '/friends') {
      return await getFriends(userId, event.queryStringParameters);
    }

    if (method === 'GET' && path === '/friends/reverse') {
      return await getReverseFriendships(userId, event.queryStringParameters);
    }

    return errorResponse(404, 'not_found', 'Endpoint not found');

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Friends handler error', error, { duration });
    metrics.trackApiRequest(500, duration, 'friends');
    logger.logFunctionEnd('friends', 500, duration);
    return handleError(error);
  } finally {
    // Flush metrics and log function end
    const duration = Date.now() - startTime;
    logger.logFunctionEnd('friends', 200, duration);
    await metrics.flush();
  }
}

/**
 * Send a friend request
 */
async function sendFriendRequest(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const request: FriendRequest = JSON.parse(body);

  if (!request.addressee_id) {
    throw new AppError(400, 'missing_addressee_id', 'Addressee ID is required');
  }

  const friendship = await FriendshipService.sendFriendRequest(userId, request);
  return successResponse({
    message: 'Friend request sent successfully',
    friendship
  }, 201);
}

/**
 * Accept a friend request
 */
async function acceptFriendRequest(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const request: AcceptFriendRequest = JSON.parse(body);

  if (!request.friendship_id) {
    throw new AppError(400, 'missing_friendship_id', 'Friendship ID is required');
  }

  const friendship = await FriendshipService.acceptFriendRequest(userId, request.friendship_id);
  return successResponse({
    message: 'Friend request accepted',
    friendship
  });
}

/**
 * Reject a friend request
 */
async function rejectFriendRequest(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const request: RejectFriendRequest = JSON.parse(body);

  if (!request.friendship_id) {
    throw new AppError(400, 'missing_friendship_id', 'Friendship ID is required');
  }

  await FriendshipService.rejectFriendRequest(userId, request.friendship_id);
  return successResponse({
    message: 'Friend request rejected'
  });
}

/**
 * Remove a friendship (unfriend)
 */
async function removeFriendship(userId: string, friendshipId: string): Promise<APIResponse> {
  if (!friendshipId) {
    throw new AppError(400, 'missing_friendship_id', 'Friendship ID is required');
  }

  await FriendshipService.removeFriendship(userId, friendshipId);
  return successResponse({
    message: 'Friendship removed successfully'
  });
}

/**
 * Get user's friends list
 */
async function getFriends(userId: string, queryParams: any): Promise<APIResponse> {
  const request: GetFriendsRequest = {
    status_filter: queryParams?.status_filter as any,
    limit: queryParams?.limit ? parseInt(queryParams.limit) : undefined,
    start_key: queryParams?.start_key
  };

  const result = await FriendshipService.getFriends(userId, request);
  return successResponse({
    friends: result.friends,
    total_count: result.friends.length,
    last_evaluated_key: result.last_evaluated_key
  });
}

/**
 * Get reverse friendships (who friended me)
 * Uses GSI4 for efficient reverse lookup
 */
async function getReverseFriendships(userId: string, queryParams: any): Promise<APIResponse> {
  const status = queryParams?.status as any;
  const friends = await FriendshipService.getReverseFriendships(userId, status);
  return successResponse({
    friends,
    total_count: friends.length
  });
}
