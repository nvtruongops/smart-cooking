/**
 * Ingredient Extractor Service
 * Extracts ingredient names from recipe ingredients and saves to master DB
 */

import { DynamoDBHelper } from './dynamodb';
import { IngredientService } from './ingredient-service';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

export interface ExtractedIngredient {
  original: string;
  name: string;
  quantity?: string;
  unit?: string;
}

export interface IngredientExtractionResult {
  extracted: ExtractedIngredient[];
  savedToMaster: number;
  alreadyExists: number;
  failed: number;
}

export class IngredientExtractor {
  /**
   * Extract ingredient name from a recipe ingredient string
   * Examples:
   *   "300g thịt gà" → { name: "thịt gà", quantity: "300", unit: "g" }
   *   "2 củ cà rốt" → { name: "cà rốt", quantity: "2", unit: "củ" }
   *   "1 chút muối" → { name: "muối", quantity: "1", unit: "chút" }
   */
  static extractIngredientName(ingredientString: string): ExtractedIngredient {
    const original = ingredientString.trim();
    
    // Common Vietnamese units
    const units = [
      'g', 'kg', 'ml', 'l', 'lít', 'gram', 'kilogram',
      'củ', 'quả', 'trái', 'cây', 'nhánh', 'lá', 'bó',
      'muống', 'thìa', 'muỗng', 'chén', 'bát', 'ly',
      'chút', 'ít', 'tí', 'tẹo', 'miếng', 'lát', 'khoanh',
      'tbsp', 'tsp', 'cup', 'oz', 'lb'
    ];

    // Regex to match: [number] [unit] [ingredient name]
    // Examples: "300g thịt gà", "2 củ cà rốt", "1 chút muối"
    const quantityUnitPattern = new RegExp(
      `^([\\d.]+)\\s*(${units.join('|')})?\\s*(.+)$`,
      'i'
    );

    const match = original.match(quantityUnitPattern);
    
    if (match) {
      return {
        original,
        quantity: match[1],
        unit: match[2] || undefined,
        name: match[3].trim()
      };
    }

    // If no quantity/unit pattern found, try to remove leading numbers
    const simpleNumberPattern = /^[\d.]+\s+(.+)$/;
    const simpleMatch = original.match(simpleNumberPattern);
    
    if (simpleMatch) {
      return {
        original,
        name: simpleMatch[1].trim()
      };
    }

    // Return as-is if no pattern matches
    return {
      original,
      name: original
    };
  }

  /**
   * Extract all ingredient names from a recipe's ingredient list
   */
  static extractIngredientsFromRecipe(ingredients: string[]): ExtractedIngredient[] {
    if (!ingredients || ingredients.length === 0) {
      return [];
    }

    return ingredients.map(ingredient => this.extractIngredientName(ingredient));
  }

  /**
   * Save an ingredient to master database if it doesn't exist
   * Returns true if saved, false if already exists
   */
  static async saveToMasterDB(ingredientName: string, sourceRecipeId?: string): Promise<boolean> {
    try {
      const normalizedName = IngredientService.normalizeVietnamese(ingredientName);

      // Check if ingredient already exists
      const searchResults = await IngredientService.searchIngredients(ingredientName, {
        limit: 1,
        fuzzyThreshold: 0.9 // High threshold for exact matches
      });

      // If exact match exists, don't save
      if (searchResults.length > 0 && searchResults[0].match_score >= 0.95) {
        logger.info('Ingredient already exists in master DB', {
          name: ingredientName,
          existingId: searchResults[0].ingredient_id,
          matchScore: searchResults[0].match_score
        });
        return false;
      }

      // Create new master ingredient
      const ingredientId = uuidv4();
      const now = new Date().toISOString();

      // Determine category based on keywords (simple heuristic)
      const category = this.categorizeIngredient(ingredientName);

      const masterIngredient = {
        PK: `INGREDIENT#${ingredientId}`,
        SK: 'METADATA',
        entity_type: 'MASTER_INGREDIENT',
        ingredient_id: ingredientId,
        name: ingredientName,
        normalized_name: normalizedName,
        category,
        aliases: [],
        
        // Metadata
        source: sourceRecipeId ? 'recipe_extraction' : 'user_input',
        source_recipe_id: sourceRecipeId,
        usage_count: 1,
        created_at: now,
        updated_at: now,

        // GSI indexes for search
        GSI1PK: `CATEGORY#${category}`,
        GSI1SK: ingredientName,
        GSI2PK: 'INGREDIENT#SEARCH',
        GSI2SK: `NAME#${normalizedName}`
      };

      await DynamoDBHelper.put(masterIngredient);

      logger.info('Saved new ingredient to master DB', {
        ingredientId,
        name: ingredientName,
        category,
        sourceRecipeId
      });

      return true;
    } catch (error) {
      logger.error('Error saving ingredient to master DB', {
        error,
        ingredientName,
        sourceRecipeId
      });
      return false;
    }
  }

