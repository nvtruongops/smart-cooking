import { APIGatewayEvent, APIResponse, UserProfile, UserPreferences } from '../shared/types';
import { successResponse, errorResponse, handleError, AppError } from '../shared/responses';
import { DynamoDBHelper } from '../shared/dynamodb';
import { AvatarService } from '../shared/avatar-service';
import {
  sanitizeInput,
  formatTimestamp,
  parseJSON,
  logStructured,
  getUserIdFromEvent,
  validateAge,
  extractBirthYear
} from '../shared/utils';
import { logger } from '../shared/logger';
import { metrics } from '../shared/metrics';
import { tracer } from '../shared/tracer';

export const handler = async (event: APIGatewayEvent): Promise<APIResponse> => {
  const startTime = Date.now();
  
  // Initialize logger with request context
  logger.initFromEvent(event);
  logger.logFunctionStart('user-profile', event);

  try {
    const { httpMethod, pathParameters } = event;
    const userId = getUserIdFromEvent(event);

    // Set X-Ray user context
    tracer.setUser(userId);

    logger.info('User profile handler invoked', {
      httpMethod,
      path: event.path,
      userId,
      pathParameters
    });

    switch (httpMethod) {
      case 'GET':
        if (pathParameters?.type === 'preferences') {
          return await getPreferences(userId);
        }
        return await getProfile(userId);
      
      case 'PUT':
        if (pathParameters?.type === 'preferences') {
          return await updatePreferences(userId, event.body);
        }
        return await updateProfile(userId, event.body);
      
      case 'POST':
        if (pathParameters?.type === 'preferences') {
          return await createPreferences(userId, event.body);
        }
        if (pathParameters?.type === 'avatar') {
          return await uploadAvatar(userId, event.body);
        }
        return await createProfile(userId, event.body);
      
      default:
        throw new AppError(405, 'method_not_allowed', 'Method not allowed');
    }

  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('User profile handler error', error, { duration });
    metrics.trackApiRequest(500, duration, 'user-profile');
    logger.logFunctionEnd('user-profile', 500, duration);
    return handleError(error);
  } finally {
    // Flush metrics and log function end
    const duration = Date.now() - startTime;
    logger.logFunctionEnd('user-profile', 200, duration);
    await metrics.flush();
  }
};

async function getProfile(userId: string): Promise<APIResponse> {
  try {
    const profile = await DynamoDBHelper.getUserProfile(userId);
    
    if (!profile) {
      throw new AppError(404, 'profile_not_found', 'User profile not found');
    }

    // Remove DynamoDB keys from response
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...cleanProfile } = profile;

    return successResponse({
      profile: cleanProfile
    });

  } catch (error: any) {
    logStructured('ERROR', 'Get profile failed', { error: error.message, userId });
    throw error;
  }
}

