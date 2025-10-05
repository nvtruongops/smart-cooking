/**
 * Ingredient Validation Service
 * Stateless validation of ingredients against master ingredient list
 * NO DATABASE WRITES - read-only operations
 */

import { DynamoDBHelper } from '../shared/dynamodb';
import { logStructured } from '../shared/utils';
import {
  ValidationRequest,
  ValidationResponse,
  ValidatedIngredient,
  InvalidIngredient,
  ValidationWarning,
  MasterIngredient
} from './types';

export class IngredientValidationService {
  private static readonly FUZZY_THRESHOLD = 0.7;
  private static readonly MAX_INGREDIENTS = 20;

  /**
   * Validate a batch of ingredients (stateless - no DB writes)
   */
  static async validateIngredients(request: ValidationRequest): Promise<ValidationResponse> {
    // Validate batch size
    if (!request.ingredients || request.ingredients.length === 0) {
      throw new Error('At least one ingredient is required');
    }

    if (request.ingredients.length > this.MAX_INGREDIENTS) {
      throw new Error(`Maximum ${this.MAX_INGREDIENTS} ingredients allowed per request`);
    }

    const valid: ValidatedIngredient[] = [];
    const invalid: InvalidIngredient[] = [];
    const warnings: ValidationWarning[] = [];

    // Load all master ingredients once (efficient for batch processing)
    const masterIngredients = await this.loadMasterIngredients();

    // Validate each ingredient
    for (const ingredient of request.ingredients) {
      const normalized = this.normalizeString(ingredient.trim());

      if (!normalized) {
        invalid.push({
          original: ingredient,
          reason: 'Empty ingredient name'
        });
        continue;
      }

      const result = await this.findBestMatch(ingredient, normalized, masterIngredients);

      if (result.match) {
        valid.push(result.match);

        // Add warning if fuzzy match was used
        if (result.match.match_type === 'fuzzy' && result.warning) {
          warnings.push(result.warning);
        }
      } else {
        invalid.push({
          original: ingredient,
          reason: 'Ingredient not found in master list',
          suggestions: result.suggestions
        });

        // Log for admin review
        logStructured('WARN', 'Invalid ingredient detected', {
          original: ingredient,
          normalized,
          suggestions: result.suggestions
        });
      }
    }

    logStructured('INFO', 'Ingredient validation completed', {
      total: request.ingredients.length,
      valid: valid.length,
      invalid: invalid.length,
      warnings: warnings.length
    });

    return {
      valid,
      invalid,
      warnings
    };
  }

  /**
   * Load all active master ingredients from DynamoDB
   */
  private static async loadMasterIngredients(): Promise<MasterIngredient[]> {
    const result = await DynamoDBHelper.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      FilterExpression: 'is_active = :active',
      ExpressionAttributeValues: {
        ':pk': 'INGREDIENT#MASTER',
        ':active': true
      }
    });

    return (result.Items as MasterIngredient[]) || [];
  }

  /**
   * Find the best match for an ingredient
   */
  private static async findBestMatch(
    original: string,
    normalized: string,
    masterIngredients: MasterIngredient[]
  ): Promise<{
    match?: ValidatedIngredient;
    warning?: ValidationWarning;
    suggestions?: string[];
  }> {
    let bestMatch: { ingredient: MasterIngredient; type: 'exact' | 'alias' | 'fuzzy'; score: number } | null = null;
    const suggestions: string[] = [];

    for (const ingredient of masterIngredients) {
      // Check exact match
      if (ingredient.normalized_name === normalized) {
        bestMatch = {
          ingredient,
          type: 'exact',
          score: 1.0
        };
        break;
      }

      // Check alias match
      const normalizedAliases = ingredient.aliases.map(a => this.normalizeString(a));
      if (normalizedAliases.includes(normalized)) {
        bestMatch = {
          ingredient,
          type: 'alias',
          score: 0.95
        };
        break;
      }

      // Calculate fuzzy match score
      const score = this.calculateSimilarity(normalized, ingredient.normalized_name);
      if (score >= this.FUZZY_THRESHOLD) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            ingredient,
            type: 'fuzzy',
            score
          };
        }
      }

      // Collect suggestions for fuzzy matches
      if (score >= 0.5 && suggestions.length < 3) {
        suggestions.push(ingredient.name);
      }
    }

    if (!bestMatch) {
      return { suggestions: suggestions.slice(0, 3) };
    }

    const validatedIngredient: ValidatedIngredient = {
      original,
      ingredient_id: bestMatch.ingredient.ingredient_id,
      ingredient_name: bestMatch.ingredient.name,
      normalized_name: bestMatch.ingredient.normalized_name,
      category: bestMatch.ingredient.category,
      match_type: bestMatch.type,
      match_score: bestMatch.score
    };

    // Create warning for fuzzy matches
    let warning: ValidationWarning | undefined;
    if (bestMatch.type === 'fuzzy') {
      warning = {
        original,
        corrected: bestMatch.ingredient.name,
        confidence: bestMatch.score,
        message: `Did you mean "${bestMatch.ingredient.name}"?`
      };
    }

    return { match: validatedIngredient, warning };
  }

  /**
   * Normalize string for comparison (lowercase, remove diacritics, trim)
   */
  private static normalizeString(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .trim();
  }

  /**
   * Calculate similarity score using Levenshtein distance
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // Create distance matrix
    const matrix: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= len1; i++) {
      matrix[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Calculate distances
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);

    // Convert distance to similarity score (0-1)
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
  }
}
