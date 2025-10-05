import { handler } from './index';
import { APIGatewayEvent } from '../shared/types';

// Mock AWS SDK and shared modules
jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  const mockSend = jest.fn();
  return {
    CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    SignUpCommand: jest.fn().mockImplementation((params) => ({ type: 'SignUpCommand', params })),
    InitiateAuthCommand: jest.fn().mockImplementation((params) => ({ type: 'InitiateAuthCommand', params })),
    ConfirmSignUpCommand: jest.fn().mockImplementation((params) => ({ type: 'ConfirmSignUpCommand', params })),
    ForgotPasswordCommand: jest.fn().mockImplementation((params) => ({ type: 'ForgotPasswordCommand', params })),
    ConfirmForgotPasswordCommand: jest.fn().mockImplementation((params) => ({ type: 'ConfirmForgotPasswordCommand', params })),
    ChangePasswordCommand: jest.fn().mockImplementation((params) => ({ type: 'ChangePasswordCommand', params })),
    GetUserCommand: jest.fn().mockImplementation((params) => ({ type: 'GetUserCommand', params })),
    AuthFlowType: { USER_PASSWORD_AUTH: 'USER_PASSWORD_AUTH' },
    __mockSend: mockSend // Export for access in tests
  };
});

jest.mock('../shared/dynamodb', () => ({
  DynamoDBHelper: {
    getUserProfile: jest.fn(),
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
  })),
  handleError: jest.fn((error) => {
    if (error.statusCode) {
      return {
        statusCode: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.errorCode, message: error.message })
      };
    }
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal_error' })
    };
  }),
  AppError: class AppError extends Error {
    statusCode: number;
    errorCode: string;
    constructor(statusCode: number, errorCode: string, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.errorCode = errorCode;
    }
  }
}));

const mockEvent: Partial<APIGatewayEvent> = {
  httpMethod: 'POST',
  path: '/auth',
  pathParameters: null,
  queryStringParameters: null,
  headers: {},
  body: null,
  requestContext: {
    requestId: 'test-request-id',
  }
};

// Get mocked modules
const cognitoMock = jest.mocked(require('@aws-sdk/client-cognito-identity-provider'));
const dynamoMock = jest.mocked(require('../shared/dynamodb'));

