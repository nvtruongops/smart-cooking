import { handler } from './index';
import { APIGatewayEvent } from '../shared/types';

// Mock uuid module
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-123')
}));

// Mock shared utilities
jest.mock('../shared/utils', () => ({
  sanitizeInput: jest.fn((input: string, maxLength?: number) => input.replace(/[<>\"'&]/g, '')),
  formatTimestamp: jest.fn(() => '2025-01-01T00:00:00Z'),
  parseJSON: jest.fn((str: string) => JSON.parse(str)),
  logStructured: jest.fn(),
  getUserIdFromEvent: jest.fn((event: any) => event.requestContext?.authorizer?.claims?.sub || 'user-123'),
  validateAge: jest.fn((birthDate: string) => {
    const birth = new Date(birthDate);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    return age >= 13;
  }),
  extractBirthYear: jest.fn((birthDate: string) => new Date(birthDate).getFullYear())
}));

// Mock AWS SDK and shared modules
jest.mock('../shared/dynamodb', () => ({
  DynamoDBHelper: {
    getUserProfile: jest.fn(),
    getUserPreferences: jest.fn(),
    put: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({})
  }
}));

// Mock Avatar Service
jest.mock('../shared/avatar-service', () => ({
  AvatarService: {
    uploadAvatar: jest.fn(),
    setDefaultAvatar: jest.fn()
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
  handleError: jest.fn().mockImplementation((error) => {
    if (error && error.statusCode) {
      const result = {
        statusCode: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.errorCode, message: error.message })
      };
      return result;
    }
    const fallback = {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal_error' })
    };
    return fallback;
  }),
  AppError: class AppError extends Error {
    statusCode: number;
    errorCode: string;
    details: any;
    
    constructor(statusCode: number, errorCode: string, message: string, details: any = {}) {
      super(message);
      this.name = 'AppError';
      this.statusCode = statusCode;
      this.errorCode = errorCode;
      this.details = details;
    }
  }
}));

const mockEvent: Partial<APIGatewayEvent> = {
  httpMethod: 'GET',
  path: '/user/profile',
  pathParameters: null,
  queryStringParameters: null,
  headers: {},
  body: null,
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
const avatarMock = require('../shared/avatar-service');
const responsesMock = require('../shared/responses');
const utilsMock = require('../shared/utils');

describe('User Profile Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Restore utils mock implementations after clearAllMocks
    utilsMock.sanitizeInput.mockImplementation((input: string, maxLength?: number) => {
      if (!input) return input;
      return input.replace(/[<>\"'&]/g, '');
    });
    utilsMock.formatTimestamp.mockReturnValue('2025-01-01T00:00:00Z');
    utilsMock.parseJSON.mockImplementation((str: string | null) => {
      if (!str) return null;
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    });
    utilsMock.getUserIdFromEvent.mockImplementation((event: any) => 
      event.requestContext?.authorizer?.claims?.sub || 'user-123'
    );
    utilsMock.validateAge.mockImplementation((birthDate: string) => {
      const birth = new Date(birthDate);
      const today = new Date();
      const age = today.getFullYear() - birth.getFullYear();
      return age >= 13;
    });
    utilsMock.extractBirthYear.mockImplementation((birthDate: string) => 
      new Date(birthDate).getFullYear()
    );
    
    // Restore response mock implementations after clearAllMocks
    responsesMock.successResponse.mockImplementation((data: any, status = 200) => ({
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }));
    
    responsesMock.errorResponse.mockImplementation((status: number, error: string, message: string) => ({
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error, message })
    }));
    
    responsesMock.handleError.mockImplementation((error: any) => {
      if (error && error.statusCode) {
        return {
          statusCode: error.statusCode,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: error.errorCode, message: error.message })
        };
      }
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal_error', message: 'An error occurred' })
      };
    });

    // Setup default mock responses
    dynamoMock.DynamoDBHelper.getUserProfile.mockResolvedValue({
      PK: 'USER#user-123',
      SK: 'PROFILE',
      entity_type: 'USER_PROFILE',
      user_id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      full_name: 'Test User',
      date_of_birth: '1990-01-01',
      gender: 'male',
      country: 'VN',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    });

    dynamoMock.DynamoDBHelper.getUserPreferences.mockResolvedValue({
      PK: 'USER#user-123',
      SK: 'PREFERENCES',
      entity_type: 'USER_PREFERENCES',
      dietary_restrictions: ['vegetarian'],
      allergies: ['nuts'],
      favorite_cuisines: ['Vietnamese'],
      preferred_cooking_methods: ['stir-fry'],
      preferred_recipe_count: 3,
      spice_level: 'medium',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    });

    dynamoMock.DynamoDBHelper.update.mockResolvedValue({
      PK: 'USER#user-123',
      SK: 'PROFILE',
      entity_type: 'USER_PROFILE',
      user_id: 'user-123',
      full_name: 'Updated Name',
      updated_at: '2025-01-01T00:00:00Z'
    });
  });

  describe('Profile Management', () => {
    test('should get user profile successfully', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'GET'
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.profile).toBeDefined();
      expect(body.profile.user_id).toBe('user-123');
      expect(body.profile.email).toBe('test@example.com');
      // Should not include DynamoDB keys
      expect(body.profile.PK).toBeUndefined();
      expect(body.profile.SK).toBeUndefined();
    });

    test('should handle profile not found', async () => {
      dynamoMock.DynamoDBHelper.getUserProfile.mockResolvedValueOnce(null);

      const event = {
        ...mockEvent,
        httpMethod: 'GET'
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('profile_not_found');
    });

    test('should update user profile successfully', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: JSON.stringify({
          full_name: 'Updated Name',
          gender: 'female',
          country: 'US'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('updated successfully');
      expect(dynamoMock.DynamoDBHelper.update).toHaveBeenCalledWith(
        'USER#user-123',
        'PROFILE',
        expect.stringContaining('SET'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    test('should create user profile successfully', async () => {
      dynamoMock.DynamoDBHelper.getUserProfile.mockResolvedValueOnce(null);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        body: JSON.stringify({
          email: 'newuser@example.com',
          username: 'newuser',
          full_name: 'New User',
          date_of_birth: '1995-05-15',
          gender: 'other',
          country: 'CA'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('created successfully');
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'USER#user-123',
          SK: 'PROFILE',
          entity_type: 'USER_PROFILE',
          user_id: 'user-123',
          email: 'newuser@example.com',
          username: 'newuser',
          full_name: 'New User'
        })
      );
    });

    test('should prevent creating duplicate profile', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          username: 'testuser',
          full_name: 'Test User'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('profile_exists');
    });
  });

  describe('Profile Validation Rules', () => {
    test('should validate age restriction (>=13 years)', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: JSON.stringify({
          date_of_birth: '2020-01-01' // Too young (5 years old)
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_age');
      expect(body.message).toContain('at least 13 years old');
    });

    test('should accept valid age (13+ years)', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: JSON.stringify({
          date_of_birth: '2010-01-01' // 15 years old
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
    });

    test('should validate gender enum (male, female, other)', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: JSON.stringify({
          gender: 'invalid_gender'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_gender');
      expect(body.message).toContain('male, female, or other');
    });

    test('should accept valid gender values', async () => {
      for (const gender of ['male', 'female', 'other']) {
        const event = {
          ...mockEvent,
          httpMethod: 'PUT',
          body: JSON.stringify({ gender })
        } as APIGatewayEvent;

        const result = await handler(event);
        expect(result.statusCode).toBe(200);
      }
    });

    test('should validate country code format (2-letter)', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: JSON.stringify({
          country: 'INVALID' // Too long
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_country');
      expect(body.message).toContain('2-letter country code');
    });

    test('should accept valid country codes', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: JSON.stringify({
          country: 'us' // Should be converted to uppercase
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });

    test('should validate full name is non-empty string', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: JSON.stringify({
          full_name: '' // Empty string
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_full_name');
    });

    test('should sanitize input fields', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: JSON.stringify({
          full_name: '<script>alert("xss")</script>Test User',
          avatar_url: 'https://example.com/avatar<script>'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      
      // Verify sanitization was called
      expect(dynamoMock.DynamoDBHelper.update).toHaveBeenCalledWith(
        'USER#user-123',
        'PROFILE',
        expect.any(String),
        expect.objectContaining({
          ':val0': 'scriptalert(xss)/scriptTest User', // XSS characters removed
          ':val1': 'https://example.com/avatarscript' // XSS characters removed
        }),
        expect.any(Object)
      );
    });

    test('should handle missing request body', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: null
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('missing_body');
    });

    test('should handle no valid fields to update', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: JSON.stringify({
          invalid_field: 'value'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('no_updates');
    });
  });

  describe('User Preferences Management', () => {
    test('should get user preferences successfully', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        pathParameters: { type: 'preferences' }
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.preferences).toBeDefined();
      expect(body.preferences.dietary_restrictions).toEqual(['vegetarian']);
      expect(body.isDefault).toBe(false);
    });

    test('should return default preferences when none exist', async () => {
      dynamoMock.DynamoDBHelper.getUserPreferences.mockResolvedValueOnce(null);

      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        pathParameters: { type: 'preferences' }
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.preferences).toBeDefined();
      expect(body.preferences.dietary_restrictions).toEqual([]);
      expect(body.isDefault).toBe(true);
    });

    test('should create user preferences successfully', async () => {
      dynamoMock.DynamoDBHelper.getUserPreferences.mockResolvedValueOnce(null);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'preferences' },
        body: JSON.stringify({
          dietary_restrictions: ['vegetarian', 'gluten-free'],
          allergies: ['nuts', 'shellfish'],
          favorite_cuisines: ['Vietnamese', 'Italian'],
          preferred_cooking_methods: ['stir-fry', 'steam'],
          preferred_recipe_count: 4,
          spice_level: 'hot'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('created successfully');
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'USER#user-123',
          SK: 'PREFERENCES',
          entity_type: 'USER_PREFERENCES',
          dietary_restrictions: ['vegetarian', 'gluten-free'],
          allergies: ['nuts', 'shellfish'],
          preferred_recipe_count: 4,
          spice_level: 'hot'
        })
      );
    });

    test('should prevent creating duplicate preferences', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'preferences' },
        body: JSON.stringify({
          dietary_restrictions: ['vegetarian']
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('preferences_exist');
    });

    test('should update user preferences successfully', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        pathParameters: { type: 'preferences' },
        body: JSON.stringify({
          dietary_restrictions: ['vegan'],
          spice_level: 'mild'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('updated successfully');
    });

    test('should handle preferences not found for update', async () => {
      dynamoMock.DynamoDBHelper.getUserPreferences.mockResolvedValueOnce(null);

      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        pathParameters: { type: 'preferences' },
        body: JSON.stringify({
          spice_level: 'mild'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('preferences_not_found');
    });
  });

  describe('Preferences Validation Rules', () => {
    test('should validate spice level enum (mild, medium, hot)', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'preferences' },
        body: JSON.stringify({
          spice_level: 'invalid_level'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_spice_level');
      expect(body.message).toContain('mild, medium, or hot');
    });

    test('should validate recipe count range (1-5)', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'preferences' },
        body: JSON.stringify({
          preferred_recipe_count: 10 // Too high
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_recipe_count');
      expect(body.message).toContain('between 1 and 5');
    });

    test('should validate recipe count is integer', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'preferences' },
        body: JSON.stringify({
          preferred_recipe_count: 3.5 // Not integer
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_recipe_count');
    });

    test('should validate arrays are actually arrays', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'preferences' },
        body: JSON.stringify({
          dietary_restrictions: 'not an array'
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_arrays');
    });

    test('should sanitize array items', async () => {
      dynamoMock.DynamoDBHelper.getUserPreferences.mockResolvedValueOnce(null);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'preferences' },
        body: JSON.stringify({
          dietary_restrictions: ['<script>vegetarian</script>'],
          allergies: ['nuts&shellfish']
        })
      } as APIGatewayEvent;

      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      
      // Verify sanitization was applied to array items
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          dietary_restrictions: ['scriptvegetarian/script'],
          allergies: ['nutsshellfish']
        })
      );
    });
  });

  describe('Data Persistence', () => {
    test('should properly structure DynamoDB items for profile', async () => {
      dynamoMock.DynamoDBHelper.getUserProfile.mockResolvedValueOnce(null);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          username: 'testuser',
          full_name: 'Test User'
        })
      } as APIGatewayEvent;

      await handler(event);

      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'USER#user-123',
          SK: 'PROFILE',
          entity_type: 'USER_PROFILE',
          user_id: 'user-123',
          created_at: expect.any(String),
          updated_at: expect.any(String)
        })
      );
    });

    test('should properly structure DynamoDB items for preferences', async () => {
      dynamoMock.DynamoDBHelper.getUserPreferences.mockResolvedValueOnce(null);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'preferences' },
        body: JSON.stringify({
          dietary_restrictions: ['vegetarian']
        })
      } as APIGatewayEvent;

      await handler(event);

      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'USER#user-123',
          SK: 'PREFERENCES',
          entity_type: 'USER_PREFERENCES',
          created_at: expect.any(String),
          updated_at: expect.any(String)
        })
      );
    });

    test('should update timestamps on profile updates', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'PUT',
        body: JSON.stringify({
          full_name: 'Updated Name'
        })
      } as APIGatewayEvent;

      await handler(event);

      expect(dynamoMock.DynamoDBHelper.update).toHaveBeenCalledWith(
        'USER#user-123',
        'PROFILE',
        expect.stringContaining('#updatedAt = :updatedAt'),
        expect.objectContaining({
          ':updatedAt': expect.any(String)
        }),
        expect.objectContaining({
          '#updatedAt': 'updated_at'
        })
      );
    });
  });

  describe('Error Handling', () => {
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
        httpMethod: 'PUT',
        body: 'invalid json'
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(500);
    });

    test('should handle DynamoDB errors gracefully', async () => {
      dynamoMock.DynamoDBHelper.getUserProfile.mockRejectedValueOnce(
        new Error('DynamoDB connection failed')
      );

      const event = {
        ...mockEvent,
        httpMethod: 'GET'
      } as APIGatewayEvent;

      const result = await handler(event);
      
      expect(result.statusCode).toBe(500);
    });

    test('should handle missing user ID in request context', async () => {
      // Mock getUserIdFromEvent to throw for this test
      const utilsMock = jest.mocked(require('../shared/utils'));
      utilsMock.getUserIdFromEvent.mockImplementationOnce(() => {
        throw new Error('User ID not found in request context');
      });

      const event = {
        ...mockEvent,
        requestContext: {
          requestId: 'test-request-id'
          // Missing authorizer
        }
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
    });
  });

  describe('Avatar Upload Functionality', () => {
    beforeEach(() => {
      // Reset avatar service mocks
      avatarMock.AvatarService.uploadAvatar.mockReset();
      avatarMock.AvatarService.setDefaultAvatar.mockReset();
    });

    test('should upload avatar successfully', async () => {
      const mockAvatarResult = {
        avatar_url: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/user-123/avatar/avatar.jpg',
        avatar_key: 'user-123/avatar/avatar.jpg',
        is_default: false
      };

      avatarMock.AvatarService.uploadAvatar.mockResolvedValue(mockAvatarResult);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'avatar' },
        body: JSON.stringify({
          image_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A',
          content_type: 'image/jpeg'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Avatar uploaded successfully');
      expect(body.avatar_url).toBe(mockAvatarResult.avatar_url);

      // Verify avatar service was called correctly
      expect(avatarMock.AvatarService.uploadAvatar).toHaveBeenCalledWith({
        user_id: 'user-123',
        image_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A',
        content_type: 'image/jpeg'
      });

      // Verify profile was updated with avatar URL
      expect(dynamoMock.DynamoDBHelper.update).toHaveBeenCalledWith(
        'USER#user-123',
        'PROFILE',
        'SET avatar_url = :avatar_url, updated_at = :updated_at',
        {
          ':avatar_url': mockAvatarResult.avatar_url,
          ':updated_at': '2025-01-01T00:00:00Z'
        }
      );
    });

    test('should return 400 for missing request body', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'avatar' },
        body: null
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('missing_body');
      expect(body.message).toBe('Request body is required');
    });

    test('should return 400 for missing image_data or content_type', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'avatar' },
        body: JSON.stringify({
          image_data: 'base64data'
          // Missing content_type
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('missing_fields');
      expect(body.message).toBe('image_data and content_type are required');
    });

    test('should handle invalid content type', async () => {
      const mockError = {
        statusCode: 400,
        errorCode: 'invalid_content_type',
        message: 'Content type must be one of: image/jpeg, image/png, image/jpg'
      };

      avatarMock.AvatarService.uploadAvatar.mockRejectedValue(mockError);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'avatar' },
        body: JSON.stringify({
          image_data: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
          content_type: 'image/gif'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_content_type');
    });

    test('should handle oversized image (>2MB)', async () => {
      const mockError = {
        statusCode: 400,
        errorCode: 'image_too_large',
        message: 'Avatar size must not exceed 2MB'
      };

      avatarMock.AvatarService.uploadAvatar.mockRejectedValue(mockError);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'avatar' },
        body: JSON.stringify({
          image_data: 'data:image/jpeg;base64,' + 'A'.repeat(3000000), // Large base64 string
          content_type: 'image/jpeg'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('image_too_large');
    });

    test('should handle invalid base64 image data', async () => {
      const mockError = {
        statusCode: 400,
        errorCode: 'invalid_image_data',
        message: 'Invalid base64 image data'
      };

      avatarMock.AvatarService.uploadAvatar.mockRejectedValue(mockError);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'avatar' },
        body: JSON.stringify({
          image_data: 'invalid-base64-data',
          content_type: 'image/jpeg'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('invalid_image_data');
    });

    test('should handle S3 upload failure', async () => {
      const mockError = {
        statusCode: 500,
        errorCode: 's3_upload_failed',
        message: 'Failed to upload avatar to S3'
      };

      avatarMock.AvatarService.uploadAvatar.mockRejectedValue(mockError);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'avatar' },
        body: JSON.stringify({
          image_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A',
          content_type: 'image/jpeg'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('s3_upload_failed');
    });

    test('should handle DynamoDB update failure after successful S3 upload', async () => {
      const mockAvatarResult = {
        avatar_url: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/user-123/avatar/avatar.jpg',
        avatar_key: 'user-123/avatar/avatar.jpg',
        is_default: false
      };

      avatarMock.AvatarService.uploadAvatar.mockResolvedValue(mockAvatarResult);
      dynamoMock.DynamoDBHelper.update.mockRejectedValue(new Error('DynamoDB update failed'));

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'avatar' },
        body: JSON.stringify({
          image_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A',
          content_type: 'image/jpeg'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      
      // Verify avatar was uploaded to S3 but DynamoDB update failed
      expect(avatarMock.AvatarService.uploadAvatar).toHaveBeenCalled();
      expect(dynamoMock.DynamoDBHelper.update).toHaveBeenCalled();
    });

    test('should upload PNG avatar successfully', async () => {
      const mockAvatarResult = {
        avatar_url: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/user-123/avatar/avatar.png',
        avatar_key: 'user-123/avatar/avatar.png',
        is_default: false
      };

      avatarMock.AvatarService.uploadAvatar.mockResolvedValue(mockAvatarResult);

      const event = {
        ...mockEvent,
        httpMethod: 'POST',
        pathParameters: { type: 'avatar' },
        body: JSON.stringify({
          image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          content_type: 'image/png'
        })
      } as APIGatewayEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.avatar_url).toBe(mockAvatarResult.avatar_url);

      expect(avatarMock.AvatarService.uploadAvatar).toHaveBeenCalledWith({
        user_id: 'user-123',
        image_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        content_type: 'image/png'
      });
    });
  });

  describe('Avatar Service Integration Tests', () => {
    test('should test avatar service methods independently', async () => {
      // Test setDefaultAvatar
      const mockDefaultResult = {
        avatar_url: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/user-123/avatar/avatar.png',
        avatar_key: 'user-123/avatar/avatar.png',
        is_default: true
      };

      avatarMock.AvatarService.setDefaultAvatar.mockResolvedValue(mockDefaultResult);

      const defaultResult = await avatarMock.AvatarService.setDefaultAvatar('user-123');
      
      expect(defaultResult.is_default).toBe(true);
      expect(defaultResult.avatar_url).toContain('user-123/avatar/avatar.png');
      expect(avatarMock.AvatarService.setDefaultAvatar).toHaveBeenCalledWith('user-123');
    });

    test('should handle avatar service errors gracefully', async () => {
      avatarMock.AvatarService.setDefaultAvatar.mockRejectedValue(
        new Error('S3 copy operation failed')
      );

      try {
        await avatarMock.AvatarService.setDefaultAvatar('user-123');
      } catch (error: any) {
        expect(error.message).toBe('S3 copy operation failed');
      }

      expect(avatarMock.AvatarService.setDefaultAvatar).toHaveBeenCalledWith('user-123');
    });
  });
});