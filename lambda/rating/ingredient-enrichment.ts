/**
 * Ingredient Enrichment Service
 * 
 * Automatically adds NEW ingredients to MASTER INGREDIENTS table
 * when a recipe is approved (rating >= 4.0)
 * 
 * Flow:
 * 1. Recipe rated >= 4.0 → Auto-approved
 * 2. Extract ingredients from recipe
 * 3. Check if ingredient exists in MASTER INGREDIENTS
 * 4. If NOT exists → Add to MASTER INGREDIENTS with AI-provided category
 * 5. Update search indexes (GSI2)
 */

import { DynamoDBHelper } from '../shared/dynamodb';
import { logger } from '../shared/logger';
import { v4 as uuidv4 } from 'uuid';
import { IngredientSecurityService } from './ingredient-security';

export interface RecipeIngredient {
  name: string;
  normalized_name: string;
  category: string;
  quantity: string;
  unit: string;
}

export interface MasterIngredient {
  ingredient_id: string;
  name: string;
  normalized_name: string;
  category: string;
  aliases: string[];
  is_active: boolean;
  source: 'manual' | 'ai_enriched' | 'user_contributed';
  created_at: string;
  updated_at: string;
}

export class IngredientEnrichmentService {
  /**
   * Normalize Vietnamese text for comparison
   */
  private static normalizeVietnamese(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .trim();
  }

