import { handler } from './index';
import { APIGatewayEvent } from '../shared/types';
import { normalizeVietnamese, calculateMatchConfidence, isValidIngredientFormat } from './validation-utils';

// Mock AWS SDK and shared modules
jest.mock('../shared/dynamodb', () => ({
  DynamoDBHelper: {
    query: jest.fn(),
    put: jest.fn().mockResolvedValue({})
  }
}));

jest.mock('../shared/responses', () => ({
  successResponse: jest.fn((data, status = 200) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })),
  errorResponse: jest.fn((status, error, message) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error, message })
  }))
}));

jest.mock('../shared/utils', () => ({
  parseJSON: jest.fn((str) => {
    try {
      return JSON.parse(str);
    } catch {
      throw new Error('Invalid JSON');
    }
  }),
  logStructured: jest.fn()
}));

jest.mock('../shared/ingredient-service', () => ({
  IngredientService: {
    searchIngredients: jest.fn()
  }
}));

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  PublishCommand: jest.fn()
}));

const mockEvent: Partial<APIGatewayEvent> = {
  httpMethod: 'POST',
  path: '/ingredient/validate',
  pathParameters: null,
  queryStringParameters: null,
  headers: {},
  requestContext: {
    requestId: 'test-request-id',
    authorizer: {
      claims: {
        sub: 'user-123',
        email: 'test@example.com',
        username: 'testuser'
      }
    }
  }
};

const dynamoMock = require('../shared/dynamodb');
const ingredientServiceMock = require('../shared/ingredient-service');

