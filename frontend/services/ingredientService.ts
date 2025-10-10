import { API_BASE_URL, API_ENDPOINTS } from '@/config/api';
import { getAuthHeaders } from '@/lib/apiHelpers';

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

export interface ValidationWarning {
  original?: string;
  corrected?: string;
  confidence?: number;
  message: string;
  ingredient?: string;
  suggestions?: string[];
  reported?: boolean;
}

export interface ValidationResponse {
  valid: string[];
  invalid: string[];
  warnings: ValidationWarning[];
}

export interface AISuggestionRequest {
  ingredients: string[];
  recipe_count: number;
}

export interface AISuggestionResponse {
  suggestions: any[]; // Recipe type
  stats: {
    requested: number;
    from_database: number;
    from_ai: number;
  };
  warnings?: ValidationWarning[];
}

/**
 * Search for ingredients with fuzzy matching
 * This is a mock implementation that simulates the backend search functionality
 */
export async function searchIngredients(
  query: string,
  options: IngredientSearchOptions = {}
): Promise<IngredientSearchResult[]> {
  // Mock data for common Vietnamese ingredients
  const mockIngredients: IngredientSearchResult[] = [
    {
      ingredient_id: '1',
      name: 'Thịt gà',
      normalized_name: 'thit ga',
      category: 'meat',
      aliases: ['gà', 'chicken', 'thịt gà ta'],
      match_type: 'exact',
      match_score: 1.0
    },
    {
      ingredient_id: '2',
      name: 'Cà chua',
      normalized_name: 'ca chua',
      category: 'vegetable',
      aliases: ['tomato', 'cà chua bi'],
      match_type: 'exact',
      match_score: 1.0
    },
    {
      ingredient_id: '3',
      name: 'Hành tây',
      normalized_name: 'hanh tay',
      category: 'vegetable',
      aliases: ['onion', 'hành'],
      match_type: 'exact',
      match_score: 1.0
    },
    {
      ingredient_id: '4',
      name: 'Tỏi',
      normalized_name: 'toi',
      category: 'vegetable',
      aliases: ['garlic', 'tỏi tây'],
      match_type: 'exact',
      match_score: 1.0
    },
    {
      ingredient_id: '5',
      name: 'Gạo',
      normalized_name: 'gao',
      category: 'grain',
      aliases: ['rice', 'gạo tẻ'],
      match_type: 'exact',
      match_score: 1.0
    },
    {
      ingredient_id: '6',
      name: 'Thịt bò',
      normalized_name: 'thit bo',
      category: 'meat',
      aliases: ['beef', 'bò'],
      match_type: 'exact',
      match_score: 1.0
    },
    {
      ingredient_id: '7',
      name: 'Cá',
      normalized_name: 'ca',
      category: 'seafood',
      aliases: ['fish', 'cá tươi'],
      match_type: 'exact',
      match_score: 1.0
    },
    {
      ingredient_id: '8',
      name: 'Rau muống',
      normalized_name: 'rau muong',
      category: 'vegetable',
      aliases: ['water spinach', 'rau muống'],
      match_type: 'exact',
      match_score: 1.0
    },
    {
      ingredient_id: '9',
      name: 'Trứng',
      normalized_name: 'trung',
      category: 'protein',
      aliases: ['egg', 'trứng gà'],
      match_type: 'exact',
      match_score: 1.0
    },
    {
      ingredient_id: '10',
      name: 'Nước mắm',
      normalized_name: 'nuoc mam',
      category: 'seasoning',
      aliases: ['fish sauce', 'nước mắm'],
      match_type: 'exact',
      match_score: 1.0
    }
  ];

  const { limit = 10, fuzzyThreshold = 0.6 } = options;
  const normalizedQuery = normalizeVietnamese(query.toLowerCase());

  // Filter and score ingredients
  const results = mockIngredients
    .map(ingredient => {
      let bestScore = 0;
      let matchType: 'exact' | 'alias' | 'fuzzy' = 'fuzzy';

      // Check exact match with name
      if (ingredient.normalized_name === normalizedQuery) {
        bestScore = 1.0;
        matchType = 'exact';
      }
      // Check exact match with aliases
      else if (ingredient.aliases.some(alias => normalizeVietnamese(alias.toLowerCase()) === normalizedQuery)) {
        bestScore = 0.9;
        matchType = 'alias';
      }
      // Check partial matches
      else if (ingredient.normalized_name.includes(normalizedQuery) || normalizedQuery.includes(ingredient.normalized_name)) {
        bestScore = 0.8;
        matchType = 'fuzzy';
      }
      // Check fuzzy matches with aliases
      else {
        for (const alias of ingredient.aliases) {
          const aliasNormalized = normalizeVietnamese(alias.toLowerCase());
          if (aliasNormalized.includes(normalizedQuery) || normalizedQuery.includes(aliasNormalized)) {
            bestScore = Math.max(bestScore, 0.7);
            matchType = 'fuzzy';
          }
        }
      }

      return {
        ...ingredient,
        match_score: bestScore,
        match_type: matchType
      };
    })
    .filter(ingredient => ingredient.match_score >= fuzzyThreshold)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 200));

  return results;
}

