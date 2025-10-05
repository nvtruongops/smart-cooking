/**
 * Type definitions for Recipe Management
 */

export interface RecipeIngredient {
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface RecipeInstruction {
  step_number: number;
  description: string;
  duration_minutes?: number;
}

export interface RecipeMetadata {
  recipe_id: string;
  title: string;
  description?: string;
  cooking_method: string;
  cuisine_type?: string;
  meal_type?: string; // breakfast, lunch, dinner, snack
  difficulty_level?: 'easy' | 'medium' | 'hard';
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  total_time_minutes?: number;
  servings?: number;
  calories_per_serving?: number;
  image_url?: string;
  is_approved: boolean;
  approval_status: 'pending' | 'approved' | 'rejected';
  average_rating?: number;
  rating_count: number;
  created_by: string;
  source: 'ai_generated' | 'user_created' | 'admin_created';
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  metadata: RecipeMetadata;
  ingredients: RecipeIngredient[];
  instructions: RecipeInstruction[];
}

// Request/Response Types

export interface CreateRecipeRequest {
  title: string;
  description?: string;
  cooking_method: string;
  cuisine_type?: string;
  meal_type?: string;
  difficulty_level?: 'easy' | 'medium' | 'hard';
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  servings?: number;
  calories_per_serving?: number;
  ingredients: Array<{
    ingredient_id: string;
    ingredient_name: string;
    quantity: number;
    unit: string;
    notes?: string;
  }>;
  instructions: Array<{
    step_number: number;
    description: string;
    duration_minutes?: number;
  }>;
  source?: 'ai_generated' | 'user_created';
}

export interface CreateRecipeResponse {
  recipe_id: string;
  message: string;
}

export interface GetRecipeResponse {
  recipe: Recipe;
}

export interface UpdateRecipeRequest {
  recipe_id: string;
  title?: string;
  description?: string;
  cooking_method?: string;
  cuisine_type?: string;
  meal_type?: string;
  difficulty_level?: 'easy' | 'medium' | 'hard';
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  servings?: number;
  calories_per_serving?: number;
  image_url?: string;
  ingredients?: Array<{
    ingredient_id: string;
    ingredient_name: string;
    quantity: number;
    unit: string;
    notes?: string;
  }>;
  instructions?: Array<{
    step_number: number;
    description: string;
    duration_minutes?: number;
  }>;
}

export interface DeleteRecipeRequest {
  recipe_id: string;
}

export interface ListRecipesRequest {
  limit?: number;
  start_key?: string;
  filter_by_user?: boolean;
  filter_by_approved?: boolean;
  cooking_method?: string;
}

export interface ListRecipesResponse {
  recipes: RecipeMetadata[];
  last_evaluated_key?: string;
  count: number;
}

export interface SearchRecipesRequest {
  q?: string; // Search query for title and description
  cuisine_type?: string;
  cooking_method?: string;
  meal_type?: string;
  min_rating?: number;
  max_prep_time?: number;
  max_cook_time?: number;
  difficulty_level?: 'easy' | 'medium' | 'hard';
  sort_by?: 'rating' | 'created_at' | 'popularity' | 'prep_time';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface SearchRecipesResponse {
  recipes: RecipeMetadata[];
  total_count: number;
  has_more: boolean;
  filters_applied: {
    query?: string;
    cuisine_type?: string;
    cooking_method?: string;
    meal_type?: string;
    min_rating?: number;
  };
}
