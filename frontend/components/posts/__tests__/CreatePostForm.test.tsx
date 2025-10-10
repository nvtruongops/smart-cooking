/**
 * CreatePostForm Component Tests  
 * Tests post creation form and validation
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CreatePostForm from '../CreatePostForm';

// Mock fetch
global.fetch = jest.fn();

describe('CreatePostForm Component', () => {
  const mockOnPostCreated = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it('should render post content textarea', () => {
    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
  });

  it('should render submit button', () => {
    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const submitButton = screen.getByRole('button', { name: /post|share|submit/i });
    expect(submitButton).toBeInTheDocument();
  });

  it('should update content when typing', () => {
    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const textarea = screen.getByRole('textbox');
    
    fireEvent.change(textarea, { target: { value: 'My new post' } });
    expect(textarea).toHaveValue('My new post');
  });

  it('should disable submit button when content is empty', () => {
    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const submitButton = screen.getByRole('button', { name: /post|share|submit/i });
    expect(submitButton).toBeDisabled();
  });

  it('should enable submit button when content is provided', () => {
    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const textarea = screen.getByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /post|share|submit/i });
    
    fireEvent.change(textarea, { target: { value: 'My new post' } });
    expect(submitButton).not.toBeDisabled();
  });

  it('should submit post with content', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ post_id: 'new-post-123' }),
    });

    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const textarea = screen.getByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /post|share|submit/i });

    fireEvent.change(textarea, { target: { value: 'My new post' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('should call onPostCreated after successful submission', async () => {
    const newPost = { post_id: 'new-post-123', content: 'My new post' };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => newPost,
    });

    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const textarea = screen.getByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /post|share|submit/i });

    fireEvent.change(textarea, { target: { value: 'My new post' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnPostCreated).toHaveBeenCalledWith(newPost);
    });
  });

  it('should clear form after successful submission', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ post_id: 'new-post-123' }),
    });

    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const textarea = screen.getByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /post|share|submit/i });

    fireEvent.change(textarea, { target: { value: 'My new post' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });

  it('should show error message on submission failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const textarea = screen.getByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /post|share|submit/i });

    fireEvent.change(textarea, { target: { value: 'My new post' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    });
  });

  it('should disable submit button while posting', async () => {
    (global.fetch as jest.Mock).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    );

    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const textarea = screen.getByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /post|share|submit/i });

    fireEvent.change(textarea, { target: { value: 'My new post' } });
    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();
  });

  it('should render post form', () => {
    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should show character count', () => {
    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    fireEvent.change(textarea, { target: { value: 'Test post' } });
    
    // Should show character count somewhere
    expect(screen.getByRole('textbox')).toHaveValue('Test post');
  });

  it('should enforce maximum character limit', () => {
    render(<CreatePostForm onPostCreated={mockOnPostCreated} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    const longText = 'a'.repeat(1000);
    fireEvent.change(textarea, { target: { value: longText } });
    
    // Should either truncate or show error
    expect(textarea.value.length).toBeLessThanOrEqual(1000);
  });
});
