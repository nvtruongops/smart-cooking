// Cognito Post-Confirmation Trigger Event Types
export interface PostConfirmationTriggerEvent {
  version: string;
  region: string;
  userPoolId: string;
  userName: string;
  callerContext: {
    awsSdkVersion: string;
    clientId: string;
  };
  triggerSource: 'PostConfirmation_ConfirmSignUp' | 'PostConfirmation_ConfirmForgotPassword';
  request: {
    userAttributes: { [key: string]: string };
    clientMetadata?: { [key: string]: string };
  };
  response: {};
}

export type PostConfirmationTriggerHandler = (event: PostConfirmationTriggerEvent) => Promise<PostConfirmationTriggerEvent>;
import { DynamoDBHelper } from '../shared/dynamodb';
import { AvatarService } from '../shared/avatar-service';
import { UserProfile } from '../shared/types';
import { generateUUID, formatTimestamp, logStructured } from '../shared/utils';

/**
 * Cognito Post-Confirmation Trigger Handler
 * This function is triggered automatically when a user confirms their email
 * It creates a user profile in DynamoDB with basic information from Cognito
 */
export const postConfirmationHandler: PostConfirmationTriggerHandler = async (
  event: PostConfirmationTriggerEvent
) => {
  try {
    logStructured('INFO', 'Post-confirmation trigger invoked', {
      userPoolId: event.userPoolId,
      userName: event.userName,
      triggerSource: event.triggerSource
    });

    const { userPoolId, userName, request } = event;
    const { userAttributes } = request;

    // Extract user information from Cognito attributes
    const userId = userAttributes.sub;
    const email = userAttributes.email || '';
    const username = userName;

    // Combine names with proper priority:
    // 1. Use 'name' attribute if available
    // 2. Combine given_name and family_name if both exist
    // 3. Use given_name alone if no family_name
    // 4. Use family_name alone if no given_name
    // 5. Fallback to username
    const combinedFullName =
      userAttributes.name ||
      (userAttributes.given_name && userAttributes.family_name
        ? `${userAttributes.given_name} ${userAttributes.family_name}`.trim()
        : userAttributes.given_name || userAttributes.family_name || username);

    if (!userId) {
      throw new Error('User ID (sub) not found in user attributes');
    }

    const now = formatTimestamp();

    // Set default avatar for new user
    let avatarUrl: string | undefined;
    try {
      const avatarResult = await AvatarService.setDefaultAvatar(userId);
      avatarUrl = avatarResult.avatar_url;
      logStructured('INFO', 'Default avatar set for new user', {
        userId,
        avatarUrl
      });
    } catch (error: any) {
      logStructured('ERROR', 'Failed to set default avatar', {
        userId,
        error: error.message
      });
      // Don't fail user creation if avatar fails
    }

    // Create user profile data
    const profileData: UserProfile = {
      user_id: userId,
      email: email,
      username: username,
      full_name: combinedFullName,
      date_of_birth: userAttributes.birthdate || undefined,
      gender: userAttributes.gender as 'male' | 'female' | 'other' || undefined,
      country: userAttributes['custom:country'] || undefined,
      avatar_url: avatarUrl,
      created_at: now,
      updated_at: now
    };

    // Save user profile to DynamoDB
    await DynamoDBHelper.put({
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      entity_type: 'USER_PROFILE',
      ...profileData,
      GSI1PK: `USER#${userId}`, // For user-based queries
      GSI1SK: 'PROFILE'
    });

    // Create default user preferences
    const defaultPreferences = {
      dietary_restrictions: [],
      allergies: [],
      favorite_cuisines: [],
      preferred_cooking_methods: [],
      preferred_recipe_count: 3,
      spice_level: 'medium' as const
    };

    await DynamoDBHelper.put({
      PK: `USER#${userId}`,
      SK: 'PREFERENCES',
      entity_type: 'USER_PREFERENCES',
      ...defaultPreferences,
      created_at: now,
      updated_at: now,
      GSI1PK: `USER#${userId}`,
      GSI1SK: 'PREFERENCES'
    });

    logStructured('INFO', 'User profile and preferences created successfully', {
      userId,
      email,
      username,
      fullName: combinedFullName
    });

    // Return the event unchanged (required for Cognito triggers)
    return event;

  } catch (error: any) {
    logStructured('ERROR', 'Post-confirmation trigger failed', {
      error: error.message,
      stack: error.stack,
      userName: event.userName
    });

    // For post-confirmation triggers, we should not throw errors as it would
    // prevent the user from being confirmed. Instead, log the error and continue.
    // The user profile can be created later through the API if needed.
    return event;
  }
};