  /**
   * Check if ingredient exists in MASTER INGREDIENTS
   */
  private static async ingredientExists(normalizedName: string): Promise<boolean> {
    try {
      // Search in GSI2 for exact match
      const result = await DynamoDBHelper.query({
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': 'INGREDIENT#SEARCH',
          ':sk': `NAME#${normalizedName}`,
        },
        Limit: 1,
      });

      return (result.Items?.length || 0) > 0;
    } catch (error) {
      logger.error('Error checking ingredient existence', { error, normalizedName });
      return false; // Assume doesn't exist if error
    }
  }

  /**
   * Create aliases from ingredient name
   */
  private static generateAliases(name: string, normalizedName: string): string[] {
    const aliases: string[] = [];
    
    // Add normalized version
    if (normalizedName !== name.toLowerCase()) {
      aliases.push(normalizedName);
    }
    
    // Add without diacritics
    const withoutDiacritics = this.normalizeVietnamese(name);
    if (!aliases.includes(withoutDiacritics)) {
      aliases.push(withoutDiacritics);
    }
    
    // Add common variations (remove common prefixes)
    const nameWithoutPrefix = name
      .replace(/^(thịt|cá|rau|củ|quả)\s+/i, '')
      .trim();
    
    if (nameWithoutPrefix !== name && nameWithoutPrefix.length > 2) {
      aliases.push(nameWithoutPrefix.toLowerCase());
      aliases.push(this.normalizeVietnamese(nameWithoutPrefix));
    }
    
    return [...new Set(aliases)]; // Remove duplicates
  }

  /**
   * Add new ingredient to MASTER INGREDIENTS
   */
  private static async addMasterIngredient(
    ingredient: RecipeIngredient,
    source: 'ai_enriched' | 'user_contributed' = 'ai_enriched'
  ): Promise<string> {
    const ingredientId = uuidv4();
    const timestamp = new Date().toISOString();
    const normalizedName = this.normalizeVietnamese(ingredient.name);
    const aliases = this.generateAliases(ingredient.name, ingredient.normalized_name);

    // Create main ingredient entry
    await DynamoDBHelper.put({
      PK: `INGREDIENT#${ingredientId}`,
      SK: 'METADATA',
      entity_type: 'MASTER_INGREDIENT',
      ingredient_id: ingredientId,
      name: ingredient.name,
      normalized_name: normalizedName,
      category: ingredient.category,
      aliases: aliases,
      is_active: true,
      source: source,
      created_at: timestamp,
      updated_at: timestamp,
      // GSI1 for category browsing
      GSI1PK: `CATEGORY#${ingredient.category}`,
      GSI1SK: `NAME#${normalizedName}`,
      // GSI2 for search
      GSI2PK: 'INGREDIENT#SEARCH',
      GSI2SK: `NAME#${normalizedName}`,
    });

    logger.info('Added new MASTER INGREDIENT', {
      ingredientId,
      name: ingredient.name,
      category: ingredient.category,
      source,
    });

    // Create alias entries for better search
    for (let i = 0; i < aliases.length; i++) {
      const alias = aliases[i];
      await DynamoDBHelper.put({
        PK: `INGREDIENT#${ingredientId}`,
        SK: `ALIAS#${String(i + 1).padStart(3, '0')}`,
        entity_type: 'INGREDIENT_ALIAS',
        ingredient_id: ingredientId,
        alias: alias,
        normalized_alias: this.normalizeVietnamese(alias),
        created_at: timestamp,
        // GSI2 for alias search
        GSI2PK: 'INGREDIENT#SEARCH',
        GSI2SK: `NAME#${this.normalizeVietnamese(alias)}`,
      });
    }

    logger.info('Created alias entries', {
      ingredientId,
      aliasCount: aliases.length,
    });

    return ingredientId;
  }

  /**
   * Get recipe ingredients
   */
  private static async getRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]> {
    try {
      const result = await DynamoDBHelper.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `RECIPE#${recipeId}`,
          ':sk': 'INGREDIENT#',
        },
      });

      return result.Items as RecipeIngredient[] || [];
    } catch (error) {
      logger.error('Error getting recipe ingredients', { error, recipeId });
      return [];
    }
  }

  /**
   * Main function: Enrich MASTER INGREDIENTS from approved recipe
   * 
   * Called after recipe is auto-approved (rating >= 4.0)
   * 
   * 🔒 SECURITY: Validates recipe and ingredients before enrichment
   */
  static async enrichFromApprovedRecipe(recipeId: string): Promise<{
    totalIngredients: number;
    newIngredients: number;
    existingIngredients: number;
    rejectedIngredients: number;
    addedIngredientIds: string[];
    securityIssues: string[];
  }> {
    logger.info('Starting ingredient enrichment with security checks', { recipeId });

    try {
      // 🔒 SECURITY CHECK 1: Get recipe and validate
      const recipe = await DynamoDBHelper.get(`RECIPE#${recipeId}`, 'METADATA');
      
      if (!recipe) {
        throw new Error('Recipe not found');
      }

      const userId = recipe.user_id || recipe.created_by;
      
      // 🔒 SECURITY CHECK 2: Comprehensive security validation
      const securityCheck = await IngredientSecurityService.canEnrichIngredients(recipeId, userId);
      
      if (!securityCheck.isValid) {
        logger.warn('Recipe FAILED security check - enrichment blocked', {
          recipeId,
          reason: securityCheck.reason,
          suspicionLevel: securityCheck.suspicionLevel,
        });
        
        return {
          totalIngredients: 0,
          newIngredients: 0,
          existingIngredients: 0,
          rejectedIngredients: 0,
          addedIngredientIds: [],
          securityIssues: [securityCheck.reason || 'Security check failed'],
        };
      }

      // Get all ingredients from recipe
      const recipeIngredients = await this.getRecipeIngredients(recipeId);
      
      if (recipeIngredients.length === 0) {
        logger.warn('No ingredients found in recipe', { recipeId });
        return {
          totalIngredients: 0,
          newIngredients: 0,
          existingIngredients: 0,
          rejectedIngredients: 0,
          addedIngredientIds: [],
          securityIssues: [],
        };
      }

      const addedIngredientIds: string[] = [];
      const securityIssues: string[] = [];
      let newCount = 0;
      let existingCount = 0;
      let rejectedCount = 0;

      // Process each ingredient
      for (const ingredient of recipeIngredients) {
        // Skip if ingredient has no category (invalid)
        if (!ingredient.category || !ingredient.name) {
          logger.warn('Skipping ingredient without category or name', { ingredient });
          rejectedCount++;
          continue;
        }

        // 🔒 SECURITY CHECK 3: Validate ingredient name
        const validation = IngredientSecurityService.validateIngredientName(ingredient.name);
        
        if (!validation.isValid) {
          logger.warn('Ingredient REJECTED due to security issues', {
            name: ingredient.name,
            issues: validation.issues,
          });
          
          securityIssues.push(`"${ingredient.name}": ${validation.issues.join(', ')}`);
          rejectedCount++;
          
          // Add to manual review queue
          await IngredientSecurityService.addToManualReviewQueue(
            recipeId,
            ingredient.name,
            validation.issues.join(', '),
            'high'
          );
          
          continue;
        }

        // Check if ingredient already exists
        const normalizedName = this.normalizeVietnamese(ingredient.name);
        const exists = await this.ingredientExists(normalizedName);

        if (exists) {
          logger.info('Ingredient already exists in MASTER', {
            name: ingredient.name,
            normalizedName,
          });
          existingCount++;
        } else {
          // Add new ingredient to MASTER INGREDIENTS
          logger.info('Adding NEW ingredient to MASTER (security validated)', {
            name: ingredient.name,
            category: ingredient.category,
          });

          const ingredientId = await this.addMasterIngredient(ingredient, 'ai_enriched');
          addedIngredientIds.push(ingredientId);
          newCount++;
        }
      }

      const result = {
        totalIngredients: recipeIngredients.length,
        newIngredients: newCount,
        existingIngredients: existingCount,
        rejectedIngredients: rejectedCount,
        addedIngredientIds,
        securityIssues,
      };

      logger.info('Ingredient enrichment completed with security', result);

      return result;

    } catch (error) {
      logger.error('Error enriching ingredients', { error, recipeId });
      throw error;
    }
  }

  /**
   * Batch enrich from multiple approved recipes
   */
  static async batchEnrichFromRecipes(recipeIds: string[]): Promise<{
    processedRecipes: number;
    totalNewIngredients: number;
    errors: string[];
  }> {
    logger.info('Starting batch ingredient enrichment', {
      recipeCount: recipeIds.length,
    });

    let totalNewIngredients = 0;
    const errors: string[] = [];

    for (const recipeId of recipeIds) {
      try {
        const result = await this.enrichFromApprovedRecipe(recipeId);
        totalNewIngredients += result.newIngredients;
      } catch (error) {
        const errorMsg = `Failed to enrich from recipe ${recipeId}: ${error}`;
        logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return {
      processedRecipes: recipeIds.length - errors.length,
      totalNewIngredients,
      errors,
    };
  }
}
