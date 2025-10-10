/**
 * Posts Service
 * Business logic for posts management
 */

import { DynamoDBHelper } from '../shared/dynamodb';
import { generateUUID, formatTimestamp } from '../shared/utils';
import { logger } from '../shared/logger';
import { AppError } from '../shared/responses';
import { Post, CreatePostRequest, UpdatePostRequest, PostResponse, Comment, CreateCommentRequest, CommentResponse, Reaction, CreateReactionRequest, ReactionType } from './types';
import { PrivacySettings } from '../shared/types';
import { getUserPrivacySettings, createPrivacyContext, checkFriendship } from '../shared/privacy-middleware';

export class PostsService {
  /**
   * Create a new post
   */
  static async createPost(userId: string, request: CreatePostRequest): Promise<Post> {
    // Validate request
    if (!request.content || request.content.trim().length === 0) {
      throw new AppError(400, 'missing_content', 'Post content is required');
    }

    if (request.content.length > 5000) {
      throw new AppError(400, 'content_too_long', 'Post content must be less than 5000 characters');
    }

    // Validate images array
    if (request.images && request.images.length > 10) {
      throw new AppError(400, 'too_many_images', 'Maximum 10 images per post');
    }

    // If recipe_id provided, verify it exists
    if (request.recipe_id) {
      const recipe = await DynamoDBHelper.get(`RECIPE#${request.recipe_id}`, 'METADATA');
      if (!recipe) {
        throw new AppError(404, 'recipe_not_found', 'Recipe not found');
      }
    }

    const postId = generateUUID();
    const now = formatTimestamp();
    
    // Handle both legacy is_public and new privacy field
    const privacy = request.privacy || (request.is_public !== false ? 'public' : 'private');
    const isPublic = privacy === 'public';

    // Determine GSI3PK based on post visibility
    const gsi3pk = isPublic ? 'FEED#PUBLIC' : `FEED#${userId}`;

    const post: Post = {
      post_id: postId,
      user_id: userId,
      recipe_id: request.recipe_id,
      content: request.content.trim(),
      images: request.images || [],
      is_public: isPublic,
      privacy,
      likes_count: 0,
      comments_count: 0,
      created_at: now,
      updated_at: now,
    };

    // Save to DynamoDB
    await DynamoDBHelper.put({
      PK: `POST#${postId}`,
      SK: 'METADATA',
      entity_type: 'POST',
      ...post,
      GSI1PK: `USER#${userId}`, // For querying user's posts
      GSI1SK: `POST#${now}`,
      GSI3PK: gsi3pk, // For feed queries
      GSI3SK: `POST#${now}`,
    });

    logger.info('Post created successfully', { postId, userId, isPublic });

    return post;
  }

  /**
   * Get post by ID with privacy filtering
   */
  static async getPost(postId: string, viewerId: string): Promise<Post> {
    const postItem = await DynamoDBHelper.get(`POST#${postId}`, 'METADATA');

    if (!postItem) {
      throw new AppError(404, 'post_not_found', 'Post not found');
    }

    // Check privacy settings
    const ownerId = postItem.user_id;
    const isPublic = postItem.is_public;

    // If post is public, anyone can view
    if (isPublic) {
      return this.convertDynamoItemToPost(postItem);
    }

    // If post is private, check access
    if (viewerId !== ownerId) {
      // Check if viewer is a friend
      const privacyContext = await createPrivacyContext(viewerId, ownerId);
      
      if (!privacyContext.isFriend) {
        throw new AppError(403, 'access_denied', 'You do not have permission to view this post');
      }
    }

    return this.convertDynamoItemToPost(postItem);
  }

