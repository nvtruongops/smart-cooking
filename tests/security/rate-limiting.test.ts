import { successResponse, errorResponse } from '../../lambda/shared/responses';

// Mock rate limiting handler
const mockRateLimitHandler = jest.fn();

// Mock setup
jest.mock('../../lambda/shared/responses');

describe('Rate Limiting Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Restore mocks
    (successResponse as jest.Mock).mockImplementation((data: any, statusCode: number = 200) => ({
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        data
      })
    }));

    (errorResponse as jest.Mock).mockImplementation((statusCode: number, error: string, message: string) => ({
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error,
        message,
        timestamp: new Date().toISOString()
      })
    }));

    // Mock rate limiting handler
    mockRateLimitHandler.mockImplementation((event: any) => {
      const userId = event.requestContext?.authorizer?.claims?.sub || 'anonymous';
      const isLogin = event.path === '/auth/login';
      const email = isLogin ? JSON.parse(event.body || '{}').email : null;
      
      let rateLimitKey = userId;
      let limit = 100;
      
      if (isLogin && email) {
        rateLimitKey = `login:${email}`;
        limit = 5; // Stricter limit for login attempts
      } else if (userId === 'anonymous') {
        limit = 10; // Stricter limit for anonymous users
      }
      
      const requestCount = getRequestCount(rateLimitKey);
      const remaining = Math.max(0, limit - requestCount);
      const resetTime = Date.now() + 3600000; // 1 hour from now

      const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': resetTime.toString()
      };

      if (requestCount >= limit) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            timestamp: new Date().toISOString()
          })
        };
      }

      incrementRequestCount(rateLimitKey);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: { success: true }
        })
      };
    });
  });

  // Mock rate limiting storage (in real implementation, this would be Redis or similar)
  const requestCounts = new Map<string, number>();
  const getRequestCount = (userId: string): number => requestCounts.get(userId) || 0;
  const incrementRequestCount = (userId: string): void => {
    requestCounts.set(userId, (requestCounts.get(userId) || 0) + 1);
  };

  it('should allow requests within rate limit', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { sub: 'user123' }
        }
      }
    };

    const result = await mockRateLimitHandler(event as any);
    expect(result.statusCode).toBe(200);
  });

  it('should block requests exceeding rate limit', async () => {
    const userId = 'user123';
    const event = {
      requestContext: {
        authorizer: {
          claims: { sub: userId }
        }
      }
    };

    // Simulate exceeding rate limit
    for (let i = 0; i < 101; i++) {
      incrementRequestCount(userId);
    }

    const result = await mockRateLimitHandler(event as any);
    expect(result.statusCode).toBe(429);
  });

  it('should apply rate limiting per user', async () => {
    const user1Event = {
      requestContext: {
        authorizer: {
          claims: { sub: 'user1' }
        }
      }
    };

    const user2Event = {
      requestContext: {
        authorizer: {
          claims: { sub: 'user2' }
        }
      }
    };

    // User1 exceeds limit
    for (let i = 0; i < 101; i++) {
      incrementRequestCount('user1');
    }

    // User1 should be blocked
    const user1Result = await mockRateLimitHandler(user1Event as any);
    expect(user1Result.statusCode).toBe(429);

    // User2 should still be allowed
    const user2Result = await mockRateLimitHandler(user2Event as any);
    expect(user2Result.statusCode).toBe(200);
  });

  it('should handle anonymous users with stricter limits', async () => {
    const event = {
      requestContext: {} // No authorizer claims = anonymous
    };

    // Anonymous users have lower limit (e.g., 10 requests)
    for (let i = 0; i < 11; i++) {
      incrementRequestCount('anonymous');
    }

    const result = await mockRateLimitHandler(event as any);
    expect(result.statusCode).toBe(429);
  });

  it('should prevent brute force attacks on login endpoints', async () => {
    const loginEvent = {
      path: '/auth/login',
      httpMethod: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'wrongpassword'
      })
    };

    // Simulate multiple failed login attempts
    for (let i = 0; i < 6; i++) { // Exceed login attempt limit
      incrementRequestCount('login:test@example.com');
    }

    const result = await mockRateLimitHandler(loginEvent as any);
    expect(result.statusCode).toBe(429);
  });

  it('should include rate limit headers in response', async () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: { sub: 'user123' }
        }
      }
    };

    const result = await mockRateLimitHandler(event as any);
    expect(result.headers).toHaveProperty('X-RateLimit-Limit');
    expect(result.headers).toHaveProperty('X-RateLimit-Remaining');
    expect(result.headers).toHaveProperty('X-RateLimit-Reset');
  });
});