/**
 * Posts Service
 * API integration for social feed and posts
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface Post {
  post_id: string;
  user_id: string;
  username: string;
  user_avatar?: string;
  content: string;
  image_url?: string;
  recipe_id?: string;
  recipe_title?: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  user_reaction?: 'like' | 'love' | 'wow';
  privacy?: 'public' | 'friends' | 'private';
}

export interface CreatePostRequest {
  content: string;
  image_url?: string;
  recipe_id?: string;
  privacy?: 'public' | 'friends' | 'private';
}

export interface PostsResponse {
  posts: Post[];
  next_key?: string;
  nextToken?: string; // Keep for backward compatibility
}

/**
 * Get feed posts (friends' posts)
 */
export async function getFeed(
  token: string,
  limit: number = 20,
  nextToken?: string
): Promise<PostsResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    ...(nextToken && { nextToken }),
  });

  // Use Next.js API route as proxy to bypass CORS
  const response = await fetch(`/api/posts?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to load feed');
  }

  return response.json();
}

/**
 * Get user's own posts
 */
export async function getUserPosts(
  token: string,
  userId?: string,
  limit: number = 20,
  nextToken?: string
): Promise<PostsResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    ...(nextToken && { nextToken }),
  });

  const endpoint = userId
    ? `${API_URL}/users/${userId}/posts?${params}`
    : `${API_URL}/posts/me?${params}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to load posts');
  }

  return response.json();
}

/**
 * Create a new post
 * Using Next.js API route as proxy to bypass CORS
 */
export async function createPost(
  token: string,
  data: CreatePostRequest
): Promise<{ post: Post; message: string }> {
  // Use Next.js API route as proxy to bypass CORS
  const response = await fetch('/api/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create post');
  }

  return response.json();
}

/**
 * Delete a post
 */
export async function deletePost(
  token: string,
  postId: string
): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/posts/${postId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete post');
  }

  return response.json();
}

/**
 * Add reaction to a post
 * Using Next.js API route as proxy to bypass CORS
 */
export async function addReaction(
  token: string,
  postId: string,
  reactionType: 'like' | 'love' | 'wow'
): Promise<{ message: string }> {
  const response = await fetch(`/api/posts/${postId}/reactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reaction_type: reactionType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to add reaction');
  }

  return response.json();
}

/**
 * Remove reaction from a post
 */
export async function removeReaction(
  token: string,
  postId: string
): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/posts/${postId}/reactions`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to remove reaction');
  }

  return response.json();
}

/**
 * Upload post image to S3
 */
export async function uploadPostImage(
  token: string,
  file: File
): Promise<{ image_url: string }> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_URL}/posts/upload-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload image');
  }

  return response.json();
}
