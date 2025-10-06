import {
  checkFriendship,
  createPrivacyContext,
  getUserPrivacySettings,
  hasAccess,
  filterUserProfile,
  filterCookingHistory,
  filterUserPreferences,
  canAccessField
} from './privacy-middleware';
import { DynamoDBHelper } from './dynamodb';
import { PrivacySettings, PrivacyLevel } from './types';

// Mock DynamoDBHelper
jest.mock('./dynamodb');

describe('Privacy Middleware', () => {
  const userId1 = 'user-123';
  const userId2 = 'user-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkFriendship', () => {
    it('should return false for same user', async () => {
      const result = await checkFriendship(userId1, userId1);
      expect(result).toBe(false);
    });

    it('should return true when friendship exists (direct)', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        status: 'accepted'
      });

      const result = await checkFriendship(userId1, userId2);
      expect(result).toBe(true);
      expect(DynamoDBHelper.get).toHaveBeenCalledWith(`USER#${userId1}`, `FRIEND#${userId2}`);
    });

    it('should return true when friendship exists (reverse)', async () => {
      (DynamoDBHelper.get as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: 'accepted' });

      const result = await checkFriendship(userId1, userId2);
      expect(result).toBe(true);
    });

    it('should return false when friendship status is pending', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        status: 'pending'
      });

      const result = await checkFriendship(userId1, userId2);
      expect(result).toBe(false);
    });

    it('should return false when no friendship exists', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);

      const result = await checkFriendship(userId1, userId2);
      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      (DynamoDBHelper.get as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      const result = await checkFriendship(userId1, userId2);
      expect(result).toBe(false);
    });
  });

  describe('createPrivacyContext', () => {
    it('should create context for viewing own data', async () => {
      const context = await createPrivacyContext(userId1, userId1);

      expect(context).toEqual({
        viewerId: userId1,
        targetUserId: userId1,
        isSelf: true,
        isFriend: false
      });
    });

    it('should create context for viewing friend data', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        status: 'accepted'
      });

      const context = await createPrivacyContext(userId1, userId2);

      expect(context).toEqual({
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: true
      });
    });

    it('should create context for viewing non-friend data', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValue(null);

      const context = await createPrivacyContext(userId1, userId2);

      expect(context).toEqual({
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: false
      });
    });
  });

  describe('getUserPrivacySettings', () => {
    it('should return user privacy settings', async () => {
      const mockSettings = {
        PK: `USER#${userId1}`,
        SK: 'PRIVACY',
        profile_visibility: 'friends' as PrivacyLevel,
        email_visibility: 'private' as PrivacyLevel,
        date_of_birth_visibility: 'private' as PrivacyLevel,
        cooking_history_visibility: 'public' as PrivacyLevel,
        preferences_visibility: 'friends' as PrivacyLevel
      };

      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce(mockSettings);

      const result = await getUserPrivacySettings(userId1);

      expect(result).toEqual({
        profile_visibility: 'friends',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends'
      });
    });

    it('should return default privacy settings when none exist', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce(null);

      const result = await getUserPrivacySettings(userId1);

      expect(result).toEqual({
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends'
      });
    });

    it('should return most restrictive settings on error', async () => {
      (DynamoDBHelper.get as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      const result = await getUserPrivacySettings(userId1);

      expect(result).toEqual({
        profile_visibility: 'private',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'private',
        preferences_visibility: 'private'
      });
    });
  });

  describe('hasAccess', () => {
    it('should grant access when viewing own data', () => {
      const context = {
        viewerId: userId1,
        targetUserId: userId1,
        isSelf: true,
        isFriend: false
      };

      expect(hasAccess('private', context)).toBe(true);
      expect(hasAccess('friends', context)).toBe(true);
      expect(hasAccess('public', context)).toBe(true);
    });

    it('should grant access to public data for everyone', () => {
      const context = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: false
      };

      expect(hasAccess('public', context)).toBe(true);
    });

    it('should grant access to friends data for friends only', () => {
      const friendContext = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: true
      };

      const nonFriendContext = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: false
      };

      expect(hasAccess('friends', friendContext)).toBe(true);
      expect(hasAccess('friends', nonFriendContext)).toBe(false);
    });

    it('should deny access to private data for non-owners', () => {
      const context = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: true
      };

      expect(hasAccess('private', context)).toBe(false);
    });
  });

  describe('filterUserProfile', () => {
    const mockProfile = {
      user_id: userId2,
      username: 'testuser',
      email: 'test@example.com',
      full_name: 'Test User',
      date_of_birth: '1990-01-01',
      gender: 'other',
      country: 'Vietnam',
      avatar_url: 'https://example.com/avatar.jpg',
      created_at: '2025-01-01T00:00:00Z'
    };

    it('should return full profile when viewing own data', async () => {
      const context = {
        viewerId: userId2,
        targetUserId: userId2,
        isSelf: true,
        isFriend: false
      };

      const result = await filterUserProfile(mockProfile, context);

      expect(result).toEqual(mockProfile);
    });

    it('should filter profile based on privacy settings for non-friends', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        profile_visibility: 'friends',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends'
      });

      const context = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: false
      };

      const result = await filterUserProfile(mockProfile, context);

      expect(result).toEqual({
        user_id: userId2,
        username: 'testuser'
      });
    });

    it('should show more fields to friends based on privacy settings', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        profile_visibility: 'friends',
        email_visibility: 'friends',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends'
      });

      const context = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: true
      };

      const result = await filterUserProfile(mockProfile, context);

      expect(result.user_id).toBe(userId2);
      expect(result.username).toBe('testuser');
      expect(result.email).toBe('test@example.com');
      expect(result.full_name).toBe('Test User');
      expect(result.date_of_birth).toBeUndefined(); // private
    });

    it('should show all public fields when profile is public', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'public',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends'
      });

      const context = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: false
      };

      const result = await filterUserProfile(mockProfile, context);

      expect(result.user_id).toBe(userId2);
      expect(result.username).toBe('testuser');
      expect(result.full_name).toBe('Test User');
      expect(result.date_of_birth).toBe('1990-01-01');
      expect(result.email).toBeUndefined(); // private
    });
  });

  describe('filterCookingHistory', () => {
    const mockHistory = [
      { session_id: '1', recipe_id: 'recipe-1', status: 'completed' },
      { session_id: '2', recipe_id: 'recipe-2', status: 'cooking' }
    ];

    it('should return full history when viewing own data', async () => {
      const context = {
        viewerId: userId1,
        targetUserId: userId1,
        isSelf: true,
        isFriend: false
      };

      const result = await filterCookingHistory(mockHistory, context);

      expect(result).toEqual(mockHistory);
    });

    it('should return history when privacy allows', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        cooking_history_visibility: 'public',
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        preferences_visibility: 'friends'
      });

      const context = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: false
      };

      const result = await filterCookingHistory(mockHistory, context);

      expect(result).toEqual(mockHistory);
    });

    it('should return empty array when privacy denies access', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        cooking_history_visibility: 'private',
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        preferences_visibility: 'friends'
      });

      const context = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: true
      };

      const result = await filterCookingHistory(mockHistory, context);

      expect(result).toEqual([]);
    });
  });

  describe('filterUserPreferences', () => {
    const mockPreferences = {
      dietary_restrictions: ['vegetarian'],
      allergies: ['peanuts'],
      favorite_cuisines: ['Vietnamese'],
      preferred_cooking_methods: ['stir-fry']
    };

    it('should return preferences when viewing own data', async () => {
      const context = {
        viewerId: userId1,
        targetUserId: userId1,
        isSelf: true,
        isFriend: false
      };

      const result = await filterUserPreferences(mockPreferences, context);

      expect(result).toEqual(mockPreferences);
    });

    it('should return preferences when privacy allows', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        preferences_visibility: 'friends',
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public'
      });

      const context = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: true
      };

      const result = await filterUserPreferences(mockPreferences, context);

      expect(result).toEqual(mockPreferences);
    });

    it('should return null when privacy denies access', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        preferences_visibility: 'private',
        profile_visibility: 'public',
        email_visibility: 'private',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public'
      });

      const context = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: true
      };

      const result = await filterUserPreferences(mockPreferences, context);

      expect(result).toBeNull();
    });
  });

  describe('canAccessField', () => {
    it('should return true when viewing own data', async () => {
      const context = {
        viewerId: userId1,
        targetUserId: userId1,
        isSelf: true,
        isFriend: false
      };

      const result = await canAccessField('email_visibility', context);

      expect(result).toBe(true);
    });

    it('should check privacy settings for specific field', async () => {
      (DynamoDBHelper.get as jest.Mock).mockResolvedValueOnce({
        profile_visibility: 'public',
        email_visibility: 'friends',
        date_of_birth_visibility: 'private',
        cooking_history_visibility: 'public',
        preferences_visibility: 'friends'
      });

      const friendContext = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: true
      };

      const nonFriendContext = {
        viewerId: userId1,
        targetUserId: userId2,
        isSelf: false,
        isFriend: false
      };

      expect(await canAccessField('email_visibility', friendContext)).toBe(true);
      expect(await canAccessField('email_visibility', nonFriendContext)).toBe(false);
      expect(await canAccessField('date_of_birth_visibility', friendContext)).toBe(false);
    });
  });
});
