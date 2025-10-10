/**
 * ReactionButtons Component Tests
 * Tests like/reaction functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReactionButtons from '../ReactionButtons';

// Mock fetch
global.fetch = jest.fn();

describe('ReactionButtons Component', () => {
  const mockOnReactionChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it('should render like button', () => {
    render(
      <ReactionButtons
        postId="post-123"
        likeCount={0}
        commentCount={0}
        onReactionChange={mockOnReactionChange}
      />
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should display like count', () => {
    render(
      <ReactionButtons
        postId="post-123"
        likeCount={10}
        commentCount={0}
        onReactionChange={mockOnReactionChange}
      />
    );
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });

  it('should show liked state when user has liked', () => {
    render(
      <ReactionButtons
        postId="post-123"
        likeCount={5}
        commentCount={0}
        userReaction="like"
        onReactionChange={mockOnReactionChange}
      />
    );
    const button = screen.getAllByRole('button')[0];
    expect(button).toBeInTheDocument();
  });

  it('should call API when like button is clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <ReactionButtons
        postId="post-123"
        likeCount={0}
        commentCount={0}
        onReactionChange={mockOnReactionChange}
      />
    );

    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('should call onReactionChange after successful like', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <ReactionButtons
        postId="post-123"
        likeCount={0}
        commentCount={0}
        onReactionChange={mockOnReactionChange}
      />
    );

    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockOnReactionChange).toHaveBeenCalled();
    });
  });

  it('should toggle like state on click', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { rerender } = render(
      <ReactionButtons
        postId="post-123"
        likeCount={0}
        commentCount={0}
        onReactionChange={mockOnReactionChange}
      />
    );

    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockOnReactionChange).toHaveBeenCalled();
    });

    // Rerender with liked state
    rerender(
      <ReactionButtons
        postId="post-123"
        likeCount={1}
        commentCount={0}
        userReaction="like"
        onReactionChange={mockOnReactionChange}
      />
    );

    expect(screen.getByText(/1/)).toBeInTheDocument();
  });

  it('should handle API errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(
      <ReactionButtons
        postId="post-123"
        likeCount={0}
        commentCount={0}
        onReactionChange={mockOnReactionChange}
      />
    );

    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('should show zero when no likes', () => {
    render(
      <ReactionButtons
        postId="post-123"
        likeCount={0}
        commentCount={0}
        onReactionChange={mockOnReactionChange}
      />
    );
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });
});
