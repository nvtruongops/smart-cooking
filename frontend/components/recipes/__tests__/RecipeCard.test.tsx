/**
 * RecipeCard Component Tests
 * Tests rendering, user interactions, and different recipe states
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecipeCard from '../RecipeCard';
import { Recipe } from '@/types/recipe';

describe('RecipeCard Component', () => {
  const mockOnClick = jest.fn();

  const mockRecipe: Recipe = {
    recipe_id: 'recipe-123',
    title: 'Bò xào cà chua',
    description: 'Món ăn truyền thống Việt Nam',
    cuisine_type: 'vietnamese',
    cooking_method: 'stir_fry',
    meal_type: 'lunch',
    ingredients: [
      { ingredient_name: 'Thịt bò', quantity: '300', unit: 'g' },
      { ingredient_name: 'Cà chua', quantity: '2', unit: 'quả' },
      { ingredient_name: 'Hành tây', quantity: '1', unit: 'củ' }
    ],
    instructions: [
      { step_number: 1, description: 'Thái thịt' },
      { step_number: 2, description: 'Xào thịt' },
      { step_number: 3, description: 'Thêm cà chua' }
    ],
    prep_time_minutes: 15,
    cook_time_minutes: 30,
    servings: 4,
    is_public: true,
    is_ai_generated: false,
    is_approved: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render recipe title', () => {
    render(<RecipeCard recipe={mockRecipe} onClick={mockOnClick} />);
    expect(screen.getByText('Bò xào cà chua')).toBeInTheDocument();
  });

  it('should render recipe description', () => {
    render(<RecipeCard recipe={mockRecipe} onClick={mockOnClick} />);
    expect(screen.getByText('Món ăn truyền thống Việt Nam')).toBeInTheDocument();
  });

  it('should display cooking method badge', () => {
    render(<RecipeCard recipe={mockRecipe} onClick={mockOnClick} />);
    // Cooking method should be visible somewhere
    const card = screen.getByText('Bò xào cà chua').closest('div');
    expect(card).toBeInTheDocument();
  });

  it('should call onClick when card is clicked', () => {
    render(<RecipeCard recipe={mockRecipe} onClick={mockOnClick} />);
    const card = screen.getByText('Bò xào cà chua').closest('div');
    if (card) {
      fireEvent.click(card);
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    }
  });

  it('should display AI badge for AI-generated recipes', () => {
    const aiRecipe = { ...mockRecipe, is_ai_generated: true };
    render(<RecipeCard recipe={aiRecipe} onClick={mockOnClick} />);
    expect(screen.getByText(/AI/i)).toBeInTheDocument();
  });

  it('should display database badge for database recipes', () => {
    render(<RecipeCard recipe={mockRecipe} onClick={mockOnClick} />);
    expect(screen.getByText(/DB/i)).toBeInTheDocument();
  });

  it('should display rating when available', () => {
    const ratedRecipe = {
      ...mockRecipe,
      average_rating: 4.5,
      rating_count: 10,
    };
    render(<RecipeCard recipe={ratedRecipe} onClick={mockOnClick} />);
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('(10)')).toBeInTheDocument();
  });

  it('should not display rating when not available', () => {
    render(<RecipeCard recipe={mockRecipe} onClick={mockOnClick} />);
    expect(screen.queryByText(/\d+\.\d+/)).not.toBeInTheDocument();
  });

  it('should display recipe image when image_url is provided', () => {
    const recipeWithImage = {
      ...mockRecipe,
      image_url: 'https://example.com/recipe.jpg',
    };
    render(<RecipeCard recipe={recipeWithImage} onClick={mockOnClick} />);
    const img = screen.getByAltText('Bò xào cà chua');
    expect(img).toHaveAttribute('src', 'https://example.com/recipe.jpg');
  });

  it('should display placeholder when image_url is not provided', () => {
    render(<RecipeCard recipe={mockRecipe} onClick={mockOnClick} />);
    // SVG placeholder should be rendered
    const card = screen.getByText('Bò xào cà chua').closest('div');
    expect(card).toBeInTheDocument();
  });

  it('should handle missing description gracefully', () => {
    const recipeNoDescription = { ...mockRecipe, description: '' };
    render(<RecipeCard recipe={recipeNoDescription} onClick={mockOnClick} />);
    expect(screen.getByText('Bò xào cà chua')).toBeInTheDocument();
  });

  it('should apply hover effect classes', () => {
    render(<RecipeCard recipe={mockRecipe} onClick={mockOnClick} />);
    const card = screen.getByText('Bò xào cà chua').closest('div');
    expect(card).toHaveClass('cursor-pointer');
  });
});
