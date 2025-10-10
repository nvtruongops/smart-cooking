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
 * Helper function to get authentication token from Cognito
 */
async function getAuthToken(): Promise<string | null> {
  const { authService } = await import('@/lib/auth');
  return authService.getIdToken();
}

/**
 * Start a cooking session
 */
export async function startCooking(request: StartCookingRequest): Promise<CookingHistory> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/v1/cooking/sessions`, {
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

  const result = await response.json();
  // Response format: { success: true, data: { session object } }
  return result.data || result;
}

/**
 * Complete a cooking session
 */
export async function completeCooking(request: CompleteCookingRequest): Promise<CookingHistory> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/v1/cooking/sessions/${request.session_id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'completed',
      rating: request.rating,
      review: request.review
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to complete cooking session');
  }

  const result = await response.json();
  // Response format: { success: true, data: { session object } }
  return result.data || result;
}

/**
 * Get cooking history for the current user
 * FIX: Transform sessions to include recipe details from session snapshot
 */
export async function getCookingHistory(
  status?: 'cooking' | 'completed',
  limit?: number
): Promise<CookingHistoryWithRecipe[]> {
  const token = await getAuthToken();

  const params = new URLSearchParams();
  if (status) params.append('status_filter', status);
  if (limit) params.append('limit', limit.toString());

  const response = await fetch(`${API_BASE_URL}/v1/cooking/history?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get cooking history');
  }

  const result = await response.json();
  console.log('🔍 getCookingHistory raw response:', result);
  
  // Response format: { success: true, data: { sessions: [...] } }
  const data = result.data || result;
  const sessions = data.sessions || [];
  
  console.log('📊 Parsed sessions:', sessions.length);

  // FIX: Transform sessions to include recipe details from snapshot
  return sessions.map((session: any) => ({
    session_id: session.session_id,
    history_id: session.session_id,
    user_id: session.user_id,
    recipe_id: session.recipe_id,
    recipe_title: session.recipe_title,
    status: session.status,
    started_at: session.started_at,
    cook_date: session.started_at,
    completed_at: session.completed_at,
    personal_rating: session.rating,
    personal_notes: session.review || session.notes,
    is_favorite: false, // TODO: Implement favorite tracking
    created_at: session.created_at,
    updated_at: session.updated_at,
    // FIX: Include recipe details from session snapshot
    recipe: session.recipe_ingredients ? {
      recipe_id: session.recipe_id,
      title: session.recipe_title || 'Untitled Recipe',
      ingredients: session.recipe_ingredients || [],
      instructions: session.recipe_instructions || [],
      cooking_method: session.recipe_cooking_method,
      cuisine: session.recipe_cuisine,
      prep_time_minutes: session.recipe_prep_time_minutes,
      cook_time_minutes: session.recipe_cook_time_minutes,
      servings: 2, // Default
      image_url: session.recipe_image_url,
      is_ai_generated: true, // Assume AI generated for now
    } : undefined
  }));
}

/**
 * Get favorite recipes
 */
export async function getFavoriteRecipes(): Promise<CookingHistoryWithRecipe[]> {
  const token = await getAuthToken();

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
  const token = await getAuthToken();

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
  const token = await getAuthToken();

  // Use the cooking/complete endpoint instead of recipes/rate
  const response = await fetch(`${API_BASE_URL}/v1/cooking/complete`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      session_id: request.history_id,
      rating: request.rating,
      comment: request.comment
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
  const token = await getAuthToken();

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

/**
 * Delete a cooking session
 */
export async function deleteCookingSession(sessionId: string): Promise<void> {
  const token = await getAuthToken();

  console.log('🗑️ Deleting session:', sessionId);
  console.log('📡 DELETE URL:', `${API_BASE_URL}/v1/cooking/sessions/${sessionId}`);

  const response = await fetch(`${API_BASE_URL}/v1/cooking/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log('📡 DELETE Response:', response.status, response.statusText);

  if (!response.ok) {
    const error = await response.json();
    console.error('❌ DELETE Error:', error);
    throw new Error(error.error || 'Failed to delete cooking session');
  }
}
