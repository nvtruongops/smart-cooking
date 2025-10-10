import { handler } from './index';
import { APIGatewayEvent } from '../shared/types';
import { DynamoDBHelper } from '../shared/dynamodb';
import { IngredientService } from '../shared/ingredient-service';
import { SNSClient } from '@aws-sdk/client-sns';

// Mock dependencies
jest.mock('../shared/dynamodb');
jest.mock('../shared/ingredient-service');
jest.mock('@aws-sdk/client-sns');

const mockDynamoDBHelper = DynamoDBHelper as jest.Mocked<typeof DynamoDBHelper>;
const mockIngredientService = IngredientService as jest.Mocked<typeof IngredientService>;
const mockSNSClient = SNSClient as jest.MockedClass<typeof SNSClient>;

describe('Ingredient Validator Lambda - Unit Tests', () => {
  let mockSNSInstance: jest.Mocked<SNSClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup SNS mock
    mockSNSInstance = {
      send: jest.fn()
    } as any;
    (mockSNSInstance.send as jest.Mock).mockResolvedValue({});
    (mockSNSClient as any).mockImplementation(() => mockSNSInstance);
    
    // Set environment variables
    process.env.ADMIN_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:admin-alerts';
    process.env.AWS_REGION = 'us-east-1';
    
    // Default mocks
    mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
    mockDynamoDBHelper.put.mockResolvedValue({} as any);
  });

  afterEach(() => {
    delete process.env.ADMIN_TOPIC_ARN;
    delete process.env.AWS_REGION;
  });

  const createMockEvent = (body: any): APIGatewayEvent => ({
    httpMethod: 'POST',
    path: '/api/ingredients/validate',
    pathParameters: null,
    queryStringParameters: null,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
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

  describe('Exact Matching and Fuzzy Search Accuracy', () => {
    test('should handle exact matches with perfect confidence (1.0)', async () => {
      const mockSearchResult = [{
        ingredient_id: 'ing-123',
        name: 'Thịt gà',
        normalized_name: 'thit ga',
        category: 'meat',
        aliases: ['gà', 'chicken'],
        match_type: 'exact' as const,
        match_score: 1.0
      }];

      mockIngredientService.searchIngredients.mockResolvedValue(mockSearchResult);
      
      const event = createMockEvent({ ingredients: ['Thịt gà'] });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.valid).toContain('Thịt gà');
      expect(body.data.invalid).toHaveLength(0);
      expect(body.data.warnings).toHaveLength(0);
    });

    test('should handle fuzzy matches with various confidence levels', async () => {
      const testCases = [
        { input: 'thit g', score: 0.85, shouldAutoCorrect: true },
        { input: 'thit', score: 0.7, shouldAutoCorrect: false, shouldSuggest: true },
        { input: 'th', score: 0.5, shouldAutoCorrect: false, shouldSuggest: false }
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
        mockDynamoDBHelper.put.mockResolvedValue({} as any);

        const mockSearchResult = [{
          ingredient_id: 'ing-123',
          name: 'Thịt gà',
          normalized_name: 'thit ga',
          category: 'meat',
          aliases: ['gà'],
          match_type: 'fuzzy' as const,
          match_score: testCase.score
        }];

        mockIngredientService.searchIngredients.mockResolvedValue(mockSearchResult);
        
        const event = createMockEvent({ ingredients: [testCase.input] });
        const response = await handler(event);
        const body = JSON.parse(response.body);

        if (testCase.shouldAutoCorrect) {
          expect(body.data.valid).toContain('Thịt gà');
          expect(body.data.warnings[0]).toMatchObject({
            original: testCase.input,
            corrected: 'Thịt gà',
            confidence: testCase.score
          });
        } else if (testCase.shouldSuggest) {
          expect(body.data.invalid).toContain(testCase.input);
          expect(body.data.warnings[0]).toMatchObject({
            ingredient: testCase.input,
            suggestions: ['Thịt gà']
          });
        } else {
          expect(body.data.invalid).toContain(testCase.input);
          expect(body.data.warnings[0]).toMatchObject({
            ingredient: testCase.input,
            message: 'Ingredient not found in database'
          });
        }
      }
    });
  });

  describe('Auto-correction Logic and Confidence Scoring Thresholds', () => {
    test('should auto-correct at exactly 0.8 confidence threshold', async () => {
      const mockSearchResult = [{
        ingredient_id: 'ing-123',
        name: 'Thịt gà',
        normalized_name: 'thit ga',
        category: 'meat',
        aliases: ['gà'],
        match_type: 'fuzzy' as const,
        match_score: 0.8
      }];

      mockIngredientService.searchIngredients.mockResolvedValue(mockSearchResult);
      
      const event = createMockEvent({ ingredients: ['test ingredient'] });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.valid).toContain('Thịt gà');
      expect(body.data.warnings[0]).toMatchObject({
        original: 'test ingredient',
        corrected: 'Thịt gà',
        confidence: 0.8
      });
    });

    test('should provide suggestions at exactly 0.6 confidence threshold', async () => {
      const mockSearchResult = [{
        ingredient_id: 'ing-123',
        name: 'Thịt gà',
        normalized_name: 'thit ga',
        category: 'meat',
        aliases: ['gà'],
        match_type: 'fuzzy' as const,
        match_score: 0.6
      }];

      mockIngredientService.searchIngredients.mockResolvedValue(mockSearchResult);
      mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
      mockDynamoDBHelper.put.mockResolvedValue({} as any);
      
      const event = createMockEvent({ ingredients: ['test ingredient'] });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.invalid).toContain('test ingredient');
      expect(body.data.warnings[0]).toMatchObject({
        ingredient: 'test ingredient',
        suggestions: ['Thịt gà'],
        message: 'Ingredient not found. Did you mean one of these?'
      });
    });
  });

  describe('Invalid Ingredient Reporting and Batch Validation Workflows', () => {
    test('should report invalid ingredients for admin review', async () => {
      mockIngredientService.searchIngredients.mockResolvedValue([]);
      mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
      mockDynamoDBHelper.put.mockResolvedValue({} as any);
      
      const event = createMockEvent({ ingredients: ['unknown ingredient'] });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.invalid).toContain('unknown ingredient');
      expect(body.data.warnings[0]).toMatchObject({
        ingredient: 'unknown ingredient',
        message: 'Ingredient not found in database',
        reported: true
      });

      // Verify DynamoDB logging calls
      expect(mockDynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'INVALID_INGREDIENT',
          entity_type: 'INVALID_INGREDIENT_REPORT',
          original_name: 'unknown ingredient',
          report_count: 1,
          needs_admin_review: false
        })
      );
    });

    test('should handle batch validation with mixed results', async () => {
      const mockSearchResults = [
        // Valid ingredient
        [{
          ingredient_id: 'ing-123',
          name: 'Thịt gà',
          normalized_name: 'thit ga',
          category: 'meat',
          aliases: ['gà'],
          match_type: 'exact' as const,
          match_score: 1.0
        }],
        // Auto-correctable ingredient
        [{
          ingredient_id: 'ing-456',
          name: 'Cà chua',
          normalized_name: 'ca chua',
          category: 'vegetable',
          aliases: ['tomato'],
          match_type: 'fuzzy' as const,
          match_score: 0.85
        }],
        // Invalid ingredient
        []
      ];

      mockIngredientService.searchIngredients
        .mockResolvedValueOnce(mockSearchResults[0])
        .mockResolvedValueOnce(mockSearchResults[1])
        .mockResolvedValueOnce(mockSearchResults[2]);
      
      mockDynamoDBHelper.query.mockResolvedValue({ Count: 0, Items: [], LastEvaluatedKey: undefined });
      mockDynamoDBHelper.put.mockResolvedValue({} as any);
      
      const event = createMockEvent({ 
        ingredients: ['Thịt gà', 'ca chu', 'invalid ingredient'] 
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.data.valid).toEqual(['Thịt gà', 'Cà chua']);
      expect(body.data.invalid).toEqual(['invalid ingredient']);
      expect(body.data.warnings).toHaveLength(2);
      
      // Check auto-correction warning
      expect(body.data.warnings[0]).toMatchObject({
        original: 'ca chu',
        corrected: 'Cà chua',
        confidence: 0.85
      });
      
      // Check invalid ingredient warning
      expect(body.data.warnings[1]).toMatchObject({
        ingredient: 'invalid ingredient',
        message: 'Ingredient not found in database',
        reported: true
      });
    });
  });

  describe('Input Validation and Error Handling', () => {
    test('should validate required ingredients field', async () => {
      const event = createMockEvent({});
      const response = await handler(event);

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Missing required field');
    });

    test('should reject empty ingredients array', async () => {
      const event = createMockEvent({ ingredients: [] });
      const response = await handler(event);

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('ingredients array cannot be empty');
    });

    test('should handle IngredientService errors gracefully', async () => {
      mockIngredientService.searchIngredients.mockRejectedValue(new Error('Database connection failed'));
      
      const event = createMockEvent({ ingredients: ['thịt gà'] });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.data.valid).toHaveLength(0);
      expect(body.data.invalid).toContain('thịt gà');
      expect(body.data.warnings[0]).toMatchObject({
        ingredient: 'thịt gà',
        message: 'Error occurred during validation'
      });
    });
  });
});
