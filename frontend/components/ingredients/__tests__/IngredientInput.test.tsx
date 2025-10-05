import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import IngredientInput from '../IngredientInput';

// Mock the ingredient service
jest.mock('@/services/ingredientService', () => ({
  searchIngredients: jest.fn(),
  validateIngredient: jest.fn(),
}));

import { searchIngredients, validateIngredient } from '@/services/ingredientService';

const mockSearchIngredients = searchIngredients as jest.MockedFunction<typeof searchIngredients>;
const mockValidateIngredient = validateIngredient as jest.MockedFunction<typeof validateIngredient>;

describe('IngredientInput', () => {
  const mockOnAdd = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders input field with placeholder', () => {
    render(<IngredientInput onAdd={mockOnAdd} placeholder="Test placeholder" />);
    
    const input = screen.getByPlaceholderText('Test placeholder');
    expect(input).toBeInTheDocument();
  });

  it('shows suggestions when typing', async () => {
    const mockResults = [
      {
        ingredient_id: '1',
        name: 'Thịt gà',
        normalized_name: 'thit ga',
        category: 'meat',
        aliases: ['gà', 'chicken'],
        match_type: 'exact' as const,
        match_score: 1.0
      }
    ];

    mockSearchIngredients.mockResolvedValue(mockResults);

    render(<IngredientInput onAdd={mockOnAdd} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'thịt gà' } });

    await waitFor(() => {
      expect(mockSearchIngredients).toHaveBeenCalledWith('thịt gà', { limit: 10, fuzzyThreshold: 0.6 });
    });

    await waitFor(() => {
      expect(screen.getByText('Thịt gà')).toBeInTheDocument();
    });
  });

  it('validates ingredient in real-time when enabled', async () => {
    const mockValidation = {
      valid: true,
      result: {
        ingredient_id: '1',
        name: 'Thịt gà',
        normalized_name: 'thit ga',
        category: 'meat',
        aliases: ['gà'],
        match_type: 'exact' as const,
        match_score: 1.0
      }
    };

    mockValidateIngredient.mockResolvedValue(mockValidation);

    render(<IngredientInput onAdd={mockOnAdd} enableRealTimeValidation={true} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'thịt gà' } });

    await waitFor(() => {
      expect(mockValidateIngredient).toHaveBeenCalledWith('thịt gà');
    }, { timeout: 1000 });
  });

  it('calls onAdd when Enter is pressed', async () => {
    render(<IngredientInput onAdd={mockOnAdd} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'thịt gà' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(mockOnAdd).toHaveBeenCalledWith('thịt gà', undefined);
  });

  it('shows validation status icons when real-time validation is enabled', async () => {
    const mockValidation = {
      valid: true,
      warning: {
        original: 'thit ga',
        corrected: 'Thịt gà',
        confidence: 0.9,
        message: 'Ingredient name auto-corrected'
      }
    };

    mockValidateIngredient.mockResolvedValue(mockValidation);

    render(<IngredientInput onAdd={mockOnAdd} enableRealTimeValidation={true} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'thit ga' } });

    await waitFor(() => {
      expect(mockValidateIngredient).toHaveBeenCalled();
    });

    // Should show warning icon for corrected ingredient
    await waitFor(() => {
      const warningIcon = screen.getByRole('textbox').parentElement?.querySelector('svg[class*="text-yellow-500"]');
      expect(warningIcon).toBeInTheDocument();
    });
  });
});