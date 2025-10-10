/**
 * CommentItem Component Tests
 * Tests comment display and interactions
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CommentItem from '../CommentItem';

describe('CommentItem Component', () => {
  const mockComment = {
    comment_id: 'comment-123',
    post_id: 'post-456',
    user_id: 'user-789',
    username: 'john_doe',
    user_avatar: 'https://example.com/avatar.jpg',
    content: 'Great recipe!',
    created_at: new Date().toISOString(),
  };

  const mockOnDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render comment content', () => {
    render(<CommentItem comment={mockComment} postId="post-456" />);
    expect(screen.getByText('Great recipe!')).toBeInTheDocument();
  });

  it('should render username', () => {
    render(<CommentItem comment={mockComment} postId="post-456" />);
    expect(screen.getByText(/john_doe/)).toBeInTheDocument();
  });

  it('should display user avatar', () => {
    render(<CommentItem comment={mockComment} postId="post-456" />);
    const avatar = screen.getByAltText(/john_doe|avatar/i);
    expect(avatar).toBeInTheDocument();
  });

  it('should format timestamp correctly', () => {
    render(<CommentItem comment={mockComment} postId="post-456" />);
    expect(screen.getByText(/ago|just now/i)).toBeInTheDocument();
  });

  it('should show delete button for own comments', () => {
    render(
      <CommentItem
        comment={mockComment}
        postId="post-456"
        currentUserId="user-789"
        onDelete={mockOnDelete}
      />
    );
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    expect(deleteButton).toBeInTheDocument();
  });

  it('should not show delete button for other users comments', () => {
    render(
      <CommentItem
        comment={mockComment}
        postId="post-456"
        currentUserId="different-user"
        onDelete={mockOnDelete}
      />
    );
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('should call onDelete when delete button is clicked', () => {
    render(
      <CommentItem
        comment={mockComment}
        postId="post-456"
        currentUserId="user-789"
        onDelete={mockOnDelete}
      />
    );
    
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);
    
    expect(mockOnDelete).toHaveBeenCalledWith('comment-123');
  });

  it('should handle comment without avatar', () => {
    const commentNoAvatar = { ...mockComment, user_avatar: undefined };
    render(<CommentItem comment={commentNoAvatar} postId="post-456" />);
    expect(screen.getByText('Great recipe!')).toBeInTheDocument();
  });
});
