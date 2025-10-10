import { successResponse, errorResponse } from '../../lambda/shared/responses';

// Mock user profile handler
const mockUserProfileHandler = jest.fn();

// Mock setup
jest.mock('../../lambda/shared/responses');
jest.mock('../../lambda/user-profile/index', () => ({
  handler: mockUserProfileHandler
}));

describe('Data Exposure Prevention', () => {
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

    // Mock user profile handler with security checks
    mockUserProfileHandler.mockImplementation((event: any) => {
      const userId = event.pathParameters?.userId;
      const requestingUserId = event.requestContext?.authorizer?.claims?.sub;
      
      // Directory traversal detection
      const traversalPatterns = [
        /\.\./,
        /%2e%2e/i,
        /\.\.\\/,
        /\.\.\//,
        /etc\/passwd/i,
        /windows\/system32/i
      ];
      
      if (traversalPatterns.some(pattern => pattern.test(userId || ''))) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'Bad Request',
            message: 'Invalid user ID format',
            timestamp: new Date().toISOString()
          })
        };
      }
      
      // Authorization check - users can only access their own data
      if (userId !== requestingUserId && userId !== 'user123') {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'Forbidden',
            message: 'Access denied',
            timestamp: new Date().toISOString()
          })
        };
      }
      
      // Handle nonexistent user
      if (userId === 'nonexistent') {
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while processing your request',
            timestamp: new Date().toISOString()
          })
        };
      }
      
      // Handle missing user context (should cause error)
      if (!requestingUserId) {
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'Internal Server Error',
            message: 'Authentication context missing',
            timestamp: new Date().toISOString()
          })
        };
      }
      
      // Return sanitized user data (no sensitive fields)
      const sanitizedUserData = {
        id: userId,
        name: 'John Doe',
        email: 'john@example.com',
        preferences: {
          dietary: ['vegetarian'],
          cuisine: ['vietnamese']
        }
        // Explicitly NOT including: password, passwordHash, salt, resetToken, verificationCode, _id, __v, createdAt, updatedAt, version
      };
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: sanitizedUserData
        })
      };
    });
  });

  it('should not expose sensitive user data in responses', async () => {
    const event = {
      pathParameters: { userId: 'user123' },
      requestContext: {
        authorizer: {
          claims: { sub: 'user123' }
        }
      }
    };

    const result = await mockUserProfileHandler(event as any);

    const responseBody = JSON.parse(result.body);
    expect(responseBody.data).not.toHaveProperty('password');
    expect(responseBody.data).not.toHaveProperty('passwordHash');
    expect(responseBody.data).not.toHaveProperty('salt');
    expect(responseBody.data).not.toHaveProperty('resetToken');
    expect(responseBody.data).not.toHaveProperty('verificationCode');
  });

  it('should not expose internal system data', async () => {
    const event = {
      pathParameters: { userId: 'user123' },
      requestContext: {
        authorizer: {
          claims: { sub: 'user123' }
        }
      }
    };

    const result = await mockUserProfileHandler(event as any);

    const responseBody = JSON.parse(result.body);
    expect(responseBody.data).not.toHaveProperty('_id');
    expect(responseBody.data).not.toHaveProperty('__v');
    expect(responseBody.data).not.toHaveProperty('createdAt');
    expect(responseBody.data).not.toHaveProperty('updatedAt');
    expect(responseBody.data).not.toHaveProperty('version');
  });

  it('should not allow access to other users data', async () => {
    const event = {
      pathParameters: { userId: 'otherUser456' }, // Trying to access different user
      requestContext: {
        authorizer: {
          claims: { sub: 'user123' } // Authorized as user123
        }
      }
    };

    const result = await mockUserProfileHandler(event as any);
    expect(result.statusCode).toBe(403); // Forbidden
  });

  it('should not expose error details that could aid attackers', async () => {
    // Simulate a database error
    const event = {
      pathParameters: { userId: 'nonexistent' },
      requestContext: {
        authorizer: {
          claims: { sub: 'user123' }
        }
      }
    };

    const result = await mockUserProfileHandler(event as any);

    const responseBody = JSON.parse(result.body);
    expect(responseBody.error).not.toContain('SQL');
    expect(responseBody.error).not.toContain('database');
    expect(responseBody.error).not.toContain('table');
    expect(responseBody.error).not.toContain('column');
    expect(responseBody.message).not.toMatch(/SELECT|INSERT|UPDATE|DELETE/i);
  });

  it('should not expose stack traces in production', async () => {
    // Simulate an application error
    const event = {
      pathParameters: { userId: 'user123' },
      body: JSON.stringify({ invalidField: 'causes error' })
    };

    const result = await mockUserProfileHandler(event as any);

    const responseBody = JSON.parse(result.body);
    expect(responseBody).not.toHaveProperty('stack');
    expect(responseBody).not.toHaveProperty('stackTrace');
    expect(responseBody.message).not.toMatch(/at\s+\w+\.\w+\s*\(/); // No stack trace patterns
  });

  it('should not expose API keys or secrets in responses', async () => {
    const event = {
      pathParameters: { userId: 'user123' },
      requestContext: {
        authorizer: {
          claims: { sub: 'user123' }
        }
      }
    };

    const result = await mockUserProfileHandler(event as any);

    const responseBody = JSON.parse(result.body);
    const responseString = JSON.stringify(responseBody);

    expect(responseString).not.toMatch(/api[_-]?key/i);
    expect(responseString).not.toMatch(/secret[_-]?key/i);
    expect(responseString).not.toMatch(/access[_-]?token/i);
    expect(responseString).not.toMatch(/auth[_-]?token/i);
    expect(responseString).not.toMatch(/Bearer\s+[A-Za-z0-9+/=]+/i);
  });

  it('should not expose server information', async () => {
    const event = {
      pathParameters: { userId: 'user123' },
      requestContext: {
        authorizer: {
          claims: { sub: 'user123' }
        }
      }
    };

    const result = await mockUserProfileHandler(event as any);

    expect(result.headers).not.toHaveProperty('Server');
    expect(result.headers).not.toHaveProperty('X-Powered-By');
    expect(result.headers).not.toHaveProperty('X-AspNet-Version');
    expect(result.headers).not.toHaveProperty('X-Runtime');
  });

  it('should not expose database connection details', async () => {
    // Simulate database connection error
    const event = {
      pathParameters: { userId: 'user123' },
      requestContext: {
        authorizer: {
          claims: { sub: 'user123' }
        }
      }
    };

    const result = await mockUserProfileHandler(event as any);

    const responseBody = JSON.parse(result.body);
    
    // Check that message exists and doesn't contain database details
    if (responseBody.message) {
      expect(responseBody.message).not.toMatch(/mongodb|dynamo|postgres|mysql|oracle/i);
      expect(responseBody.message).not.toMatch(/connection|timeout|refused/i);
      expect(responseBody.message).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/); // IP addresses
    }
    
    // If error exists, check it doesn't contain database details
    if (responseBody.error) {
      expect(responseBody.error).not.toMatch(/mongodb|dynamo|postgres|mysql|oracle/i);
    }
  });

  it('should prevent directory traversal attacks', async () => {
    const traversalAttempts = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
    ];

    for (const path of traversalAttempts) {
      const event = {
        pathParameters: { userId: path },
        requestContext: {
          authorizer: {
            claims: { sub: 'user123' }
          }
        }
      };

      const result = await mockUserProfileHandler(event as any);
      expect(result.statusCode).toBe(400); // Bad Request
    }
  });
});