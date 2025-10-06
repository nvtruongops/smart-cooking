/**
 * Create Post Form Component
 * Form to create new posts with text, image, and recipe
 * Task 17.2 - Pre-fill form with recipe information when shared
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { createPost, uploadPostImage } from '@/services/posts';

interface CreatePostFormProps {
  onPostCreated?: () => void;
}

export default function CreatePostForm({ onPostCreated }: CreatePostFormProps) {
  const { token, user } = useAuth();
  const searchParams = useSearchParams();
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState('');
  const [recipeTitle, setRecipeTitle] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'private'>('friends');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for shared recipe or cooking session on mount (Task 17.2, 17.3)
  useEffect(() => {
    const shareType = searchParams?.get('share');
    
    // Handle recipe sharing (Task 17.2)
    if (shareType === 'recipe') {
      const sharedRecipe = sessionStorage.getItem('share_recipe');
      if (!sharedRecipe) return;

      try {
        const recipeData = JSON.parse(sharedRecipe);
        
        // Pre-fill form with recipe data
        setRecipeId(recipeData.recipe_id);
        setRecipeTitle(recipeData.title);
        
        // Pre-fill content with recipe mention
        const prefilledContent = `Just found this amazing recipe: "${recipeData.title}"! 🍳\n\n${
          recipeData.description || ''
        }`;
        setContent(prefilledContent);

        // Set image preview if recipe has image
        if (recipeData.image) {
          setImagePreview(recipeData.image);
        }

        // Clear sessionStorage after using
        sessionStorage.removeItem('share_recipe');
      } catch (err) {
        console.error('Failed to parse shared recipe:', err);
      }
    }
    
    // Handle cooking session sharing (Task 17.3)
    if (shareType === 'cooking') {
      const sharedSession = sessionStorage.getItem('share_cooking_session');
      if (!sharedSession) return;

      try {
        const sessionData = JSON.parse(sharedSession);
        
        // Pre-fill form with cooking session data
        setRecipeId(sessionData.recipe_id);
        setRecipeTitle(sessionData.recipe_title);
        
        // Build star rating display
        const stars = sessionData.rating ? '⭐'.repeat(Math.floor(sessionData.rating)) : '';
        
        // Pre-fill content with cooking experience
        const prefilledContent = `Just cooked "${sessionData.recipe_title}"! ${stars}\n\n${
          sessionData.notes || 'Great cooking experience!'
        }`;
        setContent(prefilledContent);

        // Set image preview if session has image
        if (sessionData.image) {
          setImagePreview(sessionData.image);
        }

        // Clear sessionStorage after using
        sessionStorage.removeItem('share_cooking_session');
      } catch (err) {
        console.error('Failed to parse shared cooking session:', err);
      }
    }
  }, [searchParams]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('File must be an image');
      return;
    }

    setImageFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setError('You must be logged in to post');
      return;
    }

    if (!content.trim() && !imageFile) {
      setError('Post must have content or an image');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let imageUrl: string | undefined;

      // Upload image if present
      if (imageFile) {
        const uploadResult = await uploadPostImage(token, imageFile);
        imageUrl = uploadResult.image_url;
      }

      // Create post
      await createPost(token, {
        content: content.trim(),
        image_url: imageUrl,
        recipe_id: recipeId.trim() || undefined,
        privacy,
      });

      // Reset form
      setContent('');
      setImageFile(null);
      setImagePreview(null);
      setRecipeId('');
      setPrivacy('friends');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      onPostCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <form onSubmit={handleSubmit}>
        {/* User Avatar */}
        <div className="flex gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
              <span className="text-lg font-bold text-white">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Content Input */}
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              maxLength={2000}
            />
          </div>
        </div>

        {/* Image Preview */}
        {imagePreview && (
          <div className="mt-3 relative">
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-100">
              <Image src={imagePreview} alt="Preview" fill className="object-cover" />
            </div>
            <button
              type="button"
              onClick={handleRemoveImage}
              className="absolute top-2 right-2 p-2 bg-gray-900 bg-opacity-75 text-white rounded-full hover:bg-opacity-90 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Recipe ID Input (Optional) */}
        <div className="mt-3">
          <input
            type="text"
            value={recipeId}
            onChange={(e) => setRecipeId(e.target.value)}
            placeholder="Recipe ID (optional)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2">
            {/* Image Upload Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
              title="Add image"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>

            {/* Privacy Selector */}
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as 'public' | 'friends' | 'private')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="public">Public</option>
              <option value="friends">Friends</option>
              <option value="private">Private</option>
            </select>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || (!content.trim() && !imageFile)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
