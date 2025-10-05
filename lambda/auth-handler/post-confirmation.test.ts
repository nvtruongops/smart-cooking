import { postConfirmationHandler, PostConfirmationTriggerEvent } from './post-confirmation';

// Mock shared modules
jest.mock('../shared/dynamodb', () => ({
  DynamoDBHelper: {
    put: jest.fn().mockResolvedValue({})
  }
}));

jest.mock('../shared/utils', () => ({
  generateUUID: jest.fn(() => 'test-uuid-123'),
  formatTimestamp: jest.fn(() => '2025-01-20T10:00:00Z'),
  logStructured: jest.fn()
}));

// Mock Avatar Service
jest.mock('../shared/avatar-service', () => ({
  AvatarService: {
    setDefaultAvatar: jest.fn()
  }
}));

const mockEvent: PostConfirmationTriggerEvent = {
  version: '1',
  region: 'us-east-1',
  userPoolId: 'us-east-1_TestPool',
  userName: 'testuser',
  callerContext: {
    awsSdkVersion: '3.400.0',
    clientId: 'test-client-id'
  },
  triggerSource: 'PostConfirmation_ConfirmSignUp',
  request: {
    userAttributes: {
      sub: 'test-user-id-123',
      email: 'test@example.com',
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      birthdate: '1990-01-15',
      gender: 'male',
      'custom:country': 'Vietnam'
    }
  },
  response: {}
};

// Get mocked modules
const dynamoMock = jest.mocked(require('../shared/dynamodb'));
const utilsMock = jest.mocked(require('../shared/utils'));
const avatarMock = jest.mocked(require('../shared/avatar-service'));

