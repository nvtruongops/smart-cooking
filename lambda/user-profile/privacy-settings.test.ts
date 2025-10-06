import { handler } from './index';
import { DynamoDBHelper } from '../shared/dynamodb';
import { APIGatewayEvent, PrivacySettings } from '../shared/types';

// Mock dependencies
jest.mock('../shared/dynamodb');
jest.mock('../shared/logger', () => ({
  logger: {
    initFromEvent: jest.fn(),
    logFunctionStart: jest.fn(),
    logFunctionEnd: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  }
}));
jest.mock('../shared/metrics', () => ({
  metrics: {
    trackApiRequest: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined)
  }
}));
jest.mock('../shared/tracer', () => ({
  tracer: {
    setUser: jest.fn()
  }
}));

describe('Privacy Settings Management', () => {
  const mockUserId = 'test-user-123';
  const mockEmail = 'test@example.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockEvent = (
    method: string,
    type: string,
    body: any = null
  ): APIGatewayEvent => ({
    httpMethod: method,
    path: `/user/${type}`,
    pathParameters: { type },
    queryStringParameters: null,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mock-token'
    },
    body: body ? JSON.stringify(body) : null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: {
          sub: mockUserId,
          email: mockEmail,
          username: 'testuser'
        }
      }
    },
    multiValueHeaders: undefined,
    multiValueQueryStringParameters: undefined,
    stageVariables: null,
    isBase64Encoded: false,
    resource: `/user/{type}`
  });

  describe('GET /user/privacy', () => {
    it('should return default privacy settings when none exist', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);

      const event = createMockEvent('GET', 'privacy');
      const response = await handler(event);

      console.log('Response:', JSON.stringify(response, null, 2));

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      console.log('Response Body:', JSON.stringify(responseBody, null, 2));

      expect(responseBody.data.privacy).toEqual({
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends'
      });
      expect(responseBody.data.isDefault).toBe(true);
    });

    it('should return existing privacy settings', async () => {
      const mockPrivacySettings: PrivacySettings = {
        profile_visibility: 'friends',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'friends',
        preferences_visibility: 'private',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue({
        PK: `USER#${mockUserId}`,
        SK: 'PRIVACY',
        entity_type: 'USER_PRIVACY',
        ...mockPrivacySettings
      });

      const event = createMockEvent('GET', 'privacy');
      const response = await handler(event);

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.data.privacy).toMatchObject({
        profile_visibility: 'friends',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'friends',
        preferences_visibility: 'private'
      });
      expect(responseBody.data.isDefault).toBe(false);
    });
  });

  describe('PUT /user/privacy', () => {
    it('should create new privacy settings if none exist', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);
      (DynamoDBHelper.put as jest.Mock).mockResolvedValue(undefined);

      const updateData = {
        profile_visibility: 'friends',
        email_visibility: 'private'
      };

      const event = createMockEvent('PUT', 'privacy', updateData);
      const response = await handler(event);

      expect(response.statusCode).toBe(201);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.data.message).toBe('Privacy settings created successfully');
      expect(responseBody.data.privacy).toMatchObject({
        profile_visibility: 'friends',
        email_visibility: 'private',
        date_of_birth_visibility: 'private', // default
        cooking_history_visibility: 'public', // default
        preferences_visibility: 'friends' // default
      });

      expect(DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `USER#${mockUserId}`,
          SK: 'PRIVACY',
          entity_type: 'USER_PRIVACY',
          profile_visibility: 'friends',
          email_visibility: 'private'
        })
      );
    });

    it('should update existing privacy settings', async () => {
      const existingSettings = {
        PK: `USER#${mockUserId}`,
        SK: 'PRIVACY',
        entity_type: 'USER_PRIVACY',
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(existingSettings);
      (DynamoDBHelper.update as jest.Mock).mockResolvedValue({
        ...existingSettings,
        profile_visibility: 'friends',
        cooking_history_visibility: 'private',
        updated_at: '2025-01-02T00:00:00Z'
      });

      const updateData = {
        profile_visibility: 'friends',
        cooking_history_visibility: 'private'
      };

      const event = createMockEvent('PUT', 'privacy', updateData);
      const response = await handler(event);

      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.data.message).toBe('Privacy settings updated successfully');
      expect(responseBody.data.privacy).toMatchObject({
        profile_visibility: 'friends',
        cooking_history_visibility: 'private'
      });

      expect(DynamoDBHelper.update).toHaveBeenCalledWith(
        `USER#${mockUserId}`,
        'PRIVACY',
        expect.stringContaining('SET'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should validate privacy levels', async () => {
      const invalidData = {
        profile_visibility: 'invalid_level'
      };

      const event = createMockEvent('PUT', 'privacy', invalidData);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toContain('privacy_level');
    });

    it('should accept all valid privacy levels', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);
      (DynamoDBHelper.put as jest.Mock).mockResolvedValue(undefined);

      const validLevels = ['public', 'friends', 'private'];

      for (const level of validLevels) {
        const updateData = { profile_visibility: level };
        const event = createMockEvent('PUT', 'privacy', updateData);
        const response = await handler(event);

        expect(response.statusCode).toBe(201);
      }
    });

    it('should update only specified fields', async () => {
      const existingSettings = {
        PK: `USER#${mockUserId}`,
        SK: 'PRIVACY',
        entity_type: 'USER_PRIVACY',
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends'
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(existingSettings);
      (DynamoDBHelper.update as jest.Mock).mockResolvedValue({
        ...existingSettings,
        email_visibility: 'public'
      });

      const updateData = {
        email_visibility: 'public'
      };

      const event = createMockEvent('PUT', 'privacy', updateData);
      const response = await handler(event);

      expect(response.statusCode).toBe(200);

      const updateCall = (DynamoDBHelper.update as jest.Mock).mock.calls[0];
      const expressionValues = updateCall[3];

      // Should only update email_visibility and updated_at
      expect(Object.keys(expressionValues).length).toBe(2); // :val0 and :updatedAt
    });

    it('should reject empty update', async () => {
      const event = createMockEvent('PUT', 'privacy', {});
      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('no_updates');
    });

    it('should reject missing body', async () => {
      const event = createMockEvent('PUT', 'privacy', null);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.error).toBe('missing_body');
    });

    it('should handle all privacy fields', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);
      (DynamoDBHelper.put as jest.Mock).mockResolvedValue(undefined);

      const allFields = {
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'friends',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends'
      };

      const event = createMockEvent('PUT', 'privacy', allFields);
      const response = await handler(event);

      expect(response.statusCode).toBe(201);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.data.privacy).toMatchObject(allFields);
    });
  });

  describe('Privacy Validation Edge Cases', () => {
    it('should reject invalid field names', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);

      const invalidData = {
        invalid_field: 'public',
        profile_visibility: 'public'
      };

      const event = createMockEvent('PUT', 'privacy', invalidData);
      const response = await handler(event);

      // Should succeed but ignore invalid_field
      expect(response.statusCode).toBe(201);

      const putCall = (DynamoDBHelper.put as jest.Mock).mock.calls[0];
      const savedData = putCall[0];

      expect(savedData.invalid_field).toBeUndefined();
      expect(savedData.profile_visibility).toBe('public');
    });

    it('should maintain case-sensitivity for privacy levels', async () => {
      const invalidData = {
        profile_visibility: 'Public' // capital P
      };

      const event = createMockEvent('PUT', 'privacy', invalidData);
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Privacy Settings Integration', () => {
    it('should create privacy settings with correct DynamoDB structure', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);
      (DynamoDBHelper.put as jest.Mock).mockResolvedValue(undefined);

      const updateData = {
        profile_visibility: 'friends'
      };

      const event = createMockEvent('PUT', 'privacy', updateData);
      await handler(event);

      expect(DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: `USER#${mockUserId}`,
          SK: 'PRIVACY',
          entity_type: 'USER_PRIVACY',
          created_at: expect.any(String),
          updated_at: expect.any(String)
        })
      );
    });

    it('should not expose DynamoDB keys in response', async () => {
      const mockSettings = {
        PK: `USER#${mockUserId}`,
        SK: 'PRIVACY',
        GSI1PK: 'some-gsi',
        GSI1SK: 'some-sk',
        entity_type: 'USER_PRIVACY',
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends'
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(mockSettings);

      const event = createMockEvent('GET', 'privacy');
      const response = await handler(event);

      const responseBody = JSON.parse(response.body);

      expect(responseBody.data.privacy.PK).toBeUndefined();
      expect(responseBody.data.privacy.SK).toBeUndefined();
      expect(responseBody.data.privacy.GSI1PK).toBeUndefined();
      expect(responseBody.data.privacy.GSI1SK).toBeUndefined();
      expect(responseBody.data.privacy.entity_type).toBeUndefined();
    });
  });
});
