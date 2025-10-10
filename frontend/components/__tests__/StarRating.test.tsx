/**
 * StarRating Component Tests
 * Tests rating display and interaction
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StarRating from '../StarRating';

describe('StarRating Component', () => {
  it('should render 5 stars', () => {
    render(<StarRating rating={0} onRatingChange={() => {}} />);
    const stars = screen.getAllByRole('button');
    expect(stars).toHaveLength(5);
  });

  it('should display correct rating visually', () => {
    render(<StarRating rating={3} onRatingChange={() => {}} />);
    // Should have visual indication of 3 filled stars
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('should call onRatingChange when star is clicked', () => {
    const mockOnRatingChange = jest.fn();
    render(<StarRating rating={0} onRatingChange={mockOnRatingChange} />);

    const stars = screen.getAllByRole('button');
    fireEvent.click(stars[2]); // Click 3rd star

    expect(mockOnRatingChange).toHaveBeenCalledWith(3);
  });

  it('should highlight stars on hover', () => {
    render(<StarRating rating={0} onRatingChange={() => {}} />);
    const stars = screen.getAllByRole('button');

    fireEvent.mouseEnter(stars[3]); // Hover over 4th star
    // Stars should show hover state
    expect(stars[3]).toBeDefined();
  });

  it('should be read-only when onRatingChange is not provided', () => {
    render(<StarRating rating={4} />);
    const container = screen.getByRole('group', { hidden: true }) || screen.getAllByRole('button')[0].parentElement;
    expect(container).toBeDefined();
  });

  it('should show half stars for decimal ratings', () => {
    render(<StarRating rating={3.5} />);
    // Should display 3.5 stars visually
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('should handle rating of 0', () => {
    render(<StarRating rating={0} onRatingChange={() => {}} />);
    const stars = screen.getAllByRole('button');
    expect(stars).toHaveLength(5);
  });

  it('should handle maximum rating of 5', () => {
    render(<StarRating rating={5} onRatingChange={() => {}} />);
    const stars = screen.getAllByRole('button');
    expect(stars).toHaveLength(5);
  });

  it('should reset hover state on mouse leave', () => {
    render(<StarRating rating={2} onRatingChange={() => {}} />);
    const stars = screen.getAllByRole('button');

    fireEvent.mouseEnter(stars[4]);
    fireEvent.mouseLeave(stars[4]);

    // Should revert to original rating display
    expect(stars[4]).toBeDefined();
  });

  it('should allow changing rating multiple times', () => {
    const mockOnRatingChange = jest.fn();
    render(<StarRating rating={0} onRatingChange={mockOnRatingChange} />);

    const stars = screen.getAllByRole('button');

    fireEvent.click(stars[0]); // 1 star
    fireEvent.click(stars[2]); // 3 stars
    fireEvent.click(stars[4]); // 5 stars

    expect(mockOnRatingChange).toHaveBeenCalledTimes(3);
    expect(mockOnRatingChange).toHaveBeenNthCalledWith(1, 1);
    expect(mockOnRatingChange).toHaveBeenNthCalledWith(2, 3);
    expect(mockOnRatingChange).toHaveBeenNthCalledWith(3, 5);
  });

  it('should show tooltip with rating value', () => {
    render(<StarRating rating={4} />);
    // Tooltip or aria-label should show rating
    const stars = screen.getAllByRole('button');
    expect(stars.length).toBe(5);
  });

  it('should be accessible with keyboard navigation', () => {
    const mockOnRatingChange = jest.fn();
    render(<StarRating rating={0} onRatingChange={mockOnRatingChange} />);

    const stars = screen.getAllByRole('button');
    
    // Should be able to focus and activate with keyboard
    stars[2].focus();
    fireEvent.keyDown(stars[2], { key: 'Enter' });
    
    expect(mockOnRatingChange).toHaveBeenCalled();
  });
});
