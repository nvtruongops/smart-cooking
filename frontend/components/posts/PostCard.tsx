/**
 * Post Card Component
 * Displays a single post in the feed
 */

'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Post } from '@/services/posts';
import ReactionButtons from './ReactionButtons';
import CommentList from '../comments/CommentList';

interface PostCardProps {
  post: Post;
  currentUserId?: string;
  onDelete?: (postId: string) => void;
  onReactionChange?: () => void;
  showComments?: boolean;
}

export default function PostCard({
  post,
  currentUserId,
  onDelete,
  onReactionChange,
  showComments = true,
}: PostCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  const isOwnPost = currentUserId === post.user_id;

  const handleDelete = async () => {
    if (!onDelete) return;

    setDeleting(true);
    try {
      await onDelete(post.post_id);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete post:', error);
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Post Header */}
      <div className="p-4 flex items-center justify-between">
        <Link
          href={`/users/${post.user_id}`}
          className="flex items-center gap-3 hover:opacity-80 transition"
        >
          {/* Avatar */}
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-200">
            {post.user_avatar ? (
              <Image
                src={post.user_avatar}
                alt={post.username}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                <span className="text-lg font-bold text-white">
                  {post.username.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* User Info */}
          <div>
            <p className="font-semibold text-gray-900">@{post.username}</p>
            <p className="text-sm text-gray-500">{formatDate(post.created_at)}</p>
          </div>
        </Link>

        {/* Delete Button */}
        {isOwnPost && onDelete && (
          <div className="relative">
            <button
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>

            {showDeleteConfirm && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-64 z-10">
                <p className="text-sm text-gray-700 mb-3">
                  Are you sure you want to delete this post?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Post Content */}
      <div className="px-4 pb-3">
        <p className="text-gray-800 whitespace-pre-wrap break-words">{post.content}</p>
      </div>

      {/* Post Image */}
      {post.image_url && (
        <div className="relative w-full aspect-video bg-gray-100">
          <Image
            src={post.image_url}
            alt="Post image"
            fill
            className="object-cover"
          />
        </div>
      )}

      {/* Recipe Link */}
      {post.recipe_id && post.recipe_title && (
        <Link
          href={`/recipes/${post.recipe_id}`}
          className="mx-4 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 hover:bg-blue-100 transition group"
        >
          <svg
            className="w-5 h-5 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          <div className="flex-1">
            <p className="text-sm text-blue-600 font-medium group-hover:underline">
              {post.recipe_title}
            </p>
            <p className="text-xs text-blue-500">View Recipe</p>
          </div>
        </Link>
      )}

      {/* Reactions and Comments */}
      <div className="border-t border-gray-100 mt-3">
        <ReactionButtons
          postId={post.post_id}
          likeCount={post.like_count}
          commentCount={post.comment_count}
          userReaction={post.user_reaction}
          onReactionChange={onReactionChange}
          onCommentClick={() => setCommentsExpanded(!commentsExpanded)}
        />
      </div>

      {/* Comments Section */}
      {showComments && commentsExpanded && (
        <CommentList postId={post.post_id} initialCommentCount={post.comment_count} />
      )}
    </div>
  );
}
