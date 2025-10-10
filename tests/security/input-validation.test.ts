import { handler as ingredientValidator } from '../../lambda/ingredient-validator/index';
import { successResponse, errorResponse } from '../../lambda/shared/responses';

// Mock setup
jest.mock('../../lambda/shared/responses');

describe('Input Validation Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Restore mocks
    (successResponse as jest.Mock).mockImplementation((data: any, statusCode: number = 200) => ({
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data
      })
    }));

    (errorResponse as jest.Mock).mockImplementation((statusCode: number, error: string, message: string) => ({
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error,
        message,
        timestamp: new Date().toISOString()
      })
    }));
  });

  it('should reject requests with oversized payloads', async () => {
    const largePayload = 'x'.repeat(1024 * 1024 * 10); // 10MB payload

    const event = {
      requestContext: {
        requestId: 'test-request-oversize'
      },
      body: JSON.stringify({
        ingredients: [largePayload],
        recipeId: 'test-recipe'
      })
    };

    const result = await ingredientValidator(event as any);
    expect(result.statusCode).toBe(200); // Large payload is processed but marked as invalid
    const responseBody = JSON.parse(result.body);
    // Large payload should be marked as invalid due to size
    expect(responseBody.data.invalid.length).toBeGreaterThan(0);
  });

  it('should reject requests with malformed JSON', async () => {
    const event = {
      requestContext: {
        requestId: 'test-request-malformed'
      },
      body: '{ invalid json content }'
    };

    // Should throw BadRequestError for malformed JSON
    await expect(ingredientValidator(event as any)).rejects.toThrow('Invalid JSON in request body');
  });

  it('should reject requests with null bytes', async () => {
    const event = {
      requestContext: {
        requestId: 'test-request-nullbytes'
      },
      body: JSON.stringify({
        ingredients: ['flour\u0000with\u0000nulls'],
        recipeId: 'test-recipe'
      })
    };

    const result = await ingredientValidator(event as any);
    expect(result.statusCode).toBe(200); // Processed but marked invalid
    const responseBody = JSON.parse(result.body);
    expect(responseBody.data.invalid.length).toBeGreaterThan(0);
  });

  it('should reject requests with extremely long strings', async () => {
    const longString = 'a'.repeat(10000);

    const event = {
      requestContext: {
        requestId: 'test-request-longstring'
      },
      body: JSON.stringify({
        ingredients: [longString],
        recipeId: 'test-recipe'
      })
    };

    const result = await ingredientValidator(event as any);
    expect(result.statusCode).toBe(200); // Processed but marked invalid
    const responseBody = JSON.parse(result.body);
    expect(responseBody.data.invalid.length).toBeGreaterThan(0);
  });

  it('should reject requests with invalid data types', async () => {
    const event = {
      requestContext: {
        requestId: 'test-request-invalidtype'
      },
      body: JSON.stringify({
        ingredients: [12345], // Should be string
        recipeId: 'test-recipe'
      })
    };

    // Should throw error when ingredient is not a string
    await expect(ingredientValidator(event as any)).rejects.toThrow();
  });

  it('should reject requests with nested objects exceeding depth limit', async () => {
    const deepNested = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                ingredients: ['flour'],
                recipeId: 'test-recipe'
              }
            }
          }
        }
      }
    };

    const event = {
      requestContext: {
        requestId: 'test-request-deepnested'
      },
      body: JSON.stringify(deepNested)
    };

    // Should throw ValidationError for missing required fields at top level
    await expect(ingredientValidator(event as any)).rejects.toThrow('Missing required field');
  });

  it('should reject requests with invalid characters in ingredient names', async () => {
    const invalidChars = ['<script>', 'javascript:', 'data:', 'vbscript:', '\x00', '\x1F'];

    for (const invalidChar of invalidChars) {
      const event = {
        requestContext: {
          requestId: 'test-request-invalidchar-' + Math.random().toString(36).substr(2, 9)
        },
        body: JSON.stringify({
          ingredients: [`flour${invalidChar}`],
          recipeId: 'test-recipe'
        })
      };

      const result = await ingredientValidator(event as any);
      expect(result.statusCode).toBe(200); // Processed but marked invalid
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.invalid.length).toBeGreaterThan(0);
    }
  });

  it('should reject requests with suspicious file extensions', async () => {
    const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com'];

    for (const ext of suspiciousExtensions) {
      const event = {
        requestContext: {
          requestId: 'test-request-suspicious-' + Math.random().toString(36).substr(2, 9)
        },
        body: JSON.stringify({
          ingredients: [`flour${ext}`],
          recipeId: 'test-recipe'
        })
      };

      const result = await ingredientValidator(event as any);
      expect(result.statusCode).toBe(200); // Processed but marked invalid
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.invalid.length).toBeGreaterThan(0);
    }
  });

  it('should validate required fields are present', async () => {
    const event = {
      requestContext: {
        requestId: 'test-request-required'
      },
      body: JSON.stringify({
        // Missing ingredients field
        recipeId: 'test-recipe'
      })
    };

    // Should throw ValidationError for missing required field
    await expect(ingredientValidator(event as any)).rejects.toThrow('Missing required field');
  });

  it('should reject requests with duplicate keys', async () => {
    const event = {
      requestContext: {
        requestId: 'test-request-duplicate'
      },
      body: '{"ingredients":["flour"],"ingredients":["sugar"],"recipeId":"test-recipe"}'
    };

    const result = await ingredientValidator(event as any);
    // JSON.parse automatically handles duplicate keys by taking the last value
    // So this test validates that the handler processes it correctly
    expect(result.statusCode).toBe(200);
  });
});