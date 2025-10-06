/**
 * Posts Management Lambda Function
 * Handles creating, retrieving, updating, and deleting posts
 */

import { APIGatewayEvent, APIResponse } from '../shared/types';
import { successResponse, errorResponse, handleError, AppError } from '../shared/responses';
import { getUserIdFromEvent } from '../shared/utils';
import { PostsService } from './posts-service';
import { logger } from '../shared/logger';
import { metrics } from '../shared/metrics';
import { tracer } from '../shared/tracer';
import { CreatePostRequest, UpdatePostRequest, CreateCommentRequest, CreateReactionRequest } from './types';

export async function handler(event: APIGatewayEvent): Promise<APIResponse> {
  const startTime = Date.now();

  // Initialize logger with request context
  logger.initFromEvent(event);
  logger.logFunctionStart('posts', event);

  try {
    const userId = getUserIdFromEvent(event);
    const method = event.httpMethod;
    const path = event.path;

    // Set X-Ray user context
    tracer.setUser(userId);

    logger.info('Posts request received', {
      method,
      path,
      userId,
      pathParameters: event.pathParameters
    });

    // Route requests based on HTTP method and path
    if (method === 'POST' && path === '/posts') {
      return await createPost(userId, event.body);
    }

    if (method === 'GET' && path === '/posts/feed') {
      return await getFeed(userId, event.queryStringParameters);
    }

    if (method === 'GET' && path.match(/\/users\/.+\/posts$/)) {
      const targetUserId = event.pathParameters?.userId || '';
      return await getUserPosts(targetUserId, userId, event.queryStringParameters);
    }

    if (method === 'POST' && path === '/reactions') {
      return await createReaction(userId, event.body);
    }

    if (method === 'DELETE' && path.match(/\/reactions\/.+/)) {
      const reactionId = event.pathParameters?.id || '';
      return await deleteReaction(userId, reactionId);
    }

    if (method === 'POST' && path.match(/\/posts\/.+\/comments$/)) {
      const postId = event.pathParameters?.id || '';
      return await createComment(userId, postId, event.body);
    }

    if (method === 'GET' && path.match(/\/posts\/.+\/comments$/)) {
      const postId = event.pathParameters?.id || '';
      return await getComments(postId, userId, event.queryStringParameters);
    }

    if (method === 'GET' && path.match(/\/posts\/.+/)) {
      const postId = event.pathParameters?.id || '';
      return await getPost(postId, userId);
    }

    if (method === 'PUT' && path.match(/\/posts\/.+/)) {
      const postId = event.pathParameters?.id || '';
      return await updatePost(postId, userId, event.body);
    }

    if (method === 'DELETE' && path.match(/\/posts\/.+/)) {
      const postId = event.pathParameters?.id || '';
      return await deletePost(postId, userId);
    }

    return errorResponse(404, 'not_found', 'Endpoint not found');

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Posts handler error', error, { duration });
    metrics.trackApiRequest(500, duration, 'posts');
    logger.logFunctionEnd('posts', 500, duration);
    return handleError(error);
  } finally {
    // Flush metrics and log function end
    const duration = Date.now() - startTime;
    logger.logFunctionEnd('posts', 200, duration);
    await metrics.flush();
  }
}

/**
 * Create a new post
 */
async function createPost(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const request: CreatePostRequest = JSON.parse(body);

  const post = await PostsService.createPost(userId, request);

  // Get user info for response
  const userInfo = await PostsService.getUserInfo(userId, userId);

  // Get recipe info if available
  let recipeInfo = null;
  if (post.recipe_id) {
    recipeInfo = await PostsService.getRecipeInfo(post.recipe_id);
  }

  metrics.trackApiRequest(201, Date.now(), 'posts');

  return successResponse({
    message: 'Post created successfully',
    post,
    user: userInfo,
    recipe: recipeInfo
  }, 201);
}

/**
 * Get post by ID
 */
async function getPost(postId: string, viewerId: string): Promise<APIResponse> {
  if (!postId) {
    throw new AppError(400, 'missing_post_id', 'Post ID is required');
  }

  const post = await PostsService.getPost(postId, viewerId);

  // Get user info for response
  const userInfo = await PostsService.getUserInfo(post.user_id, viewerId);

  // Get recipe info if available
  let recipeInfo = null;
  if (post.recipe_id) {
    recipeInfo = await PostsService.getRecipeInfo(post.recipe_id);
  }

  metrics.trackApiRequest(200, Date.now(), 'posts');

  return successResponse({
    post,
    user: userInfo,
    recipe: recipeInfo
  });
}

/**
 * Update a post
 */
