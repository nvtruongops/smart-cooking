/**
 * Posts Management Types
 */

export interface Post {
  post_id: string;
  user_id: string;
  recipe_id?: string;
  content: string;
  images?: string[];
  is_public: boolean; // Legacy field
  privacy?: 'public' | 'friends' | 'private'; // New field
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePostRequest {
  content: string;
  images?: string[];
  recipe_id?: string;
  is_public?: boolean; // Legacy field
  privacy?: 'public' | 'friends' | 'private'; // New field
}

export interface UpdatePostRequest {
  content?: string;
  images?: string[];
  recipe_id?: string;
  is_public?: boolean;
}

export interface PostResponse {
  post: Post;
  user?: {
    user_id: string;
    username: string;
    full_name?: string;
    avatar_url?: string;
  };
  recipe?: {
    recipe_id: string;
    title: string;
  };
}

export interface GetPostRequest {
  post_id: string;
}

export interface DeletePostRequest {
  post_id: string;
}

export interface GetFeedRequest {
  limit?: number;
  last_key?: string; // Encoded pagination token
}

export interface FeedResponse {
  posts: PostResponse[];
  next_key?: string; // Pagination token for next page
  has_more: boolean;
}

// Comment types
export interface Comment {
  comment_id: string;
  post_id: string;
  user_id: string;
  parent_comment_id?: string; // For nested comments
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCommentRequest {
  post_id: string;
  content: string;
  parent_comment_id?: string;
}

export interface CommentResponse {
  comment: Comment;
  user: {
    user_id: string;
    username: string;
    full_name?: string;
    user_avatar?: string; // Changed from avatar_url for frontend consistency
  };
  replies?: CommentResponse[]; // Nested replies
}

export interface GetCommentsRequest {
  post_id: string;
  limit?: number;
  last_key?: string;
}

export interface CommentsResponse {
  comments: CommentResponse[];
  next_key?: string;
  has_more: boolean;
}

// Reaction types
export type ReactionType = 'like' | 'love' | 'wow';

export interface Reaction {
  reaction_id: string;
  target_type: 'post' | 'comment';
  target_id: string; // post_id or comment_id
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

export interface CreateReactionRequest {
  target_type: 'post' | 'comment';
  target_id: string;
  reaction_type: ReactionType;
}

export interface DeleteReactionRequest {
  reaction_id: string;
}

export interface ReactionResponse {
  reaction: Reaction;
}