async function updateProfile(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const data = parseJSON(body);
  const { full_name, date_of_birth, gender, country, avatar_url } = data;

  // Validate inputs
  const updates: any = {};
  
  if (full_name !== undefined) {
    if (typeof full_name !== 'string' || full_name.trim().length === 0) {
      throw new AppError(400, 'invalid_full_name', 'Full name must be a non-empty string');
    }
    updates.full_name = sanitizeInput(full_name, 100);
  }

  if (date_of_birth !== undefined) {
    if (!validateAge(date_of_birth)) {
      throw new AppError(400, 'invalid_age', 'User must be at least 13 years old');
    }
    updates.date_of_birth = date_of_birth;
  }

  if (gender !== undefined) {
    if (!['male', 'female', 'other'].includes(gender)) {
      throw new AppError(400, 'invalid_gender', 'Gender must be male, female, or other');
    }
    updates.gender = gender;
  }

  if (country !== undefined) {
    if (typeof country !== 'string' || country.length !== 2) {
      throw new AppError(400, 'invalid_country', 'Country must be a 2-letter country code');
    }
    updates.country = country.toUpperCase();
  }

  if (avatar_url !== undefined) {
    if (typeof avatar_url !== 'string') {
      throw new AppError(400, 'invalid_avatar_url', 'Avatar URL must be a string');
    }
    updates.avatar_url = sanitizeInput(avatar_url, 500);
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(400, 'no_updates', 'No valid fields to update');
  }

  try {
    // Check if profile exists
    const existingProfile = await DynamoDBHelper.getUserProfile(userId);
    if (!existingProfile) {
      throw new AppError(404, 'profile_not_found', 'User profile not found');
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    Object.entries(updates).forEach(([key, value], index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      
      updateExpressions.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = value;
    });

    // Add updated_at timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updated_at';
    expressionAttributeValues[':updatedAt'] = formatTimestamp();

    const updateExpression = `SET ${updateExpressions.join(', ')}`;

    const updatedProfile = await DynamoDBHelper.update(
      `USER#${userId}`,
      'PROFILE',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    // Remove DynamoDB keys from response
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...cleanProfile } = updatedProfile || {};

    logStructured('INFO', 'Profile updated successfully', { userId, updatedFields: Object.keys(updates) });

    return successResponse({
      message: 'Profile updated successfully',
      profile: cleanProfile
    });

  } catch (error: any) {
    logStructured('ERROR', 'Update profile failed', { error: error.message, userId });
    throw error;
  }
}

async function createProfile(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const data = parseJSON(body);
  const { email, username, full_name, date_of_birth, gender, country, avatar_url } = data;

  // Validate required fields
  if (!email || !username || !full_name) {
    throw new AppError(400, 'missing_required_fields', 'Email, username, and full_name are required');
  }

  // Validate inputs
  const profileData: any = {
    user_id: userId,
    email: sanitizeInput(email, 100),
    username: sanitizeInput(username, 50),
    full_name: sanitizeInput(full_name, 100),
    created_at: formatTimestamp(),
    updated_at: formatTimestamp()
  };

  if (date_of_birth) {
    if (!validateAge(date_of_birth)) {
      throw new AppError(400, 'invalid_age', 'User must be at least 13 years old');
    }
    profileData.date_of_birth = date_of_birth;
  }

  if (gender) {
    if (!['male', 'female', 'other'].includes(gender)) {
      throw new AppError(400, 'invalid_gender', 'Gender must be male, female, or other');
    }
    profileData.gender = gender;
  }

  if (country) {
    if (typeof country !== 'string' || country.length !== 2) {
      throw new AppError(400, 'invalid_country', 'Country must be a 2-letter country code');
    }
    profileData.country = country.toUpperCase();
  }

  if (avatar_url) {
    profileData.avatar_url = sanitizeInput(avatar_url, 500);
  }

  try {
    // Check if profile already exists
    const existingProfile = await DynamoDBHelper.getUserProfile(userId);
    if (existingProfile) {
      throw new AppError(409, 'profile_exists', 'User profile already exists');
    }

    // Save to DynamoDB
    await DynamoDBHelper.put({
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      entity_type: 'USER_PROFILE',
      ...profileData
    });

    logStructured('INFO', 'Profile created successfully', { userId, email, username });

    return successResponse({
      message: 'Profile created successfully',
      profile: profileData
    }, 201);

  } catch (error: any) {
    logStructured('ERROR', 'Create profile failed', { error: error.message, userId });
    throw error;
  }
}

async function getPreferences(userId: string): Promise<APIResponse> {
  try {
    const preferences = await DynamoDBHelper.getUserPreferences(userId);
    
    if (!preferences) {
      // Return default preferences if none exist
      const defaultPreferences: UserPreferences = {
        dietary_restrictions: [],
        allergies: [],
        favorite_cuisines: [],
        preferred_cooking_methods: []
      };

      return successResponse({
        preferences: defaultPreferences,
        isDefault: true
      });
    }

    // Remove DynamoDB keys from response
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...cleanPreferences } = preferences;

    return successResponse({
      preferences: cleanPreferences,
      isDefault: false
    });

  } catch (error: any) {
    logStructured('ERROR', 'Get preferences failed', { error: error.message, userId });
    throw error;
  }
}

async function createPreferences(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const data = parseJSON(body);
  const { 
    dietary_restrictions = [], 
    allergies = [], 
    favorite_cuisines = [], 
    preferred_cooking_methods = [],
    preferred_recipe_count = 3,
    spice_level = 'medium'
  } = data;

  // Validate arrays
  if (!Array.isArray(dietary_restrictions) || !Array.isArray(allergies) || 
      !Array.isArray(favorite_cuisines) || !Array.isArray(preferred_cooking_methods)) {
    throw new AppError(400, 'invalid_arrays', 'Preferences must be arrays');
  }

  // Validate spice level
  if (!['mild', 'medium', 'hot'].includes(spice_level)) {
    throw new AppError(400, 'invalid_spice_level', 'Spice level must be mild, medium, or hot');
  }

  // Validate recipe count
  if (!Number.isInteger(preferred_recipe_count) || preferred_recipe_count < 1 || preferred_recipe_count > 5) {
    throw new AppError(400, 'invalid_recipe_count', 'Preferred recipe count must be between 1 and 5');
  }

  const preferencesData: UserPreferences = {
    dietary_restrictions: dietary_restrictions.map((item: string) => sanitizeInput(item, 50)),
    allergies: allergies.map((item: string) => sanitizeInput(item, 50)),
    favorite_cuisines: favorite_cuisines.map((item: string) => sanitizeInput(item, 50)),
    preferred_cooking_methods: preferred_cooking_methods.map((item: string) => sanitizeInput(item, 50)),
    preferred_recipe_count,
    spice_level
  };

  try {
    // Check if preferences already exist
    const existingPreferences = await DynamoDBHelper.getUserPreferences(userId);
    if (existingPreferences) {
      throw new AppError(409, 'preferences_exist', 'User preferences already exist. Use PUT to update.');
    }

    // Save to DynamoDB
    await DynamoDBHelper.put({
      PK: `USER#${userId}`,
      SK: 'PREFERENCES',
      entity_type: 'USER_PREFERENCES',
      created_at: formatTimestamp(),
      updated_at: formatTimestamp(),
      ...preferencesData
    });

    logStructured('INFO', 'Preferences created successfully', { userId });

    return successResponse({
      message: 'Preferences created successfully',
      preferences: preferencesData
    }, 201);

  } catch (error: any) {
    logStructured('ERROR', 'Create preferences failed', { error: error.message, userId });
    throw error;
  }
}

