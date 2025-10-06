// Shared TypeScript types for Smart Cooking MVP

export interface APIGatewayEvent {
  httpMethod: string;
  path: string;
  pathParameters: { [key: string]: string } | null;
  queryStringParameters: { [key: string]: string } | null;
  headers: { [key: string]: string };
  body: string | null;
  requestContext: {
    requestId: string;
    authorizer?: {
      claims: {
        sub: string;
        email: string;
        username: string;
      };
    };
  };
  multiValueHeaders?: { [key: string]: string[] };
  multiValueQueryStringParameters?: { [key: string]: string[] };
  stageVariables?: { [key: string]: string } | null;
  isBase64Encoded: boolean;
  resource: string;
}

export interface APIResponse {
  statusCode: number;
  headers: { [key: string]: string };
  body: string;
}

export interface UserProfile {
  user_id: string;
  email: string;
  username: string;
  full_name: string;
  date_of_birth?: string;
  gender?: 'male' | 'female' | 'other';
  country?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  dietary_restrictions: string[];
  allergies: string[];
  favorite_cuisines: string[];
  preferred_cooking_methods: string[];
  preferred_recipe_count?: number;
  spice_level?: 'mild' | 'medium' | 'hot';
}

export interface MasterIngredient {
  ingredient_id: string;
  name: string;
  normalized_name: string;
  category: string;
  aliases: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  recipe_id: string;
  user_id?: string;
  title: string;
  description: string;
  cuisine_type: string;
  cooking_method: string;
  meal_type: string;
  prep_time_minutes: number;
  cook_time_minutes: number;
  servings: number;
  ingredients: RecipeIngredient[];
  instructions: RecipeInstruction[];
  nutritional_info?: NutritionalInfo;
  is_public: boolean;
  is_ai_generated: boolean;
  is_approved: boolean;
  approval_type?: 'auto_rating' | 'manual' | 'admin';
  average_rating?: number;
  rating_count?: number;
  created_at: string;
  updated_at: string;
  approved_at?: string;
}

export interface RecipeIngredient {
  ingredient_name: string;
  quantity: string;
  unit?: string;
  preparation?: string;
  is_optional?: boolean;
}

export interface RecipeInstruction {
  step_number: number;
  description: string;
  duration?: string;
}

export interface NutritionalInfo {
  calories?: number;
  protein?: string;
  carbs?: string;
  fat?: string;
  fiber?: string;
  sodium?: string;
}

export interface CookingHistory {
  history_id: string;
  user_id: string;
  recipe_id: string;
  suggestion_id?: string;
  status: 'cooking' | 'completed';
  personal_rating?: number;
  personal_notes?: string;
  is_favorite?: boolean;
  cook_date?: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeRating {
  rating_id: string;
  recipe_id: string;
  user_id: string;
  history_id?: string;
  rating: number; // 1-5
  comment?: string;
  is_verified_cook: boolean;
  created_at: string;
  updated_at: string;
}

export interface AISuggestion {
  suggestion_id: string;
  user_id: string;
  recipe_ids: string[];
  prompt_text: string;
  ingredients_used: string[];
  requested_recipe_count: number;
  recipes_from_db: number;
  recipes_from_ai: number;
  invalid_ingredients: string[];
  ai_response?: any;
  was_from_cache: boolean;
  created_at: string;
}

export interface ValidationWarning {
  original?: string;
  corrected?: string;
  confidence?: number;
  ingredient?: string;
  message?: string;
  suggestions?: string[];
  reported?: boolean;
}

export interface AISuggestionRequest {
  ingredients: string[];
  recipe_count: number; // 1-5
}

export interface AISuggestionResponse {
  suggestions: Recipe[];
  stats: {
    requested: number;
    from_database: number;
    from_ai: number;
  };
  warnings: ValidationWarning[];
}

export interface ValidationRequest {
  ingredients: string[];
}

export interface ValidationResponse {
  valid: string[];
  invalid: string[];
  warnings: ValidationWarning[];
}

export interface IngredientSearchResult {
  ingredient_id: string;
  name: string;
  normalized_name: string;
  category: string;
  aliases: string[];
  match_type: 'exact' | 'alias' | 'fuzzy';
  match_score: number;
}

export interface IngredientSearchOptions {
  limit?: number;
  category?: string;
  fuzzyThreshold?: number;
}

export interface RatingRequest {
  recipe_id: string;
  rating: number; // 1-5
  comment?: string;
  history_id?: string;
}

export interface RatingResponse {
  success: boolean;
  average_rating: number;
  rating_count: number;
  auto_approved: boolean;
  message: string;
}

// DynamoDB item structure
export interface DynamoDBItem {
  PK: string;
  SK: string;
  entity_type: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
  [key: string]: any;
}