describe('Auth Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock responses
    cognitoMock.__mockSend.mockImplementation((command: { type: string; params?: any }) => {
      if (command.type === 'SignUpCommand') {
        return Promise.resolve({
          UserSub: 'test-user-sub',
          CodeDeliveryDetails: { DeliveryMedium: 'EMAIL', Destination: 'test@example.com' }
        });
      }
      if (command.type === 'InitiateAuthCommand') {
        return Promise.resolve({
          AuthenticationResult: {
            AccessToken: 'test-access-token',
            RefreshToken: 'test-refresh-token',
            IdToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwibmFtZSI6IlRlc3QgVXNlciJ9.test',
            ExpiresIn: 3600
          }
        });
      }
      if (command.type === 'ConfirmSignUpCommand') {
        return Promise.resolve({});
      }
      if (command.type === 'ForgotPasswordCommand') {
        return Promise.resolve({
          CodeDeliveryDetails: { DeliveryMedium: 'EMAIL', Destination: 'test@example.com' }
        });
      }
      if (command.type === 'ConfirmForgotPasswordCommand') {
        return Promise.resolve({});
      }
      if (command.type === 'ChangePasswordCommand') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    // Setup DynamoDB mocks
    dynamoMock.DynamoDBHelper.getUserProfile.mockResolvedValue({
      user_id: 'test-user',
      email: 'test@example.com',
      username: 'testuser',
      full_name: 'Test User',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    });
  });

  describe('Registration Flow', () => {
    test('should handle successful registration', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'register',
          email: 'test@example.com',
          password: 'TestPassword123',
          username: 'testuser',
          full_name: 'Test User'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('registered successfully');
      expect(body.userSub).toBe('test-user-sub');
      expect(body.codeDeliveryDetails).toBeDefined();
    });

    test('should validate required fields for registration', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'register',
          email: 'test@example.com'
          // Missing password, username, full_name
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('missing_fields');
    });

    test('should validate email format', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'register',
          email: 'invalid-email',
          password: 'TestPassword123',
          username: 'testuser',
          full_name: 'Test User'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_email');
    });

    test('should validate password strength', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'register',
          email: 'test@example.com',
          password: '123', // Too short
          username: 'testuser',
          full_name: 'Test User'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('weak_password');
    });

    test('should handle username already exists error', async () => {
      cognitoMock.__mockSend.mockRejectedValueOnce({
        name: 'UsernameExistsException',
        message: 'Username already exists'
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'register',
          email: 'test@example.com',
          password: 'TestPassword123',
          username: 'existinguser',
          full_name: 'Test User'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('username_exists');
    });

    test('should handle invalid password exception from Cognito', async () => {
      cognitoMock.__mockSend.mockRejectedValueOnce({
        name: 'InvalidPasswordException',
        message: 'Password does not meet requirements'
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'register',
          email: 'test@example.com',
          password: 'weakpass',
          username: 'testuser',
          full_name: 'Test User'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_password');
    });
  });

  describe('Login Flow', () => {
    test('should handle successful login', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'login',
          username: 'testuser',
          password: 'TestPassword123'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Login successful');
      expect(body.tokens).toBeDefined();
      expect(body.tokens.accessToken).toBe('test-access-token');
      expect(body.tokens.refreshToken).toBe('test-refresh-token');
      expect(body.tokens.idToken).toBeDefined();
    });

    test('should validate required credentials for login', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'login',
          username: 'testuser'
          // Missing password
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('missing_credentials');
    });

    test('should handle invalid credentials', async () => {
      cognitoMock.__mockSend.mockRejectedValueOnce({
        name: 'NotAuthorizedException',
        message: 'Incorrect username or password'
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'login',
          username: 'testuser',
          password: 'wrongpassword'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_credentials');
    });

    test('should handle user not confirmed', async () => {
      cognitoMock.__mockSend.mockRejectedValueOnce({
        name: 'UserNotConfirmedException',
        message: 'User is not confirmed'
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'login',
          username: 'testuser',
          password: 'TestPassword123'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('user_not_confirmed');
    });

    test('should handle user not found', async () => {
      cognitoMock.__mockSend.mockRejectedValueOnce({
        name: 'UserNotFoundException',
        message: 'User does not exist'
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'login',
          username: 'nonexistentuser',
          password: 'TestPassword123'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('user_not_found');
    });

    test('should handle authentication challenges', async () => {
      cognitoMock.__mockSend.mockResolvedValueOnce({
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        Session: 'test-session',
        ChallengeParameters: { USER_ID_FOR_SRP: 'testuser' }
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'login',
          username: 'testuser',
          password: 'TempPassword123'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.challenge).toBe('NEW_PASSWORD_REQUIRED');
      expect(body.session).toBe('test-session');
    });

    test('should create user profile after successful login', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'login',
          username: 'testuser',
          password: 'TestPassword123'
        })
      } as APIGatewayEvent;

      await handler(event);

      // Verify that DynamoDB put was called to create/update profile
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'USER#test-user',
          SK: 'PROFILE',
          entity_type: 'USER_PROFILE'
        })
      );
    });
  });

  describe('Email Confirmation', () => {
    test('should handle successful email confirmation', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'confirm-signup',
          username: 'testuser',
          confirmationCode: '123456'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('confirmed successfully');
    });

    test('should validate required fields for confirmation', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'confirm-signup',
          username: 'testuser'
          // Missing confirmationCode
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('missing_fields');
    });

    test('should handle invalid confirmation code', async () => {
      cognitoMock.__mockSend.mockRejectedValueOnce({
        name: 'CodeMismatchException',
        message: 'Invalid verification code'
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'confirm-signup',
          username: 'testuser',
          confirmationCode: 'invalid'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_code');
    });

    test('should handle expired confirmation code', async () => {
      cognitoMock.__mockSend.mockRejectedValueOnce({
        name: 'ExpiredCodeException',
        message: 'Confirmation code has expired'
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'confirm-signup',
          username: 'testuser',
          confirmationCode: '123456'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('expired_code');
    });
  });

  describe('Password Reset', () => {
    test('should handle forgot password request', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'forgot-password',
          username: 'testuser'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Password reset code sent');
      expect(body.codeDeliveryDetails).toBeDefined();
    });

    test('should handle confirm forgot password', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'confirm-forgot-password',
          username: 'testuser',
          confirmationCode: '123456',
          newPassword: 'NewPassword123'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Password reset successfully');
    });

    test('should validate new password strength in reset', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'confirm-forgot-password',
          username: 'testuser',
          confirmationCode: '123456',
          newPassword: '123' // Too short
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('weak_password');
    });
  });

  describe('Password Change', () => {
    test('should handle password change with valid token', async () => {
      const event = {
        ...mockEvent,
        headers: {
          Authorization: 'Bearer test-access-token'
        },
        requestContext: {
          requestId: 'test-request-id',
          authorizer: {
            claims: {
              sub: 'user-123',
              email: 'test@example.com',
              username: 'testuser'
            }
          }
        },
        body: JSON.stringify({
          action: 'change-password',
          previousPassword: 'OldPassword123',
          proposedPassword: 'NewPassword123'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Password changed successfully');
    });

    test('should require access token for password change', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'change-password',
          previousPassword: 'OldPassword123',
          proposedPassword: 'NewPassword123'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('missing_token');
    });

    test('should handle incorrect current password', async () => {
      cognitoMock.__mockSend.mockRejectedValueOnce({
        name: 'NotAuthorizedException',
        message: 'Incorrect password'
      });

      const event = {
        ...mockEvent,
        headers: {
          Authorization: 'Bearer test-access-token'
        },
        body: JSON.stringify({
          action: 'change-password',
          previousPassword: 'WrongPassword',
          proposedPassword: 'NewPassword123'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_password');
    });
  });

  describe('Get User Info', () => {
    test('should get user info with valid authentication', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
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
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.profile).toBeDefined();
      expect(body.profile.user_id).toBe('test-user');
    });

    test('should handle profile not found', async () => {
      dynamoMock.DynamoDBHelper.getUserProfile.mockResolvedValueOnce(null);

      const event = {
        ...mockEvent,
        httpMethod: 'GET',
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
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('profile_not_found');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid action', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'invalid_action'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_action');
    });

    test('should handle method not allowed', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'DELETE'
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(405);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('method_not_allowed');
    });

    test('should handle malformed JSON', async () => {
      const event = {
        ...mockEvent,
        body: 'invalid json'
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
    });
  });

  describe('Token Validation', () => {
    test('should properly decode and use JWT token for profile creation', async () => {
      const mockIdToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwibmFtZSI6IlRlc3QgVXNlciJ9.test';

      cognitoMock.__mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'test-access-token',
          RefreshToken: 'test-refresh-token',
          IdToken: mockIdToken,
          ExpiresIn: 3600
        }
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'login',
          username: 'testuser',
          password: 'TestPassword123'
        })
      } as APIGatewayEvent;

      await handler(event);

      // Verify profile creation with correct user ID from token
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'USER#test-user-id',
          SK: 'PROFILE',
          entity_type: 'USER_PROFILE',
          user_id: 'test-user-id',
          email: 'test@example.com',
          username: 'testuser',
          full_name: 'Test User'
        })
      );
    });

    test('should handle invalid JWT token gracefully', async () => {
      const invalidToken = 'invalid.jwt.token';

      cognitoMock.__mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'test-access-token',
          RefreshToken: 'test-refresh-token',
          IdToken: invalidToken,
          ExpiresIn: 3600
        }
      });

      const event = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'login',
          username: 'testuser',
          password: 'TestPassword123'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      // Should still return successful login even if profile creation fails
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Login successful');
    });
  });
});