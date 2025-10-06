import { DynamoDBHelper } from './dynamodb';
import { MasterIngredient } from './types';

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

export class IngredientService {
  /**
   * Normalize Vietnamese text for search by removing diacritics
   */
  static normalizeVietnamese(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .trim();
  }

  /**
   * Calculate fuzzy match score using Levenshtein distance
   */
  static calculateFuzzyScore(search: string, target: string): number {
    const searchNorm = this.normalizeVietnamese(search);
    const targetNorm = this.normalizeVietnamese(target);
    
    if (searchNorm === targetNorm) return 1.0;
    if (targetNorm.includes(searchNorm)) return 0.8;
    if (searchNorm.includes(targetNorm)) return 0.7;
    
    // Simple Levenshtein distance calculation
    const distance = this.levenshteinDistance(searchNorm, targetNorm);
    const maxLength = Math.max(searchNorm.length, targetNorm.length);
    return Math.max(0, 1 - (distance / maxLength));
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Search ingredients by name with fuzzy matching
   */
  static async searchIngredients(
    searchTerm: string, 
    options: IngredientSearchOptions = {}
  ): Promise<IngredientSearchResult[]> {
    const { limit = 10, category, fuzzyThreshold = 0.6 } = options;
    const normalizedSearch = this.normalizeVietnamese(searchTerm);
    const results: IngredientSearchResult[] = [];

    try {
      // 1. Exact name matches using GSI2
      const exactMatches = await DynamoDBHelper.query({
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': 'INGREDIENT#SEARCH',
          ':sk': `NAME#${normalizedSearch}`,
        },
        Limit: limit,
      });

      // Process exact matches
      for (const item of exactMatches.Items) {
        if (item.entity_type === 'MASTER_INGREDIENT') {
          results.push({
            ingredient_id: item.ingredient_id,
            name: item.name,
            normalized_name: item.normalized_name,
            category: item.category,
            aliases: item.aliases || [],
            match_type: 'exact',
            match_score: 1.0,
          });
        } else if (item.entity_type === 'INGREDIENT_ALIAS') {
          // Get the main ingredient data
          const mainIngredient = await DynamoDBHelper.get(
            `INGREDIENT#${item.ingredient_id}`,
            'METADATA'
          );
          if (mainIngredient) {
            results.push({
              ingredient_id: item.ingredient_id,
              name: mainIngredient.name,
              normalized_name: mainIngredient.normalized_name,
              category: mainIngredient.category,
              aliases: mainIngredient.aliases || [],
              match_type: 'alias',
              match_score: 0.9,
            });
          }
        }
      }

      // 2. If we don't have enough results, do fuzzy search
      if (results.length < limit) {
        const remainingLimit = limit - results.length;
        const existingIds = new Set(results.map(r => r.ingredient_id));

        // Get all ingredients for fuzzy matching
        const allIngredients = await DynamoDBHelper.query({
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          ExpressionAttributeValues: {
            ':pk': 'INGREDIENT#SEARCH',
          },
          Limit: 500, // Reasonable limit for fuzzy search
        });

        const fuzzyMatches: Array<IngredientSearchResult & { score: number }> = [];

        for (const item of allIngredients.Items) {
          // Skip if already in results
          if (existingIds.has(item.ingredient_id)) continue;

          let bestScore = 0;
          let matchType: 'exact' | 'alias' | 'fuzzy' = 'fuzzy';

          if (item.entity_type === 'MASTER_INGREDIENT') {
            // Check main name
            const nameScore = this.calculateFuzzyScore(searchTerm, item.name);
            if (nameScore > bestScore) {
              bestScore = nameScore;
            }

            // Check aliases
            if (item.aliases) {
              for (const alias of item.aliases) {
                const aliasScore = this.calculateFuzzyScore(searchTerm, alias);
                if (aliasScore > bestScore) {
                  bestScore = aliasScore;
                  matchType = 'alias';
                }
              }
            }

            if (bestScore >= fuzzyThreshold) {
              fuzzyMatches.push({
                ingredient_id: item.ingredient_id,
                name: item.name,
                normalized_name: item.normalized_name,
                category: item.category,
                aliases: item.aliases || [],
                match_type: matchType,
                match_score: bestScore,
                score: bestScore,
              });
            }
          }
        }

        // Sort by score and add to results
        fuzzyMatches
          .sort((a, b) => b.score - a.score)
          .slice(0, remainingLimit)
          .forEach(match => {
            const { score, ...result } = match;
            results.push(result);
          });
      }

      // Filter by category if specified
      let filteredResults = results;
      if (category) {
        filteredResults = results.filter(r => r.category === category);
      }

      // Sort results: exact matches first, then by score
      return filteredResults
        .sort((a, b) => {
          if (a.match_type === 'exact' && b.match_type !== 'exact') return -1;
          if (b.match_type === 'exact' && a.match_type !== 'exact') return 1;
          return b.match_score - a.match_score;
        })
        .slice(0, limit);

    } catch (error) {
      console.error('Error searching ingredients:', error);
      throw new Error('Failed to search ingredients');
    }
  }

  /**
   * Get ingredient by ID
   */
  static async getIngredientById(ingredientId: string): Promise<MasterIngredient | null> {
    try {
      const item = await DynamoDBHelper.get(`INGREDIENT#${ingredientId}`, 'METADATA');
      return item as MasterIngredient || null;
    } catch (error) {
      console.error('Error getting ingredient by ID:', error);
      return null;
    }
  }

  /**
   * Get ingredients by category
   */
  static async getIngredientsByCategory(
    category: string, 
    limit: number = 50
  ): Promise<MasterIngredient[]> {
    try {
      const result = await DynamoDBHelper.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `CATEGORY#${category}`,
        },
        Limit: limit,
      });

      return result.Items as MasterIngredient[];
    } catch (error) {
      console.error('Error getting ingredients by category:', error);
      return [];
    }
  }

  /**
   * Get all available categories
   */
  static async getCategories(): Promise<string[]> {
    try {
      // This is a simple implementation - in production you might want to cache this
      const result = await DynamoDBHelper.scan({
        FilterExpression: 'entity_type = :type',
        ExpressionAttributeValues: {
          ':type': 'MASTER_INGREDIENT',
        },
        Limit: 1000,
      });

      const categories = new Set<string>();
      result.Items.forEach(item => {
        if (item.category) {
          categories.add(item.category);
        }
      });

      return Array.from(categories).sort();
    } catch (error) {
      console.error('Error getting categories:', error);
      return [];
    }
  }

  /**
   * Validate and normalize ingredient names
   */
  static async validateIngredients(ingredientNames: string[]): Promise<{
    valid: Array<{ original: string; matched: IngredientSearchResult }>;
    invalid: Array<{ original: string; suggestions: IngredientSearchResult[] }>;
  }> {
    const valid: Array<{ original: string; matched: IngredientSearchResult }> = [];
    const invalid: Array<{ original: string; suggestions: IngredientSearchResult[] }> = [];

    for (const name of ingredientNames) {
      const searchResults = await this.searchIngredients(name, { limit: 5 });
      
      if (searchResults.length > 0 && searchResults[0].match_score >= 0.8) {
        valid.push({
          original: name,
          matched: searchResults[0],
        });
      } else {
        invalid.push({
          original: name,
          suggestions: searchResults.slice(0, 3), // Top 3 suggestions
        });
      }
    }

    return { valid, invalid };
  }
}