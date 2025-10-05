export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.smartcooking.example.com';

export const API_ENDPOINTS = {
  // Ingredient endpoints
  INGREDIENT_SEARCH: '/ingredients/search',
  INGREDIENT_VALIDATE: '/ingredients/validate',
  
  // AI suggestion endpoints
  AI_SUGGESTIONS: '/ai/suggest',
  
  // User endpoints
  USER_PROFILE: '/user/profile',
  USER_PREFERENCES: '/user/preferences',
  
  // Recipe endpoints
  RECIPES: '/recipes',
  RECIPE_SEARCH: '/recipes/search',
  
  // Cooking history endpoints
  COOKING_HISTORY: '/cooking/history',
  COOKING_START: '/cooking/start',
  COOKING_COMPLETE: '/cooking/complete',
  
  // Rating endpoints
  RATINGS: '/ratings'
} as const;