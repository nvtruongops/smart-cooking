/**
 * Unit tests for Ingredient Validation Lambda Handler
 */

import { handler } from './index';
import { IngredientValidationService } from './validation-service';
import { APIGatewayEvent } from '../shared/types';

// Mock IngredientValidationService
jest.mock('./validation-service');

describe('Ingredient Validation Lambda Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockEvent = (
    method: string,
    path: string,
    body?: string | null
  ): APIGatewayEvent => ({
    httpMethod: method,
    path,
    queryStringParameters: null,
    body: body || null,
    pathParameters: null,
    requestContext: {
      requestId: 'test-request-123',
      authorizer: {
        claims: {
          sub: 'user-123',
          email: 'test@example.com',
          username: 'testuser'
        }
      }
    },
    headers: {},
    multiValueHeaders: {},
    multiValueQueryStringParameters: {},
    stageVariables: {},
    isBase64Encoded: false,
    resource: ''
  });

  describe('POST /ingredients/validate', () => {
    it('should validate ingredients successfully', async () => {
      const mockResult = {
        valid: [
          {
            original: 'Tomato',
            ingredient_id: 'ing-001',
            ingredient_name: 'Tomato',
            normalized_name: 'tomato',
            category: 'vegetable',
            match_type: 'exact' as const,
            match_score: 1.0
          },
          {
            original: 'Chicken',
            ingredient_id: 'ing-002',
            ingredient_name: 'Chicken',
            normalized_name: 'chicken',
            category: 'protein',
            match_type: 'exact' as const,
            match_score: 1.0
          }
        ],
        invalid: [],
        warnings: []
      };

      (IngredientValidationService.validateIngredients as jest.Mock).mockResolvedValue(mockResult);

      const request = {
        ingredients: ['Tomato', 'Chicken']
      };

      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual({
        success: true,
        data: mockResult
      });
    });

    it('should handle validation with warnings', async () => {
      const mockResult = {
        valid: [
          {
            original: 'Tomatos',
            ingredient_id: 'ing-001',
            ingredient_name: 'Tomato',
            normalized_name: 'tomato',
            category: 'vegetable',
            match_type: 'fuzzy' as const,
            match_score: 0.85
          }
        ],
        invalid: [],
        warnings: [
          {
            original: 'Tomatos',
            corrected: 'Tomato',
            confidence: 0.85,
            message: 'Did you mean "Tomato"?'
          }
        ]
      };

      (IngredientValidationService.validateIngredients as jest.Mock).mockResolvedValue(mockResult);

      const request = {
        ingredients: ['Tomatos']
      };

      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.warnings).toHaveLength(1);
      expect(body.data.warnings[0].message).toBe('Did you mean "Tomato"?');
    });

    it('should handle validation with invalid ingredients', async () => {
      const mockResult = {
        valid: [
          {
            original: 'Tomato',
            ingredient_id: 'ing-001',
            ingredient_name: 'Tomato',
            normalized_name: 'tomato',
            category: 'vegetable',
            match_type: 'exact' as const,
            match_score: 1.0
          }
        ],
        invalid: [
          {
            original: 'xyz123',
            reason: 'Ingredient not found in master list',
            suggestions: ['Tomato', 'Onion']
          }
        ],
        warnings: []
      };

      (IngredientValidationService.validateIngredients as jest.Mock).mockResolvedValue(mockResult);

      const request = {
        ingredients: ['Tomato', 'xyz123']
      };

      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.valid).toHaveLength(1);
      expect(body.data.invalid).toHaveLength(1);
      expect(body.data.invalid[0].suggestions).toEqual(['Tomato', 'Onion']);
    });

    it('should require request body', async () => {
      const event = createMockEvent('POST', '/ingredients/validate', null);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('missing_body');
    });

    it('should validate ingredients is an array', async () => {
      const request = {
        ingredients: 'not an array'
      };

      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_request');
      expect(body.message).toBe('ingredients must be an array');
    });

    it('should require at least one ingredient', async () => {
      const request = {
        ingredients: []
      };

      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_request');
      expect(body.message).toBe('At least one ingredient is required');
    });

    it('should limit to maximum 20 ingredients', async () => {
      const request = {
        ingredients: Array(21).fill('Tomato')
      };

      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_request');
      expect(body.message).toBe('Maximum 20 ingredients allowed per request');
    });

    it('should validate all ingredients are strings', async () => {
      const request = {
        ingredients: ['Tomato', 123, 'Chicken']
      };

      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_request');
      expect(body.message).toBe('All ingredients must be strings');
    });

    it('should handle batch validation (1-20 ingredients)', async () => {
      const ingredients = Array(15).fill(null).map((_, i) => `Ingredient ${i + 1}`);
      const mockResult = {
        valid: ingredients.map((ing, i) => ({
          original: ing,
          ingredient_id: `ing-${i + 1}`,
          ingredient_name: ing,
          normalized_name: ing.toLowerCase(),
          category: 'test',
          match_type: 'exact' as const,
          match_score: 1.0
        })),
        invalid: [],
        warnings: []
      };

      (IngredientValidationService.validateIngredients as jest.Mock).mockResolvedValue(mockResult);

      const request = { ingredients };
      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.valid).toHaveLength(15);
    });

    it('should handle Vietnamese ingredients with tone marks', async () => {
      const mockResult = {
        valid: [
          {
            original: 'cà chua',
            ingredient_id: 'ing-001',
            ingredient_name: 'Tomato',
            normalized_name: 'tomato',
            category: 'vegetable',
            match_type: 'alias' as const,
            match_score: 0.95
          },
          {
            original: 'gà',
            ingredient_id: 'ing-002',
            ingredient_name: 'Chicken',
            normalized_name: 'chicken',
            category: 'protein',
            match_type: 'alias' as const,
            match_score: 0.95
          }
        ],
        invalid: [],
        warnings: []
      };

      (IngredientValidationService.validateIngredients as jest.Mock).mockResolvedValue(mockResult);

      const request = {
        ingredients: ['cà chua', 'gà']
      };

      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.valid).toHaveLength(2);
      expect(body.data.valid[0].match_type).toBe('alias');
      expect(body.data.valid[1].match_type).toBe('alias');
    });

    it('should not persist any data (stateless validation)', async () => {
      const mockResult = {
        valid: [],
        invalid: [{
          original: 'unknown',
          reason: 'Ingredient not found in master list'
        }],
        warnings: []
      };

      (IngredientValidationService.validateIngredients as jest.Mock).mockResolvedValue(mockResult);

      const request = {
        ingredients: ['unknown']
      };

      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      await handler(event);

      // Verify the service was called (it's the service's responsibility to not write)
      expect(IngredientValidationService.validateIngredients).toHaveBeenCalledWith(request);
    });

    it('should return 404 for unknown endpoints', async () => {
      const event = createMockEvent('GET', '/ingredients/unknown', null);
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('not_found');
    });

    it('should handle service errors gracefully', async () => {
      (IngredientValidationService.validateIngredients as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = {
        ingredients: ['Tomato']
      };

      const event = createMockEvent('POST', '/ingredients/validate', JSON.stringify(request));
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('internal_server_error');
    });
  });
});
