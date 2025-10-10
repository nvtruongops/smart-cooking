/**
 * Cooking Session Types
 * Defines all types and interfaces for cooking session management
 */

export type CookingSessionStatus = 'cooking' | 'completed' | 'abandoned';

export interface CookingSession {
  session_id: string;
  user_id: string;
  recipe_id: string;
  recipe_title?: string;
  // FIX: Add recipe details for history display
  recipe_ingredients?: Array<{ name: string; amount: string; unit?: string }>;
  recipe_instructions?: string[];
  recipe_cooking_method?: string;
  recipe_cuisine?: string;
  recipe_prep_time_minutes?: number;
  recipe_cook_time_minutes?: number;
  recipe_image_url?: string;
  status: CookingSessionStatus;
  started_at: string;
  completed_at?: string;
  abandoned_at?: string;
  cooking_duration_minutes?: number;
  rating?: number; // 1-5 stars
  review?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface FavoriteRecipe {
  user_id: string;
  recipe_id: string;
  recipe_title?: string;
  favorited_at: string;
  last_cooked_at?: string;
  times_cooked: number;
  average_rating?: number;
}

export interface StartCookingRequest {
  user_id: string;
  recipe_id: string;
  recipe_title?: string;
}

export interface CompleteCookingRequest {
  user_id: string;
  session_id: string;
  rating?: number;
  review?: string;
  notes?: string;
}

export interface UpdateCookingStatusRequest {
  user_id: string;
  session_id: string;
  status: CookingSessionStatus;
  rating?: number;
  review?: string;
  notes?: string;
}

export interface GetCookingHistoryRequest {
  user_id: string;
  limit?: number;
  start_key?: string;
  status_filter?: CookingSessionStatus;
  recipe_id_filter?: string;
  sort_order?: 'asc' | 'desc';
}

export interface GetCookingHistoryResponse {
  sessions: CookingSession[];
  last_evaluated_key?: string;
  total_count: number;
}

export interface ToggleFavoriteRequest {
  user_id: string;
  recipe_id: string;
  recipe_title?: string;
}

export interface GetFavoritesRequest {
  user_id: string;
  limit?: number;
  start_key?: string;
}

export interface GetFavoritesResponse {
  favorites: FavoriteRecipe[];
  last_evaluated_key?: string;
  total_count: number;
}

export interface CookingStats {
  user_id: string;
  total_sessions: number;
  completed_sessions: number;
  abandoned_sessions: number;
  total_cooking_time_minutes: number;
  average_session_duration_minutes: number;
  favorite_recipes_count: number;
  most_cooked_recipe?: {
    recipe_id: string;
    recipe_title?: string;
    times_cooked: number;
  };
  average_rating?: number;
}

// DynamoDB Item structures
export interface CookingSessionDynamoItem {
  PK: string; // USER#userId
  SK: string; // SESSION#timestamp#sessionId
  GSI1PK: string; // SESSION#sessionId
  GSI1SK: string; // STATUS#status#timestamp
  GSI2PK: string; // RECIPE#recipeId
  GSI2SK: string; // USER#userId#timestamp
  EntityType: 'CookingSession';
  session_id: string;
  user_id: string;
  recipe_id: string;
  recipe_title?: string;
  // FIX: Add recipe details for history display
  recipe_ingredients?: Array<{ name: string; amount: string; unit?: string }>;
  recipe_instructions?: string[];
  recipe_cooking_method?: string;
  recipe_cuisine?: string;
  recipe_prep_time_minutes?: number;
  recipe_cook_time_minutes?: number;
  recipe_image_url?: string;
  status: CookingSessionStatus;
  started_at: string;
  completed_at?: string;
  abandoned_at?: string;
  cooking_duration_minutes?: number;
  rating?: number;
  review?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface FavoriteRecipeDynamoItem {
  PK: string; // USER#userId
  SK: string; // FAVORITE#recipeId
  GSI1PK: string; // RECIPE#recipeId
  GSI1SK: string; // USER#userId
  EntityType: 'FavoriteRecipe';
  user_id: string;
  recipe_id: string;
  recipe_title?: string;
  favorited_at: string;
  last_cooked_at?: string;
  times_cooked: number;
  average_rating?: number;
}
