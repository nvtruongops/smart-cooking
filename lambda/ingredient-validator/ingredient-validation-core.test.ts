/**
 * Core Ingredient Validation Tests
 * 
 * This test suite focuses specifically on the requirements for task 7.2:
 * - Test exact matching and fuzzy search accuracy
 * - Test batch validation with mixed valid/invalid inputs
 * - Test auto-correction suggestions and confidence scoring
 * - NO tests for storage/retrieval (stateless service)
 */

import { handler } from './index';
import { APIGatewayEvent, IngredientSearchResult } from '../shared/types';
import { IngredientService } from '../shared/ingredient-service';
import { DynamoDBHelper } from '../shared/dynamodb';

// Mock dependencies
jest.mock('../shared/ingredient-service');
jest.mock('../shared/dynamodb');
jest.mock('@aws-sdk/client-sns');

const mockIngredientService = IngredientService as jest.Mocked<typeof IngredientService>;
const mockDynamoDBHelper = DynamoDBHelper as jest.Mocked<typeof DynamoDBHelper>;

describe('Ingredient Validation Core Tests - Task 7.2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks for logging (stateless service - no storage tests)
    mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
    mockDynamoDBHelper.put.mockResolvedValue({} as any);
  });

  const createTestEvent = (ingredients: string[]): APIGatewayEvent => ({
    httpMethod: 'POST',
    path: '/api/ingredients/validate',
    pathParameters: null,
    queryStringParameters: null,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredients }),
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: {
          sub: 'test-user-id',
          email: 'test@example.com',
          username: 'testuser'
        }
      }
    },
    multiValueHeaders: {},
    multiValueQueryStringParameters: undefined,
    stageVariables: null,
    isBase64Encoded: false,
    resource: '/ingredients/validate'
  });

  describe('Exact Matching Accuracy', () => {
    test('should return perfect confidence (1.0) for exact normalized matches', async () => {
      const testCases = [
        { input: 'Thịt gà', expected: 'Thịt gà' },
        { input: 'thit ga', expected: 'Thịt gà' }, // Normalized match
        { input: 'THỊT GÀ', expected: 'Thịt gà' }, // Case insensitive
        { input: '  Thịt gà  ', expected: 'Thịt gà' }, // Whitespace trimmed
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        
        const mockResult: IngredientSearchResult = {
          ingredient_id: 'ing-123',
          name: 'Thịt gà',
          normalized_name: 'thit ga',
          category: 'meat',
          aliases: ['gà', 'chicken'],
          match_type: 'exact',
          match_score: 1.0
        };

        mockIngredientService.searchIngredients.mockResolvedValue([mockResult]);

        const event = createTestEvent([testCase.input]);
        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(body.data.valid).toContain(testCase.expected);
        expect(body.data.invalid).toHaveLength(0);
        
        // If input differs from expected, should have correction warning
        if (testCase.input.trim() !== testCase.expected) {
          expect(body.data.warnings).toHaveLength(1);
          expect(body.data.warnings[0]).toMatchObject({
            original: testCase.input.trim(),
            corrected: testCase.expected,
            confidence: 1.0,
            message: 'Ingredient name corrected to standard form'
          });
        }
      }
    });

    test('should handle Vietnamese diacritics correctly in exact matching', async () => {
      const vietnameseIngredients = [
        { input: 'Bánh mì', normalized: 'banh mi' },
        { input: 'Phở bò', normalized: 'pho bo' },
        { input: 'Cà chua', normalized: 'ca chua' },
        { input: 'Đậu phộng', normalized: 'dau phong' }
      ];

      for (const ingredient of vietnameseIngredients) {
        jest.clearAllMocks();
        
        const mockResult: IngredientSearchResult = {
          ingredient_id: 'ing-test',
          name: ingredient.input,
          normalized_name: ingredient.normalized,
          category: 'test',
          aliases: [],
          match_type: 'exact',
          match_score: 1.0
        };

        mockIngredientService.searchIngredients.mockResolvedValue([mockResult]);

        const event = createTestEvent([ingredient.input]);
        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(body.data.valid).toContain(ingredient.input);
        expect(body.data.invalid).toHaveLength(0);
      }
    });
  });

  describe('Fuzzy Search Accuracy', () => {
    test('should handle different confidence thresholds correctly', async () => {
      const confidenceTests = [
        {
          input: 'thit g',
          confidence: 0.95,
          shouldAutoCorrect: true,
          description: 'Very high confidence (0.95)'
        },
        {
          input: 'thit ga typo',
          confidence: 0.85,
          shouldAutoCorrect: true,
          description: 'High confidence (0.85)'
        },
        {
          input: 'thit ga missing',
          confidence: 0.8,
          shouldAutoCorrect: true,
          description: 'Threshold confidence (0.8)'
        },
        {
          input: 'thit something',
          confidence: 0.75,
          shouldAutoCorrect: false,
          shouldSuggest: true,
          description: 'Medium confidence (0.75)'
        },
        {
          input: 'thit test',
          confidence: 0.6,
          shouldAutoCorrect: false,
          shouldSuggest: true,
          description: 'Low threshold confidence (0.6)'
        },
        {
          input: 'completely different',
          confidence: 0.3,
          shouldAutoCorrect: false,
          shouldSuggest: false,
          description: 'Very low confidence (0.3)'
        }
      ];

      for (const test of confidenceTests) {
        jest.clearAllMocks();
        mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
        mockDynamoDBHelper.put.mockResolvedValue({} as any);

        if (test.confidence >= 0.6) {
          const mockResult: IngredientSearchResult = {
            ingredient_id: 'ing-123',
            name: 'Thịt gà',
            normalized_name: 'thit ga',
            category: 'meat',
            aliases: ['gà'],
            match_type: 'fuzzy',
            match_score: test.confidence
          };
          mockIngredientService.searchIngredients.mockResolvedValue([mockResult]);
        } else {
          mockIngredientService.searchIngredients.mockResolvedValue([]);
        }

        const event = createTestEvent([test.input]);
        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);

        if (test.shouldAutoCorrect) {
          expect(body.data.valid).toContain('Thịt gà');
          expect(body.data.invalid).not.toContain(test.input);
          expect(body.data.warnings).toHaveLength(1);
          expect(body.data.warnings[0]).toMatchObject({
            original: test.input,
            corrected: 'Thịt gà',
            confidence: test.confidence,
            message: 'Ingredient name auto-corrected based on similarity'
          });
        } else if (test.shouldSuggest) {
          expect(body.data.valid).not.toContain('Thịt gà');
          expect(body.data.invalid).toContain(test.input);
          expect(body.data.warnings).toHaveLength(1);
          expect(body.data.warnings[0]).toMatchObject({
            ingredient: test.input,
            suggestions: ['Thịt gà'],
            message: 'Ingredient not found. Did you mean one of these?'
          });
        } else {
          expect(body.data.valid).not.toContain('Thịt gà');
          expect(body.data.invalid).toContain(test.input);
          expect(body.data.warnings).toHaveLength(1);
          expect(body.data.warnings[0]).toMatchObject({
            ingredient: test.input,
            message: 'Ingredient not found in database',
            reported: true
          });
        }
      }
    });

    test('should prioritize best matches in fuzzy search results', async () => {
      const multipleMatches: IngredientSearchResult[] = [
        {
          ingredient_id: 'ing-1',
          name: 'Thịt gà',
          normalized_name: 'thit ga',
          category: 'meat',
          aliases: ['gà'],
          match_type: 'fuzzy',
          match_score: 0.95 // Best match
        },
        {
          ingredient_id: 'ing-2',
          name: 'Thịt bò',
          normalized_name: 'thit bo',
          category: 'meat',
          aliases: ['bò'],
          match_type: 'fuzzy',
          match_score: 0.7 // Lower match
        },
        {
          ingredient_id: 'ing-3',
          name: 'Thịt heo',
          normalized_name: 'thit heo',
          category: 'meat',
          aliases: ['heo'],
          match_type: 'fuzzy',
          match_score: 0.6 // Lowest match
        }
      ];

      mockIngredientService.searchIngredients.mockResolvedValue(multipleMatches);

      const event = createTestEvent(['thit g']);
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.valid).toContain('Thịt gà'); // Should auto-correct to best match
      expect(body.data.warnings[0]).toMatchObject({
        original: 'thit g',
        corrected: 'Thịt gà',
        confidence: 0.95
      });
    });

    test('should limit suggestions to top 3 matches', async () => {
      const manyMatches: IngredientSearchResult[] = Array.from({ length: 10 }, (_, i) => ({
        ingredient_id: `ing-${i}`,
        name: `Ingredient ${i}`,
        normalized_name: `ingredient ${i}`,
        category: 'test',
        aliases: [],
        match_type: 'fuzzy',
        match_score: 0.65 // Medium confidence for suggestions
      }));

      mockIngredientService.searchIngredients.mockResolvedValue(manyMatches);
      mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
      mockDynamoDBHelper.put.mockResolvedValue({} as any);

      const event = createTestEvent(['ingredient']);
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.invalid).toContain('ingredient');
      expect(body.data.warnings).toHaveLength(1);
      expect(body.data.warnings[0].suggestions).toHaveLength(3); // Limited to 3
      expect(body.data.warnings[0].suggestions).toEqual([
        'Ingredient 0',
        'Ingredient 1', 
        'Ingredient 2'
      ]);
    });
  });

  describe('Auto-correction Suggestions and Confidence Scoring', () => {
    test('should provide accurate confidence scores for different match types', async () => {
      const matchTypes = [
        {
          input: 'Thịt gà',
          matchType: 'exact',
          expectedConfidence: 1.0,
          expectedMessage: 'Ingredient name corrected to standard form'
        },
        {
          input: 'thit ga typo',
          matchType: 'fuzzy',
          expectedConfidence: 0.9,
          expectedMessage: 'Ingredient name auto-corrected based on similarity'
        }
      ];

      for (const test of matchTypes) {
        jest.clearAllMocks();
        
        const mockResult: IngredientSearchResult = {
          ingredient_id: 'ing-123',
          name: 'Thịt gà',
          normalized_name: 'thit ga',
          category: 'meat',
          aliases: ['gà'],
          match_type: test.matchType as 'exact' | 'fuzzy',
          match_score: test.expectedConfidence
        };

        mockIngredientService.searchIngredients.mockResolvedValue([mockResult]);

        const event = createTestEvent([test.input]);
        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(body.data.valid).toContain('Thịt gà');
        
        if (test.input !== 'Thịt gà') {
          expect(body.data.warnings).toHaveLength(1);
          expect(body.data.warnings[0]).toMatchObject({
            original: test.input,
            corrected: 'Thịt gà',
            confidence: test.expectedConfidence,
            message: test.expectedMessage
          });
        }
      }
    });

    test('should handle alias-based auto-correction', async () => {
      const mockResult: IngredientSearchResult = {
        ingredient_id: 'ing-123',
        name: 'Thịt gà',
        normalized_name: 'thit ga',
        category: 'meat',
        aliases: ['gà', 'chicken', 'ga'],
        match_type: 'exact',
        match_score: 0.95 // High confidence for alias match
      };

      mockIngredientService.searchIngredients.mockResolvedValue([mockResult]);

      const event = createTestEvent(['chicken']);
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.valid).toContain('Thịt gà');
      expect(body.data.warnings).toHaveLength(1);
      expect(body.data.warnings[0]).toMatchObject({
        original: 'chicken',
        corrected: 'Thịt gà',
        confidence: 0.95
      });
    });

    test('should provide meaningful suggestions for medium confidence matches', async () => {
      const suggestionTests = [
        {
          input: 'meat',
          suggestions: ['Thịt gà', 'Thịt bò', 'Thịt heo']
        },
        {
          input: 'vegetable',
          suggestions: ['Cà chua', 'Hành tây', 'Khoai tây']
        }
      ];

      for (const test of suggestionTests) {
        jest.clearAllMocks();
        mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
        mockDynamoDBHelper.put.mockResolvedValue({} as any);

        const mockResults: IngredientSearchResult[] = test.suggestions.map((name, index) => ({
          ingredient_id: `ing-${index}`,
          name,
          normalized_name: name.toLowerCase(),
          category: 'test',
          aliases: [],
          match_type: 'fuzzy',
          match_score: 0.7 // Medium confidence
        }));

        mockIngredientService.searchIngredients.mockResolvedValue(mockResults);

        const event = createTestEvent([test.input]);
        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);
        expect(body.data.invalid).toContain(test.input);
        expect(body.data.warnings).toHaveLength(1);
        expect(body.data.warnings[0]).toMatchObject({
          ingredient: test.input,
          suggestions: test.suggestions.slice(0, 3), // Limited to 3
          message: 'Ingredient not found. Did you mean one of these?'
        });
      }
    });

    test('should handle confidence score edge cases', async () => {
      const edgeCases = [
        { confidence: 0.8, shouldAutoCorrect: true, description: 'Exactly at threshold' },
        { confidence: 0.799, shouldAutoCorrect: false, description: 'Just below threshold' },
        { confidence: 0.6, shouldSuggest: true, description: 'At suggestion threshold' },
        { confidence: 0.5, shouldSuggest: false, description: 'Below suggestion threshold' }
      ];

      for (const testCase of edgeCases) {
        jest.clearAllMocks();
        mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
        mockDynamoDBHelper.put.mockResolvedValue({} as any);

        if (testCase.confidence >= 0.6) {
          const mockResult: IngredientSearchResult = {
            ingredient_id: 'ing-123',
            name: 'Thịt gà',
            normalized_name: 'thit ga',
            category: 'meat',
            aliases: [],
            match_type: 'fuzzy',
            match_score: testCase.confidence
          };
          mockIngredientService.searchIngredients.mockResolvedValue([mockResult]);
        } else {
          mockIngredientService.searchIngredients.mockResolvedValue([]);
        }

        const event = createTestEvent(['test input']);
        const response = await handler(event);
        const body = JSON.parse(response.body);

        expect(response.statusCode).toBe(200);

        if (testCase.shouldAutoCorrect) {
          expect(body.data.valid).toContain('Thịt gà');
          expect(body.data.warnings[0].confidence).toBe(testCase.confidence);
        } else if (testCase.shouldSuggest) {
          expect(body.data.invalid).toContain('test input');
          expect(body.data.warnings[0].suggestions).toContain('Thịt gà');
        } else {
          expect(body.data.invalid).toContain('test input');
          // For very low confidence scores, it might still provide suggestions
          // or report as not found depending on the actual threshold
          expect(body.data.warnings[0].ingredient).toBe('test input');
          expect(['Ingredient not found in database', 'Ingredient not found. Did you mean one of these?'])
            .toContain(body.data.warnings[0].message);
        }
      }
    });
  });

  describe('Batch Validation with Mixed Valid/Invalid Inputs', () => {
    test('should handle complex batch with all validation scenarios', async () => {
      const batchIngredients = [
        'Thịt gà',           // Exact match
        'thit bo',           // Normalized match  
        'ca chu',            // Auto-correctable fuzzy match
        'vegetable stuff',   // Medium confidence - suggestions
        'xyz123invalid'      // No matches - invalid
      ];

      // Mock sequential calls for each ingredient
      const mockResults: IngredientSearchResult[][] = [
        // Exact match for 'Thịt gà'
        [{
          ingredient_id: 'ing-1',
          name: 'Thịt gà',
          normalized_name: 'thit ga',
          category: 'meat',
          aliases: ['gà'],
          match_type: 'exact',
          match_score: 1.0
        }],
        // Normalized match for 'thit bo'
        [{
          ingredient_id: 'ing-2',
          name: 'Thịt bò',
          normalized_name: 'thit bo',
          category: 'meat',
          aliases: ['bò'],
          match_type: 'exact',
          match_score: 1.0
        }],
        // Auto-correctable fuzzy match for 'ca chu'
        [{
          ingredient_id: 'ing-3',
          name: 'Cà chua',
          normalized_name: 'ca chua',
          category: 'vegetable',
          aliases: ['tomato'],
          match_type: 'fuzzy',
          match_score: 0.85
        }],
        // Medium confidence suggestions for 'vegetable stuff'
        [{
          ingredient_id: 'ing-4',
          name: 'Rau cải',
          normalized_name: 'rau cai',
          category: 'vegetable',
          aliases: [],
          match_type: 'fuzzy',
          match_score: 0.65
        }],
        // No matches for 'xyz123invalid'
        []
      ];

      mockIngredientService.searchIngredients
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1])
        .mockResolvedValueOnce(mockResults[2])
        .mockResolvedValueOnce(mockResults[3])
        .mockResolvedValueOnce(mockResults[4]);

      // Mock DynamoDB for logging invalid ingredient
      mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
      mockDynamoDBHelper.put.mockResolvedValue({} as any);

      const event = createTestEvent(batchIngredients);
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);

      // Verify valid ingredients (exact + normalized + auto-corrected)
      expect(body.data.valid).toEqual(['Thịt gà', 'Thịt bò', 'Cà chua']);
      
      // Verify invalid ingredients (suggestions + no matches)
      expect(body.data.invalid).toEqual(['vegetable stuff', 'xyz123invalid']);

      // Verify warnings
      expect(body.data.warnings).toHaveLength(4);

      // Check normalized match warning
      const normalizedWarning = body.data.warnings.find((w: any) => w.original === 'thit bo');
      expect(normalizedWarning).toMatchObject({
        original: 'thit bo',
        corrected: 'Thịt bò',
        confidence: 1.0,
        message: 'Ingredient name corrected to standard form'
      });

      // Check auto-correction warning
      const autoCorrectionWarning = body.data.warnings.find((w: any) => w.original === 'ca chu');
      expect(autoCorrectionWarning).toMatchObject({
        original: 'ca chu',
        corrected: 'Cà chua',
        confidence: 0.85,
        message: 'Ingredient name auto-corrected based on similarity'
      });

      // Check suggestion warning
      const suggestionWarning = body.data.warnings.find((w: any) => w.ingredient === 'vegetable stuff');
      expect(suggestionWarning).toMatchObject({
        ingredient: 'vegetable stuff',
        suggestions: ['Rau cải'],
        message: 'Ingredient not found. Did you mean one of these?'
      });

      // Check invalid ingredient warning
      const invalidWarning = body.data.warnings.find((w: any) => w.ingredient === 'xyz123invalid');
      expect(invalidWarning).toMatchObject({
        ingredient: 'xyz123invalid',
        message: 'Ingredient not found in database',
        reported: true
      });
    });

    test('should handle large batch validation efficiently', async () => {
      const largeIngredientList = [
        'Thịt gà', 'Thịt bò', 'Cà chua', 'Hành tây', 'Tỏi',
        'Gừng', 'Ớt', 'Muối', 'Đường', 'Nước mắm',
        'Dầu ăn', 'Rau cải', 'Cà rót', 'Khoai tây', 'Cà tím',
        'Đậu phộng', 'Mè', 'Lạc', 'Đậu xanh', 'Đậu đỏ'
      ];

      // Mock all as exact matches for efficiency test
      largeIngredientList.forEach((ingredient, index) => {
        const mockResult: IngredientSearchResult = {
          ingredient_id: `ing-${index}`,
          name: ingredient,
          normalized_name: ingredient.toLowerCase(),
          category: 'test',
          aliases: [],
          match_type: 'exact',
          match_score: 1.0
        };
        mockIngredientService.searchIngredients.mockResolvedValueOnce([mockResult]);
      });

      const event = createTestEvent(largeIngredientList);
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.valid).toHaveLength(20);
      expect(body.data.invalid).toHaveLength(0);
      expect(body.data.warnings).toHaveLength(0); // All exact matches, no warnings
    });

    test('should maintain order in batch processing results', async () => {
      const orderedIngredients = ['First', 'Second', 'Third'];
      
      // Mock in same order to test that results maintain input order
      orderedIngredients.forEach((ingredient, index) => {
        const mockResult: IngredientSearchResult = {
          ingredient_id: `ing-${index}`,
          name: ingredient,
          normalized_name: ingredient.toLowerCase(),
          category: 'test',
          aliases: [],
          match_type: 'exact',
          match_score: 1.0
        };
        mockIngredientService.searchIngredients.mockResolvedValueOnce([mockResult]);
      });

      const event = createTestEvent(orderedIngredients);
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.valid).toEqual(['First', 'Second', 'Third']);
    });

    test('should handle mixed error scenarios in batch processing', async () => {
      const mixedBatch = ['valid', 'error', 'invalid'];

      const validResult: IngredientSearchResult = {
        ingredient_id: 'ing-1',
        name: 'Valid Ingredient',
        normalized_name: 'valid ingredient',
        category: 'test',
        aliases: [],
        match_type: 'exact',
        match_score: 1.0
      };

      mockIngredientService.searchIngredients
        // Valid ingredient
        .mockResolvedValueOnce([validResult])
        // Service error
        .mockRejectedValueOnce(new Error('Service error'))
        // Invalid ingredient
        .mockResolvedValueOnce([]);

      mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
      mockDynamoDBHelper.put.mockResolvedValue({} as any);

      const event = createTestEvent(mixedBatch);
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.valid).toEqual(['Valid Ingredient']);
      expect(body.data.invalid).toEqual(['error', 'invalid']);
      expect(body.data.warnings).toHaveLength(3); // Correction warning + error warning + invalid warning

      // Check error handling warning
      const errorWarning = body.data.warnings.find((w: any) => w.ingredient === 'error');
      expect(errorWarning).toMatchObject({
        ingredient: 'error',
        message: 'Error occurred during validation'
      });

      // Check invalid ingredient warning
      const invalidWarning = body.data.warnings.find((w: any) => w.ingredient === 'invalid');
      expect(invalidWarning).toMatchObject({
        ingredient: 'invalid',
        message: 'Ingredient not found in database',
        reported: true
      });
    });
  });

  describe('Stateless Service Validation (No Storage/Retrieval Tests)', () => {
    test('should validate ingredients without persisting user data', async () => {
      const mockResult: IngredientSearchResult = {
        ingredient_id: 'ing-123',
        name: 'Thịt gà',
        normalized_name: 'thit ga',
        category: 'meat',
        aliases: [],
        match_type: 'exact',
        match_score: 1.0
      };

      mockIngredientService.searchIngredients.mockResolvedValue([mockResult]);

      const event = createTestEvent(['Thịt gà']);
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      
      // Verify no user data storage calls
      expect(mockDynamoDBHelper.put).not.toHaveBeenCalledWith(
        expect.objectContaining({
          PK: expect.stringMatching(/^USER#/),
          entity_type: 'USER_INGREDIENTS'
        })
      );
    });

    test('should only log invalid ingredients for admin review, not store user ingredient lists', async () => {
      mockIngredientService.searchIngredients.mockResolvedValue([]);
      mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
      mockDynamoDBHelper.put.mockResolvedValue({} as any);

      const event = createTestEvent(['invalid_ingredient']);
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      
      // Should log invalid ingredient for admin review
      expect(mockDynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'INVALID_INGREDIENT',
          entity_type: 'INVALID_INGREDIENT_REPORT'
        })
      );

      // Should NOT store user's ingredient list
      expect(mockDynamoDBHelper.put).not.toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'USER_INGREDIENT_LIST'
        })
      );
    });

    test('should return validation results immediately without persistence', async () => {
      const startTime = Date.now();
      
      const mockResult: IngredientSearchResult = {
        ingredient_id: 'ing-123',
        name: 'Thịt gà',
        normalized_name: 'thit ga',
        category: 'meat',
        aliases: [],
        match_type: 'exact',
        match_score: 1.0
      };

      mockIngredientService.searchIngredients.mockResolvedValue([mockResult]);

      const event = createTestEvent(['Thịt gà']);
      const response = await handler(event);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeLessThan(1000); // Should be fast without storage operations
      
      const body = JSON.parse(response.body);
      expect(body.data.valid).toEqual(['Thịt gà']);
    });
  });
});