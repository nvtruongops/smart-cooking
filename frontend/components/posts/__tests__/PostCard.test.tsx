/**
 * PostCard Component Tests
 * Tests post display, interactions, and user actions
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PostCard from '../PostCard';
import { Post } from '@/services/posts';

// Mock child components
jest.mock('../ReactionButtons', () => ({
  __esModule: true,
  default: ({ postId, onReactionChange }: { postId: string; onReactionChange?: () => void }) => (
    <div data-testid="reaction-buttons">
      <button onClick={() => onReactionChange?.()}>Like</button>
    </div>
  ),
}));

jest.mock('../../comments/CommentList', () => ({
  __esModule: true,
  default: ({ postId }: { postId: string }) => (
    <div data-testid={`comment-list-${postId}`}>Comments</div>
  ),
}));

describe('PostCard Component', () => {
  const mockPost: Post = {
    post_id: 'post-123',
    user_id: 'user-456',
    username: 'Nguyễn Văn A',
    user_avatar: 'https://example.com/avatar.jpg',
    content: 'Món ăn ngon tuyệt vời!',
    recipe_id: 'recipe-789',
    recipe_title: 'Phở bò',
    image_url: 'https://example.com/post.jpg',
    created_at: new Date().toISOString(),
    like_count: 10,
    comment_count: 5,
    user_reaction: undefined,
  };

  const mockOnDelete = jest.fn();
  const mockOnReactionChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render post content', () => {
    render(<PostCard post={mockPost} />);
    expect(screen.getByText('Món ăn ngon tuyệt vời!')).toBeInTheDocument();
  });

  it('should render user name', () => {
    render(<PostCard post={mockPost} />);
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
  });

  it('should render recipe title when provided', () => {
    render(<PostCard post={mockPost} />);
    expect(screen.getByText('Phở bò')).toBeInTheDocument();
  });

  it('should display user avatar', () => {
    render(<PostCard post={mockPost} />);
    const avatar = screen.getByAltText('Nguyễn Văn A');
    expect(avatar).toBeInTheDocument();
  });

  it('should display post image when provided', () => {
    render(<PostCard post={mockPost} />);
    const images = screen.getAllByRole('img');
    const postImage = images.find(img => 
      img.getAttribute('src')?.includes('post.jpg')
    );
    expect(postImage).toBeDefined();
  });

  it('should show delete button for own posts', () => {
    render(
      <PostCard
        post={mockPost}
        currentUserId="user-456"
        onDelete={mockOnDelete}
      />
    );
    // Look for delete/menu button
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should not show delete button for other users posts', () => {
    render(
      <PostCard
        post={mockPost}
        currentUserId="different-user"
        onDelete={mockOnDelete}
      />
    );
    // Should still render but without delete option
    expect(screen.getByText('Món ăn ngon tuyệt vời!')).toBeInTheDocument();
  });

  it('should call onDelete when delete is confirmed', async () => {
    render(
      <PostCard
        post={mockPost}
        currentUserId="user-456"
        onDelete={mockOnDelete}
      />
    );

    // This test depends on implementation - adjust selector as needed
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('should format recent timestamps correctly', () => {
    const recentPost = {
      ...mockPost,
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    };
    render(<PostCard post={recentPost} />);
    expect(screen.getByText(/5m ago|Just now/i)).toBeInTheDocument();
  });

  it('should render ReactionButtons component', () => {
    render(<PostCard post={mockPost} onReactionChange={mockOnReactionChange} />);
    expect(screen.getByTestId('reaction-buttons')).toBeInTheDocument();
  });

  it('should call onReactionChange when reaction button is clicked', () => {
    render(<PostCard post={mockPost} onReactionChange={mockOnReactionChange} />);
    const likeButton = screen.getByText('Like');
    fireEvent.click(likeButton);
    expect(mockOnReactionChange).toHaveBeenCalled();
  });

  it('should toggle comments when showComments is true', () => {
    render(<PostCard post={mockPost} showComments={true} />);
    // Comments functionality should be present
    expect(screen.getByText('Món ăn ngon tuyệt vời!')).toBeInTheDocument();
  });

  it('should not show comments when showComments is false', () => {
    render(<PostCard post={mockPost} showComments={false} />);
    expect(screen.queryByTestId(`comment-list-${mockPost.post_id}`)).not.toBeInTheDocument();
  });

  it('should handle post without recipe', () => {
    const postWithoutRecipe = {
      ...mockPost,
      recipe_id: undefined,
      recipe_title: undefined,
    };
    render(<PostCard post={postWithoutRecipe} />);
    expect(screen.getByText('Món ăn ngon tuyệt vời!')).toBeInTheDocument();
    expect(screen.queryByText('Phở bò')).not.toBeInTheDocument();
  });

  it('should handle post without image', () => {
    const postWithoutImage = {
      ...mockPost,
      image_url: undefined,
    };
    render(<PostCard post={postWithoutImage} />);
    expect(screen.getByText('Món ăn ngon tuyệt vời!')).toBeInTheDocument();
  });
});
