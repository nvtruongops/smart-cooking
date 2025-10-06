/**
 * Recipe Detail Page
 * Task 17.2 - Show recipe with social sharing integration
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import ShareToFeedButton from '@/components/recipes/ShareToFeedButton';

interface Recipe {
  recipe_id: string;
  title: string;
  description: string;
  image_url?: string;
  ingredients: string[];
  instructions: string[];
  cuisine_type: string;
  cooking_method: string;
  meal_type: string;
  prep_time?: number;
  cook_time?: number;
  servings?: number;
  average_rating?: number;
  rating_count?: number;
  cook_count?: number;
  post_count?: number; // Social engagement
  is_approved: boolean;
  created_by?: string;
  created_at: string;
}

interface FriendWhoCooked {
  user_id: string;
  username: string;
  name?: string;
  avatar_url?: string;
  cooked_at: string;
  rating?: number;
}

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuth();
  const recipeId = params.id as string;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [friendsWhoCooked, setFriendsWhoCooked] = useState<FriendWhoCooked[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    const fetchRecipe = async () => {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        
        // Fetch recipe details
        const recipeResponse = await fetch(`${API_URL}/recipes/${recipeId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!recipeResponse.ok) {
          throw new Error('Failed to load recipe');
        }

        const recipeData = await recipeResponse.json();
        setRecipe(recipeData.recipe);

        // Fetch friends who cooked this recipe
        const friendsResponse = await fetch(
          `${API_URL}/recipes/${recipeId}/friends-cooked`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (friendsResponse.ok) {
          const friendsData = await friendsResponse.json();
          setFriendsWhoCooked(friendsData.friends || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load recipe');
      } finally {
        setLoading(false);
      }
    };

    fetchRecipe();
  }, [token, recipeId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading recipe...</p>
        </div>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Recipe Not Found
            </h2>
            <p className="text-gray-600 mb-4">{error || 'Recipe does not exist'}</p>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Recipe Header */}
        <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
          {recipe.image_url && (
            <div className="relative h-64 sm:h-96 w-full">
              <Image
                src={recipe.image_url}
                alt={recipe.title}
                fill
                className="object-cover"
              />
            </div>
          )}

          <div className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {recipe.title}
                </h1>
                <p className="text-gray-600">{recipe.description}</p>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                    {recipe.cuisine_type}
                  </span>
                  <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                    {recipe.cooking_method}
                  </span>
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded-full">
                    {recipe.meal_type}
                  </span>
                </div>
              </div>

              {/* Share Button */}
              <div className="mt-4 sm:mt-0 sm:ml-6">
                <ShareToFeedButton
                  recipeId={recipe.recipe_id}
                  recipeTitle={recipe.title}
                  recipeImage={recipe.image_url}
                  recipeDescription={recipe.description}
                />
              </div>
            </div>

            {/* Recipe Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 py-4 border-t border-b">
              {recipe.prep_time && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {recipe.prep_time}
                  </div>
                  <div className="text-sm text-gray-600">min prep</div>
                </div>
              )}
              {recipe.cook_time && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {recipe.cook_time}
                  </div>
                  <div className="text-sm text-gray-600">min cook</div>
                </div>
              )}
              {recipe.servings && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {recipe.servings}
                  </div>
                  <div className="text-sm text-gray-600">servings</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {recipe.cook_count || 0}
                </div>
                <div className="text-sm text-gray-600">times cooked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {recipe.post_count || 0}
                </div>
                <div className="text-sm text-gray-600">posts</div>
              </div>
            </div>

            {/* Rating */}
            {recipe.average_rating && recipe.rating_count ? (
              <div className="mt-4 flex items-center">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className={`w-5 h-5 ${
                        i < Math.floor(recipe.average_rating!)
                          ? 'text-yellow-400'
                          : 'text-gray-300'
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span className="ml-2 text-gray-600">
                  {recipe.average_rating.toFixed(1)} ({recipe.rating_count} ratings)
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Friends Who Cooked */}
        {friendsWhoCooked.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Friends Who Cooked This ({friendsWhoCooked.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {friendsWhoCooked.map((friend) => (
                <Link
                  key={friend.user_id}
                  href={`/users/${friend.user_id}`}
                  className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                    {(friend.name || friend.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {friend.name || friend.username}
                    </p>
                    <p className="text-sm text-gray-500">
                      Cooked {new Date(friend.cooked_at).toLocaleDateString()}
                      {friend.rating && ` • ⭐ ${friend.rating}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Ingredients and Instructions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ingredients */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Ingredients
            </h2>
            <ul className="space-y-2">
              {recipe.ingredients.map((ingredient, index) => (
                <li key={index} className="flex items-start">
                  <svg
                    className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-gray-700">{ingredient}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Instructions */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Instructions
            </h2>
            <ol className="space-y-4">
              {recipe.instructions.map((instruction, index) => (
                <li key={index} className="flex items-start">
                  <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm mr-3">
                    {index + 1}
                  </span>
                  <span className="text-gray-700 pt-1">{instruction}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 bg-white shadow rounded-lg p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <button className="flex-1 inline-flex items-center justify-center px-6 py-3 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              Start Cooking
            </button>
            <button className="flex-1 inline-flex items-center justify-center px-6 py-3 border border-gray-300 shadow-sm text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
              Save Recipe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