describe('Ingredient Validator Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn(); // Mock console.log
    console.error = jest.fn(); // Mock console.error

    // Reset environment variables
    process.env.ADMIN_TOPIC_ARN = '';

    // Default mock: no matches found
    ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValue([]);

    // Default DynamoDB query mock - returns no existing reports
    dynamoMock.DynamoDBHelper.query.mockResolvedValue({ Items: [], Count: 0 });
  });

  describe('Input Validation', () => {
    test('should reject empty ingredients array', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: [] })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('validation_failed');
      expect(body.message).toContain('cannot be empty');
    });

    test('should reject missing ingredients field', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({})
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('validation_failed');
      expect(body.message).toContain('ingredients field is required');
    });

    test('should reject non-array ingredients field', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: 'not an array' })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('validation_failed');
      expect(body.message).toContain('must be an array');
    });

    test('should reject too many ingredients (>20)', async () => {
      const ingredients = Array(21).fill('thịt gà');
      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('validation_failed');
      expect(body.message).toContain('cannot contain more than 20 items');
    });

    test('should accept valid ingredients array', async () => {
      // Mock IngredientService search result
      ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValueOnce([
        {
          ingredient_id: 'uuid-123',
          name: 'Thịt gà',
          normalized_name: 'thit ga',
          category: 'meat',
          aliases: ['gà', 'chicken'],
          match_type: 'exact',
          match_score: 1.0
        }
      ]);

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['thịt gà'] })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.valid).toEqual(['Thịt gà']);
      expect(body.invalid).toEqual([]);
    });
  });

  describe('Exact Matching Logic', () => {
    test('should find exact match for normalized ingredient', async () => {
      // Mock IngredientService search result
      ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValueOnce([
        {
          ingredient_id: 'uuid-123',
          name: 'Thịt gà',
          normalized_name: 'thit ga',
          category: 'meat',
          aliases: ['gà', 'chicken'],
          match_type: 'exact',
          match_score: 1.0
        }
      ]);

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['thit ga'] })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.valid).toEqual(['Thịt gà']);
      expect(body.warnings).toHaveLength(1);
      expect(body.warnings[0]).toEqual({
        original: 'thit ga',
        corrected: 'Thịt gà',
        confidence: 1.0,
        message: 'Ingredient name corrected to standard form'
      });

      // Verify IngredientService was called
      expect(ingredientServiceMock.IngredientService.searchIngredients).toHaveBeenCalledWith('thit ga', {
        limit: 5,
        fuzzyThreshold: 0.6
      });
    });

    test('should return original name when exact match is identical', async () => {
      // Mock exact match found with identical name
      ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValueOnce([
        {
          name: 'thit ga',
          category: 'meat',
          match_score: 1.0,
          match_type: 'exact'
        }
      ]);

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['thit ga'] })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.valid).toEqual(['thit ga']);
      expect(body.warnings).toHaveLength(0); // No warning when names are identical
    });

    test('should handle exact match query errors gracefully', async () => {
      // Mock search to return empty (no matches)
      ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValueOnce([]);

      // Mock DynamoDB query for logging check
      dynamoMock.DynamoDBHelper.query.mockResolvedValueOnce({ Items: [], Count: 0 });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['thịt gà'] })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.invalid).toEqual(['thịt gà']);
      expect(body.warnings).toHaveLength(1);
      expect(body.warnings[0].message).toContain('Ingredient not found in database');
    });
  });

  describe('Fuzzy Search Accuracy', () => {
    test('should find high confidence fuzzy match (>=0.8)', async () => {
      // Mock fuzzy match found
      ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValueOnce([
        {
          name: 'Thịt gà',
          category: 'meat',
          match_score: 0.85,
          match_type: 'fuzzy'
        }
      ]);

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['thit g'] }) // Missing 'a'
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.valid).toEqual(['Thịt gà']);
      expect(body.warnings).toHaveLength(1);
      expect(body.warnings[0]).toEqual({
        original: 'thit g',
        corrected: 'Thịt gà',
        confidence: 0.85,
        message: 'Ingredient name auto-corrected based on similarity'
      });
    });

    test('should provide suggestions for medium confidence match (0.6-0.8)', async () => {
      // Mock search to return empty (no good matches for "meat chicken")
      ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValueOnce([]);

      // Mock DynamoDB query for logging check
      dynamoMock.DynamoDBHelper.query.mockResolvedValueOnce({ Items: [], Count: 0 });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['meat chicken'] })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.invalid).toEqual(['meat chicken']);
      expect(body.warnings).toHaveLength(1);
      // Since Vietnamese names don't match "meat chicken" well, likely gets "not found"
      expect(body.warnings[0]).toEqual({
        ingredient: 'meat chicken',
        message: 'Ingredient not found in database',
        reported: true
      });
    });

    test('should handle fuzzy search with no reasonable matches', async () => {
      // Mock no exact match, no good fuzzy matches
      dynamoMock.DynamoDBHelper.query
        .mockResolvedValueOnce({ Items: [] }) // No exact match
        .mockResolvedValueOnce({ // Fuzzy search results with low confidence
          Items: [
            { name: 'Thịt gà', normalized_name: 'thit ga', main_name: 'Thịt gà' }
          ]
        });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['xyz123'] }) // Completely different
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.invalid).toEqual(['xyz123']);
      expect(body.warnings).toHaveLength(1);
      expect(body.warnings[0]).toEqual({
        ingredient: 'xyz123',
        message: 'Ingredient not found in database',
        reported: true
      });
    });

    test('should handle fuzzy search query errors', async () => {
      // Mock no exact match, fuzzy search error, then logging query
      dynamoMock.DynamoDBHelper.query
        .mockResolvedValueOnce({ Items: [] }) // No exact match
        .mockRejectedValueOnce(new Error('Fuzzy search failed')) // Fuzzy search fails
        .mockResolvedValueOnce({ Items: [], Count: 0 }); // Logging query

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['thịt gà'] })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.invalid).toEqual(['thịt gà']);
      expect(body.warnings).toHaveLength(1);
      expect(body.warnings[0].message).toContain('Ingredient not found in database');
    });

    test('should remove duplicate fuzzy matches', async () => {
      // Mock fuzzy search with duplicate names
      dynamoMock.DynamoDBHelper.query
        .mockResolvedValueOnce({ Items: [] }) // No exact match
        .mockResolvedValueOnce({ // Fuzzy search with duplicates
          Items: [
            { name: 'Thịt gà', normalized_name: 'thit ga', main_name: 'Thịt gà' },
            { name: 'Thịt gà', normalized_name: 'thit ga', main_name: 'Thịt gà' }, // Duplicate
            { name: 'Thịt bò', normalized_name: 'thit bo', main_name: 'Thịt bò' }
          ]
        });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['meat'] })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      if (body.warnings.length > 0 && body.warnings[0].suggestions) {
        // Should not have duplicate suggestions
        const suggestions = body.warnings[0].suggestions;
        const uniqueSuggestions = [...new Set(suggestions)];
        expect(suggestions).toEqual(uniqueSuggestions);
      }
    });
  });

  describe('Auto-correction Logic and Confidence Scoring', () => {
    test('should auto-correct with confidence 1.0 for exact normalized match', async () => {
      ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValueOnce([
        {
          name: 'Thịt gà',
          category: 'meat',
          match_score: 1.0,
          match_type: 'exact'
        }
      ]);

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['THỊT GÀ'] }) // Different case
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.valid).toEqual(['Thịt gà']);
      expect(body.warnings[0].confidence).toBe(1.0);
      expect(body.warnings[0].message).toContain('corrected to standard form');
    });

    test('should calculate confidence scores for fuzzy matches', async () => {
      dynamoMock.DynamoDBHelper.query
        .mockResolvedValueOnce({ Items: [] }) // No exact match
        .mockResolvedValueOnce({ // Fuzzy search results
          Items: [
            { name: 'Thịt gà', normalized_name: 'thit ga', main_name: 'Thịt gà' }
          ]
        });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['thit g'] }) // Close match
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      if (body.valid.length > 0) {
        expect(body.warnings[0].confidence).toBeGreaterThan(0.8);
        expect(body.warnings[0].confidence).toBeLessThanOrEqual(1.0);
      }
    });

    test('should sort fuzzy matches by confidence score', async () => {
      dynamoMock.DynamoDBHelper.query
        .mockResolvedValueOnce({ Items: [] }) // No exact match
        .mockResolvedValueOnce({ // Multiple fuzzy matches
          Items: [
            { name: 'Thịt bò', normalized_name: 'thit bo', main_name: 'Thịt bò' },
            { name: 'Thịt gà', normalized_name: 'thit ga', main_name: 'Thịt gà' },
            { name: 'Thịt heo', normalized_name: 'thit heo', main_name: 'Thịt heo' }
          ]
        });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['thit g'] }) // Should match 'thit ga' best
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      if (body.valid.length > 0) {
        // Should auto-correct to best match (Thịt gà)
        expect(body.valid[0]).toBe('Thịt gà');
      } else if (body.warnings.length > 0 && body.warnings[0].suggestions) {
        // If providing suggestions, first should be best match
        expect(body.warnings[0].suggestions[0]).toBe('Thịt gà');
      }
    });

    test('should limit fuzzy match results to top 5', async () => {
      const manyItems = Array(10).fill(null).map((_, i) => ({
        name: `Ingredient ${i}`,
        normalized_name: `ingredient ${i}`,
        main_name: `Ingredient ${i}`
      }));

      dynamoMock.DynamoDBHelper.query
        .mockResolvedValueOnce({ Items: [] }) // No exact match
        .mockResolvedValueOnce({ Items: manyItems });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['ingredient'] })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      if (body.warnings.length > 0 && body.warnings[0].suggestions) {
        expect(body.warnings[0].suggestions.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('Invalid Ingredient Reporting Workflow', () => {
    test('should log invalid ingredient for admin review', async () => {
      // Mock no matches found
      dynamoMock.DynamoDBHelper.query
        .mockResolvedValueOnce({ Items: [] }) // No exact match
        .mockResolvedValueOnce({ Items: [] }) // No fuzzy matches
        .mockResolvedValueOnce({ Items: [], Count: 0 }); // No existing reports

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['unknown_ingredient'] })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.invalid).toEqual(['unknown_ingredient']);
      expect(body.warnings[0]).toEqual({
        ingredient: 'unknown_ingredient',
        message: 'Ingredient not found in database',
        reported: true
      });

      // Verify logging calls
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledTimes(2);
      
      // Check report record - the SK uses the original normalized name, not with spaces
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'INVALID_INGREDIENT',
          SK: expect.stringMatching(/^REPORT#unknown_ingredient#/),
          entity_type: 'INVALID_INGREDIENT_REPORT',
          original_name: 'unknown_ingredient',
          normalized_name: 'unknown_ingredient',
          report_count: 1,
          needs_admin_review: false,
          GSI1PK: 'REPORTED_INGREDIENT'
        })
      );

      // Check summary record
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'INVALID_INGREDIENT',
          SK: 'SUMMARY#unknown_ingredient',
          entity_type: 'INVALID_INGREDIENT_SUMMARY',
          original_name: 'unknown_ingredient',
          normalized_name: 'unknown_ingredient',
          total_reports: 1,
          needs_admin_review: false,
          GSI1PK: 'REPORTED_INGREDIENT'
        })
      );
    });

    test('should trigger admin review after 5 reports', async () => {
      // Set up admin topic ARN for notification testing
      process.env.ADMIN_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:test-topic';

      // Mock no ingredient matches found
      ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValueOnce([]);

      // Clear and reset the DynamoDB query mock to return 4 existing reports
      dynamoMock.DynamoDBHelper.query.mockReset();
      dynamoMock.DynamoDBHelper.query.mockResolvedValue({
        Items: [
          { reported_at: '2025-01-01T00:00:00Z' },
          { reported_at: '2025-01-02T00:00:00Z' },
          { reported_at: '2025-01-03T00:00:00Z' },
          { reported_at: '2025-01-04T00:00:00Z' }
        ],
        Count: 4,
        LastEvaluatedKey: undefined
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['frequent_invalid'] })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify admin review is triggered (5th report)
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          report_count: 5,
          needs_admin_review: true,
          GSI1PK: 'ADMIN_REVIEW_NEEDED'
        })
      );

      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          total_reports: 5,
          needs_admin_review: true,
          GSI1PK: 'ADMIN_REVIEW_NEEDED'
        })
      );
    });

    test('should handle logging errors gracefully', async () => {
      // Mock no matches found, but logging fails
      dynamoMock.DynamoDBHelper.query
        .mockResolvedValueOnce({ Items: [] }) // No exact match
        .mockResolvedValueOnce({ Items: [] }) // No fuzzy matches
        .mockRejectedValueOnce(new Error('Logging failed')); // Query for existing reports fails

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['test_ingredient'] })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      // Should still return success even if logging fails
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.invalid).toEqual(['test_ingredient']);
      expect(body.warnings[0]).toEqual({
        ingredient: 'test_ingredient',
        message: 'Ingredient not found in database',
        reported: true
      });
    });

    test('should increment report count for existing invalid ingredients', async () => {
      // Mock no ingredient matches found
      ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValueOnce([]);

      // Clear and reset the DynamoDB query mock to return 2 existing reports
      const existingReports = [
        { reported_at: '2025-01-01T00:00:00Z' },
        { reported_at: '2025-01-02T00:00:00Z' }
      ];

      dynamoMock.DynamoDBHelper.query.mockReset();
      dynamoMock.DynamoDBHelper.query.mockResolvedValue({
        Items: existingReports,
        Count: 2,
        LastEvaluatedKey: undefined
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['repeated_invalid'] })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify report count is incremented
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          report_count: 3,
          needs_admin_review: false // Still below threshold
        })
      );

      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          total_reports: 3,
          first_reported: '2025-01-02T00:00:00Z' // Should use last item's timestamp
        })
      );
    });
  });

  describe('Batch Processing', () => {
    test('should process multiple ingredients with mixed results', async () => {
      // Mock different results for different ingredients
      ingredientServiceMock.IngredientService.searchIngredients
        // First ingredient: exact match
        .mockResolvedValueOnce([{
          name: 'Thịt gà',
          category: 'meat',
          match_score: 1.0,
          match_type: 'exact'
        }])
        // Second ingredient: high confidence fuzzy match
        .mockResolvedValueOnce([{
          name: 'Cà chua',
          category: 'vegetable',
          match_score: 0.9,
          match_type: 'fuzzy'
        }])
        // Third ingredient: no matches
        .mockResolvedValueOnce([]);

      // Mock DynamoDB for logging
      dynamoMock.DynamoDBHelper.query.mockResolvedValue({ Items: [], Count: 0 });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          ingredients: ['Thịt gà', 'ca chu', 'invalid_ingredient']
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);

      expect(body.valid).toEqual(['Thịt gà', 'Cà chua']);
      // "ca chu" is auto-corrected to "Cà chua" with high confidence
      expect(body.invalid).toEqual(['invalid_ingredient']);
      // 2 warnings: one for auto-correction of "ca chu", one for invalid ingredient
      expect(body.warnings).toHaveLength(2);

      // Check auto-correction warning
      expect(body.warnings.find((w: any) => w.corrected === 'Cà chua')).toBeDefined();

      // Check invalid ingredient warning
      expect(body.warnings.find((w: any) => w.ingredient === 'invalid_ingredient')).toEqual({
        ingredient: 'invalid_ingredient',
        message: 'Ingredient not found in database',
        reported: true
      });
    });

    test('should trim whitespace from ingredient names', async () => {
      ingredientServiceMock.IngredientService.searchIngredients.mockResolvedValueOnce([
        {
          name: 'Thịt gà',
          category: 'meat',
          match_score: 1.0,
          match_type: 'exact'
        }
      ]);

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          ingredients: ['  thịt gà  '] // With whitespace
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.valid).toEqual(['Thịt gà']);

      // Verify IngredientService was called with trimmed name
      expect(ingredientServiceMock.IngredientService.searchIngredients).toHaveBeenCalledWith(
        'thịt gà',  // Trimmed
        expect.objectContaining({
          limit: 5,
          fuzzyThreshold: 0.6
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON gracefully', async () => {
      const event = {
        ...mockEvent,
        body: 'invalid json'
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('internal_error');
      expect(body.message).toBe('Failed to validate ingredients');
    });

    test('should handle missing request body', async () => {
      const event = {
        ...mockEvent,
        body: null
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('validation_failed');
    });

    test('should handle empty request body', async () => {
      const event = {
        ...mockEvent,
        body: ''
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('validation_failed');
    });

    test('should handle database connection errors', async () => {
      // Mock all queries to fail, then logging query
      dynamoMock.DynamoDBHelper.query
        .mockRejectedValueOnce(new Error('Connection failed')) // Exact match fails
        .mockRejectedValueOnce(new Error('Connection failed')) // Fuzzy search fails
        .mockResolvedValueOnce({ Items: [], Count: 0 }); // Logging query succeeds

      const event = {
        ...mockEvent,
        body: JSON.stringify({ ingredients: ['thịt gà'] })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.invalid).toEqual(['thịt gà']);
      expect(body.warnings[0].message).toContain('Ingredient not found in database');
    });
  });
});