  /**
   * Simple ingredient categorization based on keywords
   */
  private static categorizeIngredient(name: string): string {
    const nameLower = name.toLowerCase();

    const categories: { [key: string]: string[] } = {
      'meat': ['thịt', 'gà', 'heo', 'bò', 'vịt', 'cá', 'tôm', 'mực', 'sườn', 'ba chỉ'],
      'vegetable': ['rau', 'cải', 'cà', 'bắp', 'khoai', 'củ', 'đậu', 'măng', 'nấm', 'bí'],
      'spice': ['muối', 'đường', 'tiêu', 'ớt', 'tỏi', 'hành', 'gừng', 'sả', 'tương', 'nước mắm'],
      'herb': ['húng', 'rau thơm', 'ngò', 'kinh giới', 'húng quế', 'lá'],
      'grain': ['gạo', 'bột', 'bánh', 'mì', 'phở', 'bún', 'miến'],
      'dairy': ['sữa', 'trứng', 'phô mai', 'bơ', 'cream'],
      'oil': ['dầu', 'mỡ'],
      'other': []
    };

    for (const [category, keywords] of Object.entries(categories)) {
      for (const keyword of keywords) {
        if (nameLower.includes(keyword)) {
          return category;
        }
      }
    }

    return 'other';
  }

  /**
   * Process all ingredients from a recipe and save to master DB
   */
  static async processRecipeIngredients(
    recipeIngredients: string[],
    recipeId: string
  ): Promise<IngredientExtractionResult> {
    const extracted = this.extractIngredientsFromRecipe(recipeIngredients);
    
    let savedToMaster = 0;
    let alreadyExists = 0;
    let failed = 0;

    logger.info('Processing recipe ingredients for master DB', {
      recipeId,
      totalIngredients: extracted.length,
      ingredients: extracted.map(i => i.name)
    });

    // Process each ingredient
    for (const ingredient of extracted) {
      try {
        const saved = await this.saveToMasterDB(ingredient.name, recipeId);
        if (saved) {
          savedToMaster++;
        } else {
          alreadyExists++;
        }
      } catch (error) {
        logger.error('Failed to process ingredient', {
          error,
          ingredient: ingredient.name,
          recipeId
        });
        failed++;
      }
    }

    const result: IngredientExtractionResult = {
      extracted,
      savedToMaster,
      alreadyExists,
      failed
    };

    logger.info('Completed recipe ingredient processing', {
      recipeId,
      ...result
    });

    return result;
  }

  /**
   * Batch process multiple recipes
   */
  static async batchProcessRecipes(
    recipes: Array<{ recipe_id: string; ingredients: string[] }>
  ): Promise<{
    totalProcessed: number;
    totalExtracted: number;
    totalSavedToMaster: number;
    totalAlreadyExists: number;
    totalFailed: number;
  }> {
    let totalExtracted = 0;
    let totalSavedToMaster = 0;
    let totalAlreadyExists = 0;
    let totalFailed = 0;

    logger.info('Starting batch ingredient processing', {
      recipeCount: recipes.length
    });

    for (const recipe of recipes) {
      if (!recipe.ingredients || recipe.ingredients.length === 0) {
        continue;
      }

      const result = await this.processRecipeIngredients(
        recipe.ingredients,
        recipe.recipe_id
      );

      totalExtracted += result.extracted.length;
      totalSavedToMaster += result.savedToMaster;
      totalAlreadyExists += result.alreadyExists;
      totalFailed += result.failed;
    }

    const summary = {
      totalProcessed: recipes.length,
      totalExtracted,
      totalSavedToMaster,
      totalAlreadyExists,
      totalFailed
    };

    logger.info('Completed batch ingredient processing', summary);

    return summary;
  }
}
