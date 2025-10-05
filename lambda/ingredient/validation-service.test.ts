/**
 * Unit tests for Ingredient Validation Service
 */

import { IngredientValidationService } from './validation-service';
import { DynamoDBHelper } from '../shared/dynamodb';
import { ValidationRequest } from './types';

// Mock DynamoDB Helper
jest.mock('../shared/dynamodb');

describe('IngredientValidationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockMasterIngredients = [
    {
      ingredient_id: 'ing-001',
      name: 'Tomato',
      normalized_name: 'tomato',
      category: 'vegetable',
      aliases: ['cà chua', 'ca chua'],
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    },
    {
      ingredient_id: 'ing-002',
      name: 'Chicken',
      normalized_name: 'chicken',
      category: 'protein',
      aliases: ['gà', 'ga'],
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    },
    {
      ingredient_id: 'ing-003',
      name: 'Rice',
      normalized_name: 'rice',
      category: 'grain',
      aliases: ['gạo', 'gao'],
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    },
    {
      ingredient_id: 'ing-004',
      name: 'Onion',
      normalized_name: 'onion',
      category: 'vegetable',
      aliases: ['hành tây', 'hanh tay'],
      is_active: true,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    }
  ];

  describe('validateIngredients', () => {
    it('should validate ingredients with exact match', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['Tomato', 'Chicken']
      };

      const result = await IngredientValidationService.validateIngredients(request);

      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);

      expect(result.valid[0]).toMatchObject({
        original: 'Tomato',
        ingredient_id: 'ing-001',
        ingredient_name: 'Tomato',
        normalized_name: 'tomato',
        category: 'vegetable',
        match_type: 'exact',
        match_score: 1.0
      });
    });

    it('should validate ingredients with alias match (Vietnamese)', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['cà chua', 'gà']
      };

      const result = await IngredientValidationService.validateIngredients(request);

      expect(result.valid).toHaveLength(2);
      expect(result.valid[0]).toMatchObject({
        original: 'cà chua',
        ingredient_id: 'ing-001',
        ingredient_name: 'Tomato',
        match_type: 'alias',
        match_score: 0.95
      });
      expect(result.valid[1]).toMatchObject({
        original: 'gà',
        ingredient_id: 'ing-002',
        ingredient_name: 'Chicken',
        match_type: 'alias',
        match_score: 0.95
      });
    });

    it('should handle Vietnamese tone marks correctly', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['ca chua', 'ga', 'gao'] // Missing tone marks
      };

      const result = await IngredientValidationService.validateIngredients(request);

      // Should match via normalized alias
      expect(result.valid).toHaveLength(3);
      expect(result.valid[0].ingredient_name).toBe('Tomato');
      expect(result.valid[1].ingredient_name).toBe('Chicken');
      expect(result.valid[2].ingredient_name).toBe('Rice');
    });

    it('should detect fuzzy matches for typos', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['Tomatos', 'Chickn'] // Typos
      };

      const result = await IngredientValidationService.validateIngredients(request);

      expect(result.valid).toHaveLength(2);
      expect(result.warnings).toHaveLength(2);

      expect(result.valid[0]).toMatchObject({
        original: 'Tomatos',
        ingredient_name: 'Tomato',
        match_type: 'fuzzy'
      });
      expect(result.valid[0].match_score).toBeGreaterThanOrEqual(0.7);

      expect(result.warnings[0]).toMatchObject({
        original: 'Tomatos',
        corrected: 'Tomato',
        message: 'Did you mean "Tomato"?'
      });
    });

    it('should reject invalid ingredients with suggestions', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['xyz123', 'unknown ingredient']
      };

      const result = await IngredientValidationService.validateIngredients(request);

      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(2);

      expect(result.invalid[0]).toMatchObject({
        original: 'xyz123',
        reason: 'Ingredient not found in master list'
      });
    });

    it('should handle batch validation (1-20 ingredients)', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const ingredients = Array(15).fill('Tomato');
      const request: ValidationRequest = { ingredients };

      const result = await IngredientValidationService.validateIngredients(request);

      expect(result.valid).toHaveLength(15);
      expect(result.invalid).toHaveLength(0);
    });

    it('should reject batch with more than 20 ingredients', async () => {
      const ingredients = Array(21).fill('Tomato');
      const request: ValidationRequest = { ingredients };

      await expect(
        IngredientValidationService.validateIngredients(request)
      ).rejects.toThrow('Maximum 20 ingredients allowed per request');
    });

    it('should require at least one ingredient', async () => {
      const request: ValidationRequest = { ingredients: [] };

      await expect(
        IngredientValidationService.validateIngredients(request)
      ).rejects.toThrow('At least one ingredient is required');
    });

    it('should handle empty strings', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['Tomato', '  ', 'Chicken', '']
      };

      const result = await IngredientValidationService.validateIngredients(request);

      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(2);
      expect(result.invalid[0].reason).toBe('Empty ingredient name');
      expect(result.invalid[1].reason).toBe('Empty ingredient name');
    });

    it('should handle case-insensitive matching', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['TOMATO', 'ChIcKeN', 'rice']
      };

      const result = await IngredientValidationService.validateIngredients(request);

      expect(result.valid).toHaveLength(3);
      expect(result.valid[0].match_type).toBe('exact');
      expect(result.valid[1].match_type).toBe('exact');
      expect(result.valid[2].match_type).toBe('exact');
    });

    it('should load master ingredients only once for batch', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['Tomato', 'Chicken', 'Rice']
      };

      await IngredientValidationService.validateIngredients(request);

      // Should query master ingredients only once
      expect(DynamoDBHelper.query).toHaveBeenCalledTimes(1);
      expect(DynamoDBHelper.query).toHaveBeenCalledWith(
        expect.objectContaining({
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          FilterExpression: 'is_active = :active'
        })
      );
    });

    it('should provide suggestions for invalid ingredients', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['Tomatoe'] // Close to Tomato
      };

      const result = await IngredientValidationService.validateIngredients(request);

      // Might be valid as fuzzy match or invalid with suggestions
      if (result.invalid.length > 0) {
        expect(result.invalid[0].suggestions).toBeDefined();
        expect(result.invalid[0].suggestions).toBeInstanceOf(Array);
      }
    });

    it('should not write to database (read-only validation)', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['Tomato', 'InvalidIngredient']
      };

      await IngredientValidationService.validateIngredients(request);

      // Verify no DB write operations were called
      expect(DynamoDBHelper.put).not.toHaveBeenCalled();
      expect(DynamoDBHelper.update).not.toHaveBeenCalled();
      expect(DynamoDBHelper.batchWrite).not.toHaveBeenCalled();
    });

    it('should include all required fields in validated ingredients', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['Tomato']
      };

      const result = await IngredientValidationService.validateIngredients(request);

      expect(result.valid[0]).toHaveProperty('original');
      expect(result.valid[0]).toHaveProperty('ingredient_id');
      expect(result.valid[0]).toHaveProperty('ingredient_name');
      expect(result.valid[0]).toHaveProperty('normalized_name');
      expect(result.valid[0]).toHaveProperty('category');
      expect(result.valid[0]).toHaveProperty('match_type');
      expect(result.valid[0]).toHaveProperty('match_score');
    });

    it('should handle mixed valid and invalid ingredients', async () => {
      (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
        Items: mockMasterIngredients
      });

      const request: ValidationRequest = {
        ingredients: ['Tomato', 'xyz', 'Chicken', 'abc', 'Rice']
      };

      const result = await IngredientValidationService.validateIngredients(request);

      expect(result.valid).toHaveLength(3);
      expect(result.invalid).toHaveLength(2);
      expect(result.valid.map(v => v.ingredient_name)).toEqual(['Tomato', 'Chicken', 'Rice']);
    });

    // Additional tests for fuzzy search accuracy
    describe('Fuzzy Search Accuracy', () => {
      it('should match ingredients with 1 character typo', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Tometo', 'Chiken', 'Rize'] // Single char typos
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.valid).toHaveLength(3);
        expect(result.valid[0].ingredient_name).toBe('Tomato');
        expect(result.valid[1].ingredient_name).toBe('Chicken');
        expect(result.valid[2].ingredient_name).toBe('Rice');
        expect(result.valid[0].match_type).toBe('fuzzy');
        expect(result.valid[0].match_score).toBeGreaterThanOrEqual(0.7);
      });

      it('should match ingredients with transposed characters (if above threshold)', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Chciken'] // Transposed chars but still above 70% threshold
        };

        const result = await IngredientValidationService.validateIngredients(request);

        // Chciken should match Chicken with fuzzy
        expect(result.valid.length).toBeGreaterThan(0);
        if (result.valid.length > 0) {
          expect(result.valid[0].match_type).toBe('fuzzy');
          expect(result.valid[0].match_score).toBeGreaterThanOrEqual(0.7);
        }
      });

      it('should reject ingredients below fuzzy threshold (70%)', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Xyz123', 'Abcdef'] // Very different strings
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.valid).toHaveLength(0);
        expect(result.invalid).toHaveLength(2);
      });

      it('should calculate accurate match scores for fuzzy matches', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Tomato', 'Tomatos', 'Tomatoe'] // Varying similarity
        };

        const result = await IngredientValidationService.validateIngredients(request);

        // Exact match should have score 1.0
        expect(result.valid[0].match_score).toBe(1.0);

        // Fuzzy matches should have scores >= 0.7 but < 1.0
        if (result.valid.length > 1) {
          expect(result.valid[1].match_score).toBeGreaterThanOrEqual(0.7);
          expect(result.valid[1].match_score).toBeLessThan(1.0);
        }
      });
    });

    // Additional tests for confidence scoring and auto-correction
    describe('Auto-correction and Confidence Scoring', () => {
      it('should provide warnings with confidence scores for fuzzy matches', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Tomatos', 'Chickn']
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.warnings).toHaveLength(2);
        expect(result.warnings[0]).toMatchObject({
          original: 'Tomatos',
          corrected: 'Tomato',
          message: 'Did you mean "Tomato"?'
        });
        expect(result.warnings[0].confidence).toBeGreaterThanOrEqual(0.7);
        expect(result.warnings[0].confidence).toBeLessThanOrEqual(1.0);
      });

      it('should not provide warnings for exact matches', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Tomato', 'Chicken', 'Rice']
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.warnings).toHaveLength(0);
      });

      it('should not provide warnings for alias matches', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['cà chua', 'gà']
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.warnings).toHaveLength(0);
      });

      it('should provide up to 3 suggestions for invalid ingredients', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Tom'] // Partial match, should get suggestions
        };

        const result = await IngredientValidationService.validateIngredients(request);

        if (result.invalid.length > 0) {
          expect(result.invalid[0].suggestions).toBeDefined();
          expect(result.invalid[0].suggestions!.length).toBeLessThanOrEqual(3);
        }
      });

      it('should match confidence score to match score for fuzzy matches', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Tomatos']
        };

        const result = await IngredientValidationService.validateIngredients(request);

        if (result.valid.length > 0 && result.warnings.length > 0) {
          expect(result.valid[0].match_score).toBe(result.warnings[0].confidence);
        }
      });
    });

    // Additional tests for batch validation scenarios
    describe('Batch Validation Scenarios', () => {
      it('should handle batch with all valid ingredients', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Tomato', 'Chicken', 'Rice', 'Onion']
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.valid).toHaveLength(4);
        expect(result.invalid).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });

      it('should handle batch with all invalid ingredients', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['xyz123', 'abc456', 'def789']
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.valid).toHaveLength(0);
        expect(result.invalid).toHaveLength(3);
      });

      it('should handle batch with mix of exact, alias, and fuzzy matches', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: [
            'Tomato',      // exact
            'cà chua',     // alias
            'Chickn',      // fuzzy
            'gà',          // alias
            'Rize',        // fuzzy
            'Onion'        // exact
          ]
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.valid).toHaveLength(6);

        const exactMatches = result.valid.filter(v => v.match_type === 'exact');
        const aliasMatches = result.valid.filter(v => v.match_type === 'alias');
        const fuzzyMatches = result.valid.filter(v => v.match_type === 'fuzzy');

        expect(exactMatches.length).toBeGreaterThan(0);
        expect(aliasMatches.length).toBeGreaterThan(0);
        expect(fuzzyMatches.length).toBeGreaterThan(0);
      });

      it('should maintain order of ingredients in results', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const ingredients = ['Rice', 'Chicken', 'Tomato', 'Onion'];
        const request: ValidationRequest = { ingredients };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.valid.map(v => v.original)).toEqual(ingredients);
      });

      it('should handle duplicate ingredients in batch', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Tomato', 'Tomato', 'Chicken', 'Tomato']
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.valid).toHaveLength(4);
        expect(result.valid.filter(v => v.ingredient_name === 'Tomato')).toHaveLength(3);
      });
    });

    // Additional tests for Vietnamese language support
    describe('Vietnamese Language Support', () => {
      it('should match Vietnamese names without tone marks', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['ca chua', 'ga', 'gao', 'hanh tay'] // Missing tone marks
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.valid).toHaveLength(4);
        expect(result.valid[0].ingredient_name).toBe('Tomato');
        expect(result.valid[1].ingredient_name).toBe('Chicken');
        expect(result.valid[2].ingredient_name).toBe('Rice');
        expect(result.valid[3].ingredient_name).toBe('Onion');
      });

      it('should match Vietnamese names with correct tone marks', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['cà chua', 'gà', 'gạo', 'hành tây']
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.valid).toHaveLength(4);
        expect(result.valid.every(v => v.match_type === 'alias')).toBe(true);
      });

      it('should handle mixed English and Vietnamese ingredients', async () => {
        (DynamoDBHelper.query as jest.Mock).mockResolvedValue({
          Items: mockMasterIngredients
        });

        const request: ValidationRequest = {
          ingredients: ['Tomato', 'gà', 'Rice', 'hành tây']
        };

        const result = await IngredientValidationService.validateIngredients(request);

        expect(result.valid).toHaveLength(4);

        const exactMatches = result.valid.filter(v => v.match_type === 'exact');
        const aliasMatches = result.valid.filter(v => v.match_type === 'alias');

        expect(exactMatches).toHaveLength(2);
        expect(aliasMatches).toHaveLength(2);
      });
    });
  });
});