  /**
   * Update a post (only owner can update)
   */
  static async updatePost(
    postId: string,
    userId: string,
    request: UpdatePostRequest
  ): Promise<Post> {
    // Get existing post
    const postItem = await DynamoDBHelper.get(`POST#${postId}`, 'METADATA');

    if (!postItem) {
      throw new AppError(404, 'post_not_found', 'Post not found');
    }

    // Verify ownership
    if (postItem.user_id !== userId) {
      throw new AppError(403, 'forbidden', 'You can only update your own posts');
    }

    // Validate updates
    if (request.content !== undefined) {
      if (request.content.trim().length === 0) {
        throw new AppError(400, 'missing_content', 'Post content cannot be empty');
      }
      if (request.content.length > 5000) {
        throw new AppError(400, 'content_too_long', 'Post content must be less than 5000 characters');
      }
    }

    if (request.images && request.images.length > 10) {
      throw new AppError(400, 'too_many_images', 'Maximum 10 images per post');
    }

    const now = formatTimestamp();
    const updates: any = {};
    const updateExpressions: string[] = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    // Always update timestamp
    updateExpressions.push('#updated_at = :updated_at');
    expressionAttributeNames['#updated_at'] = 'updated_at';
    expressionAttributeValues[':updated_at'] = now;

    if (request.content !== undefined) {
      updateExpressions.push('#content = :content');
      expressionAttributeNames['#content'] = 'content';
      expressionAttributeValues[':content'] = request.content.trim();
    }

    if (request.images !== undefined) {
      updateExpressions.push('#images = :images');
      expressionAttributeNames['#images'] = 'images';
      expressionAttributeValues[':images'] = request.images;
    }

    if (request.recipe_id !== undefined) {
      // Verify recipe exists if provided
      if (request.recipe_id) {
        const recipe = await DynamoDBHelper.get(`RECIPE#${request.recipe_id}`, 'METADATA');
        if (!recipe) {
          throw new AppError(404, 'recipe_not_found', 'Recipe not found');
        }
      }
      updateExpressions.push('#recipe_id = :recipe_id');
      expressionAttributeNames['#recipe_id'] = 'recipe_id';
      expressionAttributeValues[':recipe_id'] = request.recipe_id;
    }

    if (request.is_public !== undefined) {
      updateExpressions.push('#is_public = :is_public');
      expressionAttributeNames['#is_public'] = 'is_public';
      expressionAttributeValues[':is_public'] = request.is_public;
      
      // Update GSI3PK if visibility changed
      const newGsi3pk = request.is_public ? 'FEED#PUBLIC' : `FEED#${userId}`;
      if (newGsi3pk !== postItem.GSI3PK) {
        updateExpressions.push('#GSI3PK = :GSI3PK');
        expressionAttributeNames['#GSI3PK'] = 'GSI3PK';
        expressionAttributeValues[':GSI3PK'] = newGsi3pk;
      }
    }

    // Build update expression
    const updateExpression = `SET ${updateExpressions.join(', ')}`;

    // Update in DynamoDB
    const updatedItem = await DynamoDBHelper.update(
      `POST#${postId}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    logger.info('Post updated successfully', { postId, userId, updates: Object.keys(updates) });

    return this.convertDynamoItemToPost(updatedItem);
  }

  /**
   * Delete a post (only owner can delete)
   */
  static async deletePost(postId: string, userId: string): Promise<void> {
    // Get existing post
    const postItem = await DynamoDBHelper.get(`POST#${postId}`, 'METADATA');

    if (!postItem) {
      throw new AppError(404, 'post_not_found', 'Post not found');
    }

    // Verify ownership
    if (postItem.user_id !== userId) {
      throw new AppError(403, 'forbidden', 'You can only delete your own posts');
    }

    // Delete the post
    await DynamoDBHelper.delete(`POST#${postId}`, 'METADATA');

    // TODO: In future, also delete associated comments and reactions
    // This would be done in a separate cleanup process or using DynamoDB Streams

    logger.info('Post deleted successfully', { postId, userId });
  }

  /**
   * Get user profile information for post display
   */
  static async getUserInfo(userId: string, viewerId: string) {
    try {
      const profile = await DynamoDBHelper.get(`USER#${userId}`, 'PROFILE');
      
      if (!profile) {
        return {
          user_id: userId,
          username: 'Unknown User',
        };
      }

      // Apply privacy filtering
      const privacySettings = await getUserPrivacySettings(userId);
      const privacyContext = await createPrivacyContext(viewerId, userId);

      // Check profile visibility
      if (privacySettings.profile_visibility === 'private' && !privacyContext.isSelf) {
        return {
          user_id: userId,
          username: profile.username || 'Private User',
        };
      }

      if (privacySettings.profile_visibility === 'friends' && !privacyContext.isSelf && !privacyContext.isFriend) {
        return {
          user_id: userId,
          username: profile.username || 'Private User',
        };
      }

      return {
        user_id: userId,
        username: profile.username,
        full_name: profile.full_name,
        user_avatar: profile.avatar_url, // Map to user_avatar for frontend consistency
      };
    } catch (error) {
      logger.error('Failed to get user info', error, { userId });
      return {
        user_id: userId,
        username: 'Unknown User',
      };
    }
  }

  /**
   * Get recipe information for post display
   */
  static async getRecipeInfo(recipeId: string) {
    try {
      const recipe = await DynamoDBHelper.get(`RECIPE#${recipeId}`, 'METADATA');
      
      if (!recipe) {
        return null;
      }

      return {
        recipe_id: recipeId,
        title: recipe.title,
      };
    } catch (error) {
      logger.error('Failed to get recipe info', error, { recipeId });
      return null;
    }
  }

  /**
   * Convert DynamoDB item to Post object
   */
  private static convertDynamoItemToPost(item: any): Post {
    return {
      post_id: item.post_id,
      user_id: item.user_id,
      recipe_id: item.recipe_id,
      content: item.content,
      images: item.images || [],
      is_public: item.is_public,
      likes_count: item.likes_count || 0,
      comments_count: item.comments_count || 0,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  /**
   * Get personalized feed for user
   * Combines public posts and friends' posts with privacy filtering
   */
  static async getFeed(
    userId: string,
    limit: number = 20,
    lastKey?: any
  ): Promise<{ posts: PostResponse[]; nextKey?: any; hasMore: boolean }> {
    // Validate limit
    if (limit < 1 || limit > 100) {
      throw new AppError(400, 'invalid_limit', 'Limit must be between 1 and 100');
    }

    try {
      // Get user's friends list
      const friendships = await this.getUserFriends(userId);
      const friendIds = friendships.map(f => f.user_id);

      // Query public posts using GSI3
      const publicPostsResult = await DynamoDBHelper.query({
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'FEED#PUBLIC',
        },
        ScanIndexForward: false, // Sort by newest first
        Limit: limit * 2, // Get more to account for filtering
        ExclusiveStartKey: lastKey,
      });

      let allPosts = publicPostsResult.Items || [];

      // Always include user's own posts
      const ownPostsResult = await DynamoDBHelper.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
        },
        ScanIndexForward: false,
        Limit: 10, // Get user's recent posts
      });
      
      allPosts = [...allPosts, ...(ownPostsResult.Items || [])];

      // If user has friends, also query their posts
      if (friendIds.length > 0) {
        // Query each friend's posts (limited to avoid too many queries)
        const friendPostPromises = friendIds.slice(0, 10).map(friendId =>
          DynamoDBHelper.query({
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :pk',
            ExpressionAttributeValues: {
              ':pk': `USER#${friendId}`,
            },
            ScanIndexForward: false,
            Limit: 5, // Limit per friend to avoid overload
          })
        );

        const friendPostsResults = await Promise.all(friendPostPromises);
        const friendPosts = friendPostsResults.flatMap(result => result.Items || []);
        
        allPosts = [...allPosts, ...friendPosts];
      }

      // Remove duplicates based on post_id
      const uniquePosts = Array.from(
        new Map(allPosts.map(post => [post.post_id, post])).values()
      );

      // Sort by created_at descending (newest first)
      uniquePosts.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });

      // Apply privacy filtering
      const filteredPosts: PostResponse[] = [];
      
      for (const postItem of uniquePosts) {
        if (filteredPosts.length >= limit) break;

        try {
          // Check if user can view this post
          const canView = await this.canViewPost(userId, postItem);
          
          if (canView) {
            const post = this.convertDynamoItemToPost(postItem);
            
            // Get user and recipe info
            const userInfo = await this.getUserInfo(post.user_id, userId);
            const recipeInfo = post.recipe_id
              ? await this.getRecipeInfo(post.recipe_id)
              : null;

            filteredPosts.push({
              post,
              user: userInfo,
              recipe: recipeInfo || undefined,
            });
          }
        } catch (error) {
          // Skip posts that cause errors (e.g., deleted users)
          logger.error('Error processing post in feed', error, { postId: postItem.post_id });
          continue;
        }
      }

      // Determine if there are more posts
      const hasMore = uniquePosts.length > limit && publicPostsResult.LastEvaluatedKey !== undefined;
      const nextKey = hasMore ? publicPostsResult.LastEvaluatedKey : undefined;

      logger.info('Feed generated successfully', {
        userId,
        postsReturned: filteredPosts.length,
        hasMore,
        friendCount: friendIds.length,
      });

      return {
        posts: filteredPosts,
        nextKey,
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to generate feed', error, { userId });
      throw error;
    }
  }

  /**
   * Get posts by a specific user with privacy filtering
   * Task 17.1 - Display user's public posts on their profile
   */
  static async getUserPosts(
    targetUserId: string,
    viewerId: string,
    limit: number = 20,
    lastKey?: any
  ): Promise<{ posts: PostResponse[]; nextKey?: any; hasMore: boolean }> {
    // Validate limit
    if (limit < 1 || limit > 100) {
      throw new AppError(400, 'invalid_limit', 'Limit must be between 1 and 100');
    }

    try {
      // Check if viewer can see target user's posts
      const isSelf = viewerId === targetUserId;
      const isFriend = !isSelf && await checkFriendship(viewerId, targetUserId);

      // Query user's posts using GSI1
      const result = await DynamoDBHelper.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${targetUserId}`,
          ':sk': 'POST#',
        },
        ScanIndexForward: false, // Sort by newest first
        Limit: limit * 2, // Get more to account for privacy filtering
        ExclusiveStartKey: lastKey,
      });

      const posts = result.Items || [];
      const filteredPosts: PostResponse[] = [];

      for (const postItem of posts) {
        if (filteredPosts.length >= limit) break;

        try {
          // Apply privacy filtering
          const isPublic = postItem.is_public;

          // If viewing own posts, show all
          if (isSelf) {
            const post = this.convertDynamoItemToPost(postItem);
            const userInfo = await this.getUserInfo(post.user_id, viewerId);
            const recipeInfo = post.recipe_id
              ? await this.getRecipeInfo(post.recipe_id)
              : null;

            filteredPosts.push({
              post,
              user: userInfo,
              recipe: recipeInfo || undefined,
            });
            continue;
          }

          // If public post, anyone can view
          if (isPublic) {
            const post = this.convertDynamoItemToPost(postItem);
            const userInfo = await this.getUserInfo(post.user_id, viewerId);
            const recipeInfo = post.recipe_id
              ? await this.getRecipeInfo(post.recipe_id)
              : null;

            filteredPosts.push({
              post,
              user: userInfo,
              recipe: recipeInfo || undefined,
            });
            continue;
          }

          // If private post, only friends can view
          if (!isPublic && isFriend) {
            const post = this.convertDynamoItemToPost(postItem);
            const userInfo = await this.getUserInfo(post.user_id, viewerId);
            const recipeInfo = post.recipe_id
              ? await this.getRecipeInfo(post.recipe_id)
              : null;

            filteredPosts.push({
              post,
              user: userInfo,
              recipe: recipeInfo || undefined,
            });
          }
        } catch (error) {
          logger.error('Error processing user post', error, { postId: postItem.post_id });
          continue;
        }
      }

      const hasMore = posts.length > limit && result.LastEvaluatedKey !== undefined;
      const nextKey = hasMore ? result.LastEvaluatedKey : undefined;

      logger.info('User posts retrieved successfully', {
        targetUserId,
        viewerId,
        postsReturned: filteredPosts.length,
        hasMore,
      });

      return {
        posts: filteredPosts,
        nextKey,
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to get user posts', error, { targetUserId, viewerId });
      throw error;
    }
  }

  /**
   * Get user's friends list
   */
  private static async getUserFriends(userId: string): Promise<Array<{ user_id: string }>> {
    try {
      const result = await DynamoDBHelper.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'FRIEND#',
          ':status': 'accepted',
        },
      });

      return (result.Items || []).map(item => ({
        user_id: item.addressee_id,
      }));
    } catch (error) {
      logger.error('Failed to get user friends', error, { userId });
      return [];
    }
  }

  /**
   * Check if user can view a post based on privacy settings
   */
  private static async canViewPost(viewerId: string, postItem: any): Promise<boolean> {
    const postOwnerId = postItem.user_id;
    const isPublic = postItem.is_public;

    // Owner can always view their own posts
    if (viewerId === postOwnerId) {
      return true;
    }

    // Public posts are viewable by everyone
    if (isPublic) {
      return true;
    }

    // For private posts, check if viewer is a friend
    const isFriend = await checkFriendship(viewerId, postOwnerId);
    return isFriend;
  }

  /**
   * Create a comment on a post
   */
  static async createComment(userId: string, request: CreateCommentRequest): Promise<Comment> {
    // Validate request
    if (!request.content || request.content.trim().length === 0) {
      throw new AppError(400, 'missing_content', 'Comment content is required');
    }

    if (request.content.length > 2000) {
      throw new AppError(400, 'content_too_long', 'Comment must be less than 2000 characters');
    }

    // Verify post exists and user can view it
    const postItem = await DynamoDBHelper.get(`POST#${request.post_id}`, 'METADATA');
    if (!postItem) {
      throw new AppError(404, 'post_not_found', 'Post not found');
    }

    // Check if user can view/comment on the post
    const canView = await this.canViewPost(userId, postItem);
    if (!canView) {
      throw new AppError(403, 'forbidden', 'You do not have permission to comment on this post');
    }

    // If parent comment provided, verify it exists
    if (request.parent_comment_id) {
      const parentComment = await DynamoDBHelper.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'comment_id = :commentId',
        ExpressionAttributeValues: {
          ':pk': `POST#${request.post_id}`,
          ':sk': `COMMENT#`,
          ':commentId': request.parent_comment_id,
        },
      });

      if (!parentComment.Items || parentComment.Items.length === 0) {
        throw new AppError(404, 'parent_comment_not_found', 'Parent comment not found');
      }
    }

    const commentId = generateUUID();
    const now = formatTimestamp();

    const comment: Comment = {
      comment_id: commentId,
      post_id: request.post_id,
      user_id: userId,
      parent_comment_id: request.parent_comment_id,
      content: request.content.trim(),
      created_at: now,
      updated_at: now,
    };

    // Store comment with SK pattern: COMMENT#<timestamp>#<id>
    await DynamoDBHelper.put({
      PK: `POST#${request.post_id}`,
      SK: `COMMENT#${now}#${commentId}`,
      entity_type: 'COMMENT',
      ...comment,
      GSI1PK: `USER#${userId}`, // For querying user's comments
      GSI1SK: `COMMENT#${now}`,
    });

    // Increment post comments_count
    await DynamoDBHelper.update(
      `POST#${request.post_id}`,
      'METADATA',
      'SET comments_count = if_not_exists(comments_count, :zero) + :inc, updated_at = :now',
      {
        ':inc': 1,
        ':zero': 0,
        ':now': now,
      }
    );

    logger.info('Comment created successfully', { commentId, postId: request.post_id, userId });

    return comment;
  }

  /**
   * Get all comments for a post
   */
  static async getComments(
    postId: string,
    viewerId: string,
    limit: number = 50,
    lastKey?: string
  ): Promise<{ comments: CommentResponse[]; next_key?: string; has_more: boolean }> {
    // Verify post exists and user can view it
    const postItem = await DynamoDBHelper.get(`POST#${postId}`, 'METADATA');
    if (!postItem) {
      throw new AppError(404, 'post_not_found', 'Post not found');
    }

    const canView = await this.canViewPost(viewerId, postItem);
    if (!canView) {
      throw new AppError(403, 'forbidden', 'You do not have permission to view this post');
    }

    // Validate limit
    if (limit < 1 || limit > 100) {
      throw new AppError(400, 'invalid_limit', 'Limit must be between 1 and 100');
    }

    // Decode lastKey if provided
    let exclusiveStartKey: any = undefined;
    if (lastKey) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(lastKey, 'base64').toString('utf-8'));
      } catch (error) {
        throw new AppError(400, 'invalid_pagination_token', 'Invalid pagination token');
      }
    }

    // Query comments for the post
    const result = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `POST#${postId}`,
        ':sk': 'COMMENT#',
      },
      ScanIndexForward: true, // Oldest comments first
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    });

    const commentItems = result.Items || [];

    // Build comment tree (top-level comments with nested replies)
    const commentsMap = new Map<string, CommentResponse>();
    const topLevelComments: CommentResponse[] = [];

    // First pass: Create all comment responses
    for (const item of commentItems) {
      const userInfo = await this.getUserInfo(item.user_id, viewerId);
      
      const commentResponse: CommentResponse = {
        comment: {
          comment_id: item.comment_id,
          post_id: item.post_id,
          user_id: item.user_id,
          parent_comment_id: item.parent_comment_id,
          content: item.content,
          created_at: item.created_at,
          updated_at: item.updated_at,
        },
        user: userInfo,
        replies: [],
      };

      commentsMap.set(item.comment_id, commentResponse);
    }

    // Second pass: Build tree structure
    for (const commentResponse of commentsMap.values()) {
      if (commentResponse.comment.parent_comment_id) {
        // This is a reply, add to parent's replies
        const parent = commentsMap.get(commentResponse.comment.parent_comment_id);
        if (parent) {
          parent.replies = parent.replies || [];
          parent.replies.push(commentResponse);
        }
      } else {
        // This is a top-level comment
        topLevelComments.push(commentResponse);
      }
    }

    // Encode next pagination key
    let nextKey: string | undefined;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    return {
      comments: topLevelComments,
      next_key: nextKey,
      has_more: !!result.LastEvaluatedKey,
    };
  }

  /**
   * Create a reaction on a post or comment
   */
  static async createReaction(userId: string, request: CreateReactionRequest): Promise<Reaction> {
    // Validate reaction type
    const validReactionTypes: ReactionType[] = ['like', 'love', 'wow'];
    if (!validReactionTypes.includes(request.reaction_type)) {
      throw new AppError(400, 'invalid_reaction_type', 'Reaction type must be like, love, or wow');
    }

    // Validate target type
    if (!['post', 'comment'].includes(request.target_type)) {
      throw new AppError(400, 'invalid_target_type', 'Target type must be post or comment');
    }

    // Verify target exists
    let targetItem: any;
    let targetPK: string;
    let targetSK: string;

    if (request.target_type === 'post') {
      targetPK = `POST#${request.target_id}`;
      targetSK = 'METADATA';
      targetItem = await DynamoDBHelper.get(targetPK, targetSK);
      
      if (!targetItem) {
        throw new AppError(404, 'post_not_found', 'Post not found');
      }

      // Check if user can view the post
      const canView = await this.canViewPost(userId, targetItem);
      if (!canView) {
        throw new AppError(403, 'forbidden', 'You do not have permission to react to this post');
      }
    } else {
      // For comments, we need to find the comment in the post
      // Comments are stored with SK: COMMENT#<timestamp>#<comment_id>
      const parts = request.target_id.split('#');
      const postId = parts[0]; // Assuming target_id format: postId#commentId
      const commentId = parts[1] || request.target_id;

      // Query comments to find the specific one
      const commentsResult = await DynamoDBHelper.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'comment_id = :commentId',
        ExpressionAttributeValues: {
          ':pk': `POST#${postId}`,
          ':sk': 'COMMENT#',
          ':commentId': commentId,
        },
      });

      if (!commentsResult.Items || commentsResult.Items.length === 0) {
        throw new AppError(404, 'comment_not_found', 'Comment not found');
      }

      targetItem = commentsResult.Items[0];
      targetPK = `POST#${targetItem.post_id}`;
      targetSK = targetItem.SK;

      // Check if user can view the post (comments inherit post's privacy)
      const postItem = await DynamoDBHelper.get(`POST#${targetItem.post_id}`, 'METADATA');
      if (postItem) {
        const canView = await this.canViewPost(userId, postItem);
        if (!canView) {
          throw new AppError(403, 'forbidden', 'You do not have permission to react to this comment');
        }
      }
    }

    // Check if user already reacted to this target
    const existingReaction = await DynamoDBHelper.get(
      targetPK,
      `REACTION#${userId}`
    );

    if (existingReaction) {
      // If same reaction type, treat as toggle (remove it)
      if (existingReaction.reaction_type === request.reaction_type) {
        await this.deleteReactionInternal(userId, targetPK, targetSK, request.target_type);
        throw new AppError(409, 'reaction_removed', 'Reaction removed (toggled off)');
      } else {
        // Update existing reaction to new type
        await DynamoDBHelper.update(
          targetPK,
          `REACTION#${userId}`,
          'SET reaction_type = :type, updated_at = :now',
          {
            ':type': request.reaction_type,
            ':now': formatTimestamp(),
          }
        );

        return {
          reaction_id: existingReaction.reaction_id,
          target_type: request.target_type,
          target_id: request.target_id,
          user_id: userId,
          reaction_type: request.reaction_type,
          created_at: existingReaction.created_at,
        };
      }
    }

    const reactionId = generateUUID();
    const now = formatTimestamp();

    const reaction: Reaction = {
      reaction_id: reactionId,
      target_type: request.target_type,
      target_id: request.target_id,
      user_id: userId,
      reaction_type: request.reaction_type,
      created_at: now,
    };

    // Store reaction with SK pattern: REACTION#<user_id>
    await DynamoDBHelper.put({
      PK: targetPK,
      SK: `REACTION#${userId}`,
      entity_type: 'REACTION',
      ...reaction,
      GSI1PK: `USER#${userId}`, // For querying user's reactions
      GSI1SK: `REACTION#${now}`,
    });

    // Increment likes_count on target
    await DynamoDBHelper.update(
      targetPK,
      targetSK,
      'SET likes_count = if_not_exists(likes_count, :zero) + :inc, updated_at = :now',
      {
        ':inc': 1,
        ':zero': 0,
        ':now': now,
      }
    );

    logger.info('Reaction created successfully', { reactionId, targetType: request.target_type, targetId: request.target_id, userId });

    return reaction;
  }

  /**
   * Delete a reaction
   */
  static async deleteReaction(userId: string, reactionId: string): Promise<void> {
    // Find the reaction by querying user's reactions
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      FilterExpression: 'reaction_id = :reactionId',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'REACTION#',
        ':reactionId': reactionId,
      },
    });

    if (!result.Items || result.Items.length === 0) {
      throw new AppError(404, 'reaction_not_found', 'Reaction not found or you do not own this reaction');
    }

    const reaction = result.Items[0];
    const targetPK = reaction.PK;
    const reactionSK = reaction.SK;

    // Determine target SK based on target type
    let targetSK: string;
    if (reaction.target_type === 'post') {
      targetSK = 'METADATA';
    } else {
      // For comments, find the comment's SK
      const commentsResult = await DynamoDBHelper.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'comment_id = :commentId',
        ExpressionAttributeValues: {
          ':pk': targetPK,
          ':sk': 'COMMENT#',
          ':commentId': reaction.target_id,
        },
      });

      if (!commentsResult.Items || commentsResult.Items.length === 0) {
        throw new AppError(404, 'comment_not_found', 'Comment not found');
      }

      targetSK = commentsResult.Items[0].SK;
    }

    await this.deleteReactionInternal(userId, targetPK, targetSK, reaction.target_type);

    logger.info('Reaction deleted successfully', { reactionId, userId });
  }

  /**
   * Internal method to delete a reaction and decrement count
   */
  private static async deleteReactionInternal(
    userId: string,
    targetPK: string,
    targetSK: string,
    targetType: string
  ): Promise<void> {
    const now = formatTimestamp();

    // Delete reaction
    await DynamoDBHelper.delete(targetPK, `REACTION#${userId}`);

    // Decrement likes_count on target
    await DynamoDBHelper.update(
      targetPK,
      targetSK,
      'SET likes_count = if_not_exists(likes_count, :zero) - :dec, updated_at = :now',
      {
        ':dec': 1,
        ':zero': 0,
        ':now': now,
      }
    );
  }
}

