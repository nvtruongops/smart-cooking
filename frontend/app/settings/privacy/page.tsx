/**
 * Privacy Settings Page
 * Manage privacy levels for user data
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  getPrivacySettings,
  updatePrivacySettings,
  PrivacySettings,
  PrivacyLevel,
} from '@/services/privacy';
import PrivacySettingItem from '@/components/privacy/PrivacySettingItem';

export default function PrivacySettingsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [settings, setSettings] = useState<PrivacySettings>({
    profile: 'public',
    email: 'private',
    date_of_birth: 'private',
    cooking_history: 'friends',
    preferences: 'friends',
  });
  const [initialSettings, setInitialSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    loadSettings();
  }, [token, router]);

  const loadSettings = async () => {
    if (!token) return;

    try {
      setLoading(true);
      const result = await getPrivacySettings(token);
      setSettings(result.settings);
      setInitialSettings(result.settings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load privacy settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (field: keyof PrivacySettings, level: PrivacyLevel) => {
    setSettings((prev) => ({
      ...prev,
      [field]: level,
    }));
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!token) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updatePrivacySettings(token, settings);
      setSettings(result.settings);
      setInitialSettings(result.settings);
      setSuccess('Privacy settings saved successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save privacy settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (initialSettings) {
      setSettings(initialSettings);
      setSuccess(null);
      setError(null);
    }
  };

  const hasChanges = initialSettings
    ? JSON.stringify(settings) !== JSON.stringify(initialSettings)
    : false;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Privacy Settings</h1>
          <p className="text-gray-600 mt-2">
            Control who can see your information. Choose between public, friends only, or private
            for each type of data.
          </p>
        </div>

        {/* Info Banner */}
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex gap-3">
            <svg
              className="w-6 h-6 text-yellow-600 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-yellow-900 mb-1">Important Notes</h3>
              <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                <li>
                  <strong>Recipes</strong> are community property and always public when published
                </li>
                <li>
                  <strong>Ingredients</strong> are not stored permanently and have no privacy
                  settings
                </li>
                <li>Your username and basic profile info are always visible to friends</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex gap-2">
              <svg
                className="w-5 h-5 text-green-600 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <p className="text-sm text-green-800">{success}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex gap-2">
              <svg
                className="w-5 h-5 text-red-600 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Privacy Settings */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <PrivacySettingItem
              label="Profile Information"
              description="Your name, bio, and avatar"
              hint="Your username is always visible to other users. This setting controls additional profile details."
              currentLevel={settings.profile}
              onChange={(level) => handleSettingChange('profile', level)}
            />

            <PrivacySettingItem
              label="Email Address"
              description="Your email address"
              hint="We recommend keeping this private. Email is only used for account recovery and notifications."
              currentLevel={settings.email}
              onChange={(level) => handleSettingChange('email', level)}
            />

            <PrivacySettingItem
              label="Date of Birth"
              description="Your birth date"
              hint="Your age must be at least 13 to use this service. Only the visibility of your exact date is controlled here."
              currentLevel={settings.date_of_birth}
              onChange={(level) => handleSettingChange('date_of_birth', level)}
            />

            <PrivacySettingItem
              label="Cooking History"
              description="Your completed cooking sessions and ratings"
              hint="This includes recipes you've cooked and your ratings. Friends can get better recommendations if they can see what you like."
              currentLevel={settings.cooking_history}
              onChange={(level) => handleSettingChange('cooking_history', level)}
            />

            <PrivacySettingItem
              label="Preferences"
              description="Your dietary restrictions, allergies, and favorite cuisines"
              hint="Sharing with friends helps them recommend recipes you'll enjoy. Keep private if you prefer not to share dietary needs."
              currentLevel={settings.preferences}
              onChange={(level) => handleSettingChange('preferences', level)}
            />
          </div>

          {/* Action Buttons */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
            <button
              onClick={handleReset}
              disabled={!hasChanges || saving}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Reset Changes
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Privacy Explanation */}
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Understanding Privacy Levels
          </h2>
          <div className="space-y-4">
            <div className="flex gap-3">
              <span className="text-2xl">🌍</span>
              <div>
                <h3 className="font-semibold text-gray-900">Public</h3>
                <p className="text-sm text-gray-600">
                  Anyone using the app can see this information, even if they&apos;re not your friend.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-2xl">👥</span>
              <div>
                <h3 className="font-semibold text-gray-900">Friends</h3>
                <p className="text-sm text-gray-600">
                  Only users you&apos;ve accepted as friends can see this information.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <h3 className="font-semibold text-gray-900">Private</h3>
                <p className="text-sm text-gray-600">
                  Only you can see this information. Not visible to anyone else.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
