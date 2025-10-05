/**
 * Ingredient Validation Types
 * Handles ingredient validation requests and responses
 */

export interface ValidationRequest {
  ingredients: string[];
}

export interface ValidationResponse {
  valid: ValidatedIngredient[];
  invalid: InvalidIngredient[];
  warnings: ValidationWarning[];
}

export interface ValidatedIngredient {
  original: string;
  ingredient_id: string;
  ingredient_name: string;
  normalized_name: string;
  category: string;
  match_type: 'exact' | 'alias' | 'fuzzy';
  match_score: number;
}

export interface InvalidIngredient {
  original: string;
  reason: string;
  suggestions?: string[];
}

export interface ValidationWarning {
  original: string;
  corrected: string;
  confidence: number;
  message: string;
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