/**
 * Normalize Vietnamese text for search
 */
function normalizeVietnamese(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim();
}

/**
 * Get AI recipe suggestions based on ingredients
 */
export async function getAISuggestions(
  request: AISuggestionRequest
): Promise<AISuggestionResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.AI_SUGGESTIONS}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get AI suggestions');
  }

  return response.json();
}

/**
 * Validate ingredients using the backend API
 */
export async function validateIngredientsAPI(ingredients: string[]): Promise<ValidationResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.INGREDIENT_VALIDATE}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ingredients })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to validate ingredients');
  }

  return response.json();
}

/**
 * Validate a single ingredient using search
 */
export async function validateIngredient(
  ingredient: string
): Promise<{ valid: boolean; result?: IngredientSearchResult; warning?: ValidationWarning }> {
  try {
    const results = await searchIngredients(ingredient, { limit: 5, fuzzyThreshold: 0.6 });

    if (results.length > 0) {
      const match = results[0];

      // High confidence match (>= 0.8)
      if (match.match_score >= 0.8) {
        return {
          valid: true,
          result: match,
          warning: ingredient !== match.name ? {
            original: ingredient,
            corrected: match.name,
            confidence: match.match_score,
            message: match.match_type === 'exact' 
              ? 'Ingredient name corrected to standard form'
              : 'Ingredient name auto-corrected based on similarity'
          } : undefined
        };
      }
      
      // Medium confidence match (0.6-0.8) - provide suggestions
      else if (match.match_score >= 0.6) {
        return {
          valid: false,
          warning: {
            ingredient,
            suggestions: results.slice(0, 3).map(r => r.name),
            message: 'Ingredient not found. Did you mean one of these?'
          }
        };
      }
    }

    return {
      valid: false,
      warning: {
        ingredient,
        message: `Không tìm thấy nguyên liệu "${ingredient}"`,
        suggestions: results.slice(0, 3).map(r => r.name)
      }
    };
  } catch (error) {
    console.error('Ingredient validation error:', error);
    return {
      valid: false,
      warning: {
        ingredient,
        message: 'Lỗi khi kiểm tra nguyên liệu',
        suggestions: []
      }
    };
  }
}

/**
 * Validate multiple ingredients in batch
 */
export async function validateIngredients(
  ingredients: string[]
): Promise<{
  valid: { name: string; validated: string }[];
  invalid: { name: string; warning: ValidationWarning }[];
  warnings: ValidationWarning[];
}> {
  const results = await Promise.all(
    ingredients.map(ingredient => validateIngredient(ingredient))
  );

  const valid: { name: string; validated: string }[] = [];
  const invalid: { name: string; warning: ValidationWarning }[] = [];
  const warnings: ValidationWarning[] = [];

  results.forEach((result, index) => {
    const ingredient = ingredients[index];

    if (result.valid && result.result) {
      valid.push({
        name: ingredient,
        validated: result.result.name
      });

      if (result.warning) {
        warnings.push(result.warning);
      }
    } else if (result.warning) {
      invalid.push({
        name: ingredient,
        warning: result.warning
      });
      warnings.push(result.warning);
    }
  });

  return { valid, invalid, warnings };
}