async function updatePost(postId: string, userId: string, body: string | null): Promise<APIResponse> {
  if (!postId) {
    throw new AppError(400, 'missing_post_id', 'Post ID is required');
  }

  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const request: UpdatePostRequest = JSON.parse(body);

  const post = await PostsService.updatePost(postId, userId, request);

  // Get user info for response
  const userInfo = await PostsService.getUserInfo(userId, userId);

  // Get recipe info if available
  let recipeInfo = null;
  if (post.recipe_id) {
    recipeInfo = await PostsService.getRecipeInfo(post.recipe_id);
  }

  metrics.trackApiRequest(200, Date.now(), 'posts');

  return successResponse({
    message: 'Post updated successfully',
    post,
    user: userInfo,
    recipe: recipeInfo
  });
}

/**
 * Delete a post
 */
async function deletePost(postId: string, userId: string): Promise<APIResponse> {
  if (!postId) {
    throw new AppError(400, 'missing_post_id', 'Post ID is required');
  }

  await PostsService.deletePost(postId, userId);

  metrics.trackApiRequest(200, Date.now(), 'posts');

  return successResponse({
    message: 'Post deleted successfully',
    post_id: postId
  });
}

/**
 * Get personalized feed
 */
async function getFeed(
  userId: string,
  queryParams: { [key: string]: string } | null
): Promise<APIResponse> {
  const limit = queryParams?.limit ? parseInt(queryParams.limit) : 20;
  const lastKey = queryParams?.last_key 
    ? JSON.parse(Buffer.from(queryParams.last_key, 'base64').toString())
    : undefined;

  const result = await PostsService.getFeed(userId, limit, lastKey);

  // Encode next key for pagination
  const nextKey = result.nextKey
    ? Buffer.from(JSON.stringify(result.nextKey)).toString('base64')
    : undefined;

  metrics.trackApiRequest(200, Date.now(), 'posts');

  return successResponse({
    posts: result.posts,
    next_key: nextKey,
    has_more: result.hasMore,
    count: result.posts.length,
  });
}

/**
 * Get posts by a specific user (with privacy filtering)
 */
async function getUserPosts(
  targetUserId: string,
  viewerId: string,
  queryParams: { [key: string]: string } | null
): Promise<APIResponse> {
  const limit = queryParams?.limit ? parseInt(queryParams.limit) : 20;
  const lastKey = queryParams?.last_key 
    ? JSON.parse(Buffer.from(queryParams.last_key, 'base64').toString())
    : undefined;

  const result = await PostsService.getUserPosts(targetUserId, viewerId, limit, lastKey);

  // Encode next key for pagination
  const nextKey = result.nextKey
    ? Buffer.from(JSON.stringify(result.nextKey)).toString('base64')
    : undefined;

  metrics.trackApiRequest(200, Date.now(), 'posts');

  return successResponse({
    posts: result.posts,
    next_key: nextKey,
    has_more: result.hasMore,
    count: result.posts.length,
  });
}

/**
 * Create a comment on a post
 */
async function createComment(
  userId: string,
  postId: string,
  body: string | null
): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const request: CreateCommentRequest = {
    ...JSON.parse(body),
    post_id: postId,
  };

  const comment = await PostsService.createComment(userId, request);

  metrics.trackApiRequest(201, Date.now(), 'posts');

  return successResponse({ comment }, 201);
}

/**
 * Get comments for a post
 */
async function getComments(
  postId: string,
  userId: string,
  queryParams: { [key: string]: string } | null
): Promise<APIResponse> {
  const limit = queryParams?.limit ? parseInt(queryParams.limit) : 50;
  const lastKey = queryParams?.last_key;

  const result = await PostsService.getComments(postId, userId, limit, lastKey);

  metrics.trackApiRequest(200, Date.now(), 'posts');

  return successResponse({
    comments: result.comments,
    next_key: result.next_key,
    has_more: result.has_more,
    count: result.comments.length,
  });
}

/**
 * Create a reaction on a post or comment
 */
async function createReaction(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const request: CreateReactionRequest = JSON.parse(body);

  try {
    const reaction = await PostsService.createReaction(userId, request);

    metrics.trackApiRequest(201, Date.now(), 'posts');

    return successResponse({ reaction }, 201);
  } catch (error: any) {
    // Handle toggle-off case (409 conflict means reaction was removed)
    if (error.statusCode === 409) {
      metrics.trackApiRequest(200, Date.now(), 'posts');
      return successResponse({ message: 'Reaction removed', removed: true }, 200);
    }
    throw error;
  }
}

/**
 * Delete a reaction
 */
async function deleteReaction(userId: string, reactionId: string): Promise<APIResponse> {
  await PostsService.deleteReaction(userId, reactionId);

  metrics.trackApiRequest(200, Date.now(), 'posts');

  return successResponse({ message: 'Reaction deleted successfully' });
}