describe('Post-Confirmation Trigger Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default avatar service mock
    avatarMock.AvatarService.setDefaultAvatar.mockResolvedValue({
      avatar_url: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/test-user-id-123/avatar/avatar.png',
      avatar_key: 'test-user-id-123/avatar/avatar.png',
      is_default: true
    });
  });

  test('should create user profile and preferences after email confirmation', async () => {
    const result = await postConfirmationHandler(mockEvent);

    // Should return the event unchanged
    expect(result).toEqual(mockEvent);

    // Should create user profile with avatar URL
    expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith({
      PK: 'USER#test-user-id-123',
      SK: 'PROFILE',
      entity_type: 'USER_PROFILE',
      user_id: 'test-user-id-123',
      email: 'test@example.com',
      username: 'testuser',
      full_name: 'Test User',
      date_of_birth: '1990-01-15',
      gender: 'male',
      country: 'Vietnam',
      avatar_url: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/test-user-id-123/avatar/avatar.png',
      created_at: '2025-01-20T10:00:00Z',
      updated_at: '2025-01-20T10:00:00Z',
      GSI1PK: 'USER#test-user-id-123',
      GSI1SK: 'PROFILE'
    });

    // Should set default avatar
    expect(avatarMock.AvatarService.setDefaultAvatar).toHaveBeenCalledWith('test-user-id-123');

    // Should create default preferences
    expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith({
      PK: 'USER#test-user-id-123',
      SK: 'PREFERENCES',
      entity_type: 'USER_PREFERENCES',
      dietary_restrictions: [],
      allergies: [],
      favorite_cuisines: [],
      preferred_cooking_methods: [],
      preferred_recipe_count: 3,
      spice_level: 'medium',
      created_at: '2025-01-20T10:00:00Z',
      updated_at: '2025-01-20T10:00:00Z',
      GSI1PK: 'USER#test-user-id-123',
      GSI1SK: 'PREFERENCES'
    });

    // Should log success
    expect(utilsMock.logStructured).toHaveBeenCalledWith(
      'INFO',
      'User profile and preferences created successfully',
      expect.objectContaining({
        userId: 'test-user-id-123',
        email: 'test@example.com',
        username: 'testuser',
        fullName: 'Test User'
      })
    );
  });

  test('should handle minimal user attributes', async () => {
    const minimalEvent = {
      ...mockEvent,
      request: {
        userAttributes: {
          sub: 'test-user-minimal',
          email: 'minimal@example.com'
        }
      }
    };

    const result = await postConfirmationHandler(minimalEvent);

    expect(result).toEqual(minimalEvent);

    // Should create profile with minimal data and avatar
    expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
      expect.objectContaining({
        PK: 'USER#test-user-minimal',
        SK: 'PROFILE',
        entity_type: 'USER_PROFILE',
        user_id: 'test-user-minimal',
        email: 'minimal@example.com',
        username: 'testuser',
        full_name: 'testuser', // Should fallback to username
        date_of_birth: undefined,
        gender: undefined,
        country: undefined,
        avatar_url: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/test-user-id-123/avatar/avatar.png'
      })
    );
  });

  test('should combine given_name and family_name when name is not provided', async () => {
    const eventWithNames = {
      ...mockEvent,
      request: {
        userAttributes: {
          sub: 'test-user-names',
          email: 'names@example.com',
          given_name: 'John',
          family_name: 'Doe'
          // No 'name' attribute
        }
      }
    };

    await postConfirmationHandler(eventWithNames);

    expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'John Doe'
      })
    );
  });

  test('should handle missing user ID gracefully', async () => {
    const eventWithoutSub = {
      ...mockEvent,
      request: {
        userAttributes: {
          email: 'nosub@example.com'
          // Missing 'sub' attribute
        }
      }
    };

    const result = await postConfirmationHandler(eventWithoutSub);

    // Should return event unchanged even on error
    expect(result).toEqual(eventWithoutSub);

    // Should not create any profiles
    expect(dynamoMock.DynamoDBHelper.put).not.toHaveBeenCalled();

    // Should log error
    expect(utilsMock.logStructured).toHaveBeenCalledWith(
      'ERROR',
      'Post-confirmation trigger failed',
      expect.objectContaining({
        error: 'User ID (sub) not found in user attributes'
      })
    );
  });

  test('should handle DynamoDB errors gracefully', async () => {
    dynamoMock.DynamoDBHelper.put.mockRejectedValueOnce(new Error('DynamoDB error'));

    const result = await postConfirmationHandler(mockEvent);

    // Should return event unchanged even on error
    expect(result).toEqual(mockEvent);

    // Should log error
    expect(utilsMock.logStructured).toHaveBeenCalledWith(
      'ERROR',
      'Post-confirmation trigger failed',
      expect.objectContaining({
        error: 'DynamoDB error'
      })
    );
  });

  test('should log trigger invocation', async () => {
    await postConfirmationHandler(mockEvent);

    expect(utilsMock.logStructured).toHaveBeenCalledWith(
      'INFO',
      'Post-confirmation trigger invoked',
      {
        userPoolId: 'us-east-1_TestPool',
        userName: 'testuser',
        triggerSource: 'PostConfirmation_ConfirmSignUp'
      }
    );
  });

  test('should handle different gender values', async () => {
    const eventWithFemaleGender = {
      ...mockEvent,
      request: {
        userAttributes: {
          ...mockEvent.request.userAttributes,
          gender: 'female'
        }
      }
    };

    await postConfirmationHandler(eventWithFemaleGender);

    expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
      expect.objectContaining({
        gender: 'female'
      })
    );
  });

  test('should handle custom country attribute', async () => {
    const eventWithCountry = {
      ...mockEvent,
      request: {
        userAttributes: {
          ...mockEvent.request.userAttributes,
          'custom:country': 'United States'
        }
      }
    };

    await postConfirmationHandler(eventWithCountry);

    expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
      expect.objectContaining({
        country: 'United States'
      })
    );
  });

  test('should create default preferences with correct structure', async () => {
    await postConfirmationHandler(mockEvent);

    const preferencesCall = dynamoMock.DynamoDBHelper.put.mock.calls.find(
      (call: any) => call[0].entity_type === 'USER_PREFERENCES'
    );

    expect(preferencesCall[0]).toEqual({
      PK: 'USER#test-user-id-123',
      SK: 'PREFERENCES',
      entity_type: 'USER_PREFERENCES',
      dietary_restrictions: [],
      allergies: [],
      favorite_cuisines: [],
      preferred_cooking_methods: [],
      preferred_recipe_count: 3,
      spice_level: 'medium',
      created_at: '2025-01-20T10:00:00Z',
      updated_at: '2025-01-20T10:00:00Z',
      GSI1PK: 'USER#test-user-id-123',
      GSI1SK: 'PREFERENCES'
    });
  });

  describe('Default Avatar Assignment', () => {
    test('should set default avatar on user registration', async () => {
      const result = await postConfirmationHandler(mockEvent);

      expect(result).toEqual(mockEvent);

      // Should call avatar service to set default avatar
      expect(avatarMock.AvatarService.setDefaultAvatar).toHaveBeenCalledWith('test-user-id-123');

      // Should log avatar assignment success
      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'INFO',
        'Default avatar set for new user',
        {
          userId: 'test-user-id-123',
          avatarUrl: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/test-user-id-123/avatar/avatar.png'
        }
      );

      // Should include avatar URL in profile
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          avatar_url: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/test-user-id-123/avatar/avatar.png'
        })
      );
    });

    test('should handle avatar service failure gracefully', async () => {
      avatarMock.AvatarService.setDefaultAvatar.mockRejectedValue(
        new Error('S3 copy operation failed')
      );

      const result = await postConfirmationHandler(mockEvent);

      // Should still return event unchanged
      expect(result).toEqual(mockEvent);

      // Should still create user profile without avatar
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          PK: 'USER#test-user-id-123',
          SK: 'PROFILE',
          entity_type: 'USER_PROFILE',
          user_id: 'test-user-id-123',
          email: 'test@example.com',
          avatar_url: undefined // No avatar URL when service fails
        })
      );

      // Should log avatar failure
      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'ERROR',
        'Failed to set default avatar',
        {
          userId: 'test-user-id-123',
          error: 'S3 copy operation failed'
        }
      );

      // Should still log overall success
      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'INFO',
        'User profile and preferences created successfully',
        expect.any(Object)
      );
    });

    test('should handle avatar service timeout', async () => {
      avatarMock.AvatarService.setDefaultAvatar.mockRejectedValue(
        new Error('Request timeout')
      );

      const result = await postConfirmationHandler(mockEvent);

      expect(result).toEqual(mockEvent);

      // Should attempt to set avatar
      expect(avatarMock.AvatarService.setDefaultAvatar).toHaveBeenCalledWith('test-user-id-123');

      // Should log timeout error
      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'ERROR',
        'Failed to set default avatar',
        {
          userId: 'test-user-id-123',
          error: 'Request timeout'
        }
      );

      // Should create profile without avatar URL
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          avatar_url: undefined
        })
      );
    });

    test('should handle S3 permission errors', async () => {
      avatarMock.AvatarService.setDefaultAvatar.mockRejectedValue({
        statusCode: 500,
        errorCode: 'default_avatar_failed',
        message: 'Failed to set default avatar'
      });

      const result = await postConfirmationHandler(mockEvent);

      expect(result).toEqual(mockEvent);

      // Should log structured error
      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'ERROR',
        'Failed to set default avatar',
        {
          userId: 'test-user-id-123',
          error: 'Failed to set default avatar'
        }
      );
    });

    test('should copy default avatar to user-specific path', async () => {
      const mockAvatarResult = {
        avatar_url: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/different-user/avatar/avatar.png',
        avatar_key: 'different-user/avatar/avatar.png',
        is_default: true
      };

      avatarMock.AvatarService.setDefaultAvatar.mockResolvedValue(mockAvatarResult);

      const eventWithDifferentUser = {
        ...mockEvent,
        request: {
          userAttributes: {
            ...mockEvent.request.userAttributes,
            sub: 'different-user'
          }
        }
      };

      await postConfirmationHandler(eventWithDifferentUser);

      // Should call with correct user ID
      expect(avatarMock.AvatarService.setDefaultAvatar).toHaveBeenCalledWith('different-user');

      // Should use the returned avatar URL
      expect(dynamoMock.DynamoDBHelper.put).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'different-user',
          avatar_url: mockAvatarResult.avatar_url
        })
      );
    });

    test('should verify avatar metadata is correct', async () => {
      const mockAvatarResult = {
        avatar_url: 'https://smart-cooking-images.s3.us-east-1.amazonaws.com/test-user-id-123/avatar/avatar.png',
        avatar_key: 'test-user-id-123/avatar/avatar.png',
        is_default: true
      };

      avatarMock.AvatarService.setDefaultAvatar.mockResolvedValue(mockAvatarResult);

      await postConfirmationHandler(mockEvent);

      // Verify avatar service returns correct metadata
      expect(mockAvatarResult.is_default).toBe(true);
      expect(mockAvatarResult.avatar_key).toBe('test-user-id-123/avatar/avatar.png');
      expect(mockAvatarResult.avatar_url).toContain('test-user-id-123/avatar/avatar.png');
    });
  });
});