async function updatePreferences(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const data = parseJSON(body);
  const updates: any = {};

  // Validate and prepare updates
  if (data.dietary_restrictions !== undefined) {
    if (!Array.isArray(data.dietary_restrictions)) {
      throw new AppError(400, 'invalid_dietary_restrictions', 'Dietary restrictions must be an array');
    }
    updates.dietary_restrictions = data.dietary_restrictions.map((item: string) => sanitizeInput(item, 50));
  }

  if (data.allergies !== undefined) {
    if (!Array.isArray(data.allergies)) {
      throw new AppError(400, 'invalid_allergies', 'Allergies must be an array');
    }
    updates.allergies = data.allergies.map((item: string) => sanitizeInput(item, 50));
  }

  if (data.favorite_cuisines !== undefined) {
    if (!Array.isArray(data.favorite_cuisines)) {
      throw new AppError(400, 'invalid_favorite_cuisines', 'Favorite cuisines must be an array');
    }
    updates.favorite_cuisines = data.favorite_cuisines.map((item: string) => sanitizeInput(item, 50));
  }

  if (data.preferred_cooking_methods !== undefined) {
    if (!Array.isArray(data.preferred_cooking_methods)) {
      throw new AppError(400, 'invalid_preferred_cooking_methods', 'Preferred cooking methods must be an array');
    }
    updates.preferred_cooking_methods = data.preferred_cooking_methods.map((item: string) => sanitizeInput(item, 50));
  }

  if (data.preferred_recipe_count !== undefined) {
    if (!Number.isInteger(data.preferred_recipe_count) || data.preferred_recipe_count < 1 || data.preferred_recipe_count > 5) {
      throw new AppError(400, 'invalid_recipe_count', 'Preferred recipe count must be between 1 and 5');
    }
    updates.preferred_recipe_count = data.preferred_recipe_count;
  }

  if (data.spice_level !== undefined) {
    if (!['mild', 'medium', 'hot'].includes(data.spice_level)) {
      throw new AppError(400, 'invalid_spice_level', 'Spice level must be mild, medium, or hot');
    }
    updates.spice_level = data.spice_level;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(400, 'no_updates', 'No valid fields to update');
  }

  try {
    // Check if preferences exist
    const existingPreferences = await DynamoDBHelper.getUserPreferences(userId);
    if (!existingPreferences) {
      throw new AppError(404, 'preferences_not_found', 'User preferences not found. Use POST to create.');
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    Object.entries(updates).forEach(([key, value], index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      
      updateExpressions.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = value;
    });

    // Add updated_at timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updated_at';
    expressionAttributeValues[':updatedAt'] = formatTimestamp();

    const updateExpression = `SET ${updateExpressions.join(', ')}`;

    const updatedPreferences = await DynamoDBHelper.update(
      `USER#${userId}`,
      'PREFERENCES',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    // Remove DynamoDB keys from response
    const { PK, SK, GSI1PK, GSI1SK, entity_type, created_at, updated_at, ...cleanPreferences } = updatedPreferences || {};

    logStructured('INFO', 'Preferences updated successfully', { userId, updatedFields: Object.keys(updates) });

    return successResponse({
      message: 'Preferences updated successfully',
      preferences: cleanPreferences
    });

  } catch (error: any) {
    logStructured('ERROR', 'Update preferences failed', { error: error.message, userId });
    throw error;
  }
}

/**
 * Upload avatar image to S3
 * POST /user/avatar
 */
async function uploadAvatar(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const data = parseJSON(body);
  const { image_data, content_type } = data;

  if (!image_data || !content_type) {
    throw new AppError(400, 'missing_fields', 'image_data and content_type are required');
  }

  try {
    // Upload avatar to S3
    const result = await AvatarService.uploadAvatar({
      user_id: userId,
      image_data,
      content_type
    });

    // Update user profile with new avatar URL
    await DynamoDBHelper.update(
      `USER#${userId}`,
      'PROFILE',
      'SET avatar_url = :avatar_url, updated_at = :updated_at',
      {
        ':avatar_url': result.avatar_url,
        ':updated_at': formatTimestamp()
      }
    );

    logStructured('INFO', 'Avatar uploaded successfully', {
      userId,
      avatarUrl: result.avatar_url,
      isDefault: result.is_default
    });

    return successResponse({
      message: 'Avatar uploaded successfully',
      avatar_url: result.avatar_url
    });

  } catch (error: any) {
    logStructured('ERROR', 'Upload avatar failed', { error: error.message, userId });
    throw error;
  }
}