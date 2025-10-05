import { API_BASE_URL } from '@/config/api';
import {
  CookingHistory,
  CookingHistoryWithRecipe,
  RecipeRating,
  RatingRequest,
  RatingResponse,
  StartCookingRequest,
  CompleteCookingRequest
} from '@/types/cooking';

/**
 * Start a cooking session
 */
export async function startCooking(request: StartCookingRequest): Promise<CookingHistory> {
  const token = localStorage.getItem('auth_token');

  const response = await fetch(`${API_BASE_URL}/cooking/start`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to start cooking session');
  }

  return response.json();
}

/**
 * Complete a cooking session
 */
export async function completeCooking(request: CompleteCookingRequest): Promise<CookingHistory> {
  const token = localStorage.getItem('auth_token');

  const response = await fetch(`${API_BASE_URL}/cooking/complete`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to complete cooking session');
  }

  return response.json();
}

/**
 * Get cooking history for the current user
 */
export async function getCookingHistory(
  status?: 'cooking' | 'completed',
  limit?: number
): Promise<CookingHistoryWithRecipe[]> {
  const token = localStorage.getItem('auth_token');

  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (limit) params.append('limit', limit.toString());

  const response = await fetch(`${API_BASE_URL}/cooking/history?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get cooking history');
  }

  return response.json();
}

/**
 * Get favorite recipes
 */
export async function getFavoriteRecipes(): Promise<CookingHistoryWithRecipe[]> {
  const token = localStorage.getItem('auth_token');

  const response = await fetch(`${API_BASE_URL}/cooking/favorites`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get favorite recipes');
  }

  return response.json();
}

/**
 * Toggle favorite status
 */
export async function toggleFavorite(historyId: string, isFavorite: boolean): Promise<CookingHistory> {
  const token = localStorage.getItem('auth_token');

  const response = await fetch(`${API_BASE_URL}/cooking/${historyId}/favorite`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ is_favorite: isFavorite })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to toggle favorite');
  }

  return response.json();
}

/**
 * Submit a recipe rating
 */
export async function submitRating(request: RatingRequest): Promise<RatingResponse> {
  const token = localStorage.getItem('auth_token');

  const response = await fetch(`${API_BASE_URL}/recipes/${request.recipe_id}/rate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      rating: request.rating,
      comment: request.comment,
      history_id: request.history_id
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to submit rating');
  }

  return response.json();
}

/**
 * Get user's rating for a recipe
 */
export async function getUserRating(recipeId: string): Promise<RecipeRating | null> {
  const token = localStorage.getItem('auth_token');

  const response = await fetch(`${API_BASE_URL}/recipes/${recipeId}/my-rating`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get rating');
  }

  return response.json();
}
