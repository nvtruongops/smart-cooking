/**
 * Ingredient Security & Validation Service
 * 
 * Prevents malicious users from polluting MASTER INGREDIENTS database
 * 
 * Security Measures:
 * 1. Content validation (no spam, SQL injection, XSS)
 * 2. Recipe verification (must be AI-generated from real cooking)
 * 3. Rating validation (prevent fake ratings)
 * 4. User reputation check (trusted users only)
 * 5. Manual review queue for suspicious ingredients
 */

import { logger } from '../shared/logger';
import { DynamoDBHelper } from '../shared/dynamodb';

export interface SecurityCheckResult {
  isValid: boolean;
  reason?: string;
  requiresManualReview: boolean;
  suspicionLevel: 'low' | 'medium' | 'high';
}

export interface IngredientValidation {
  name: string;
  isValid: boolean;
  issues: string[];
}

export class IngredientSecurityService {
  // Blacklist patterns
  private static readonly BLACKLIST_PATTERNS = [
    /script/i,
    /javascript/i,
    /onerror/i,
    /onclick/i,
    /<[^>]*>/g, // HTML tags
    /delete\s+from/i,
    /drop\s+table/i,
    /select\s+\*/i,
    /insert\s+into/i,
    /update\s+set/i,
    /union\s+select/i,
    /\-\-/g, // SQL comments
    /;/g, // Multiple SQL statements
    /exec\(/i,
    /eval\(/i,
    /function\s*\(/i,
  ];

  // Spam patterns
  private static readonly SPAM_PATTERNS = [
    /^(.)\1{4,}$/i, // aaaaa, bbbbb (repeated characters)
    /^test\d*$/i, // test, test123
    /^(xxx|zzz|aaa|bbb)/i,
    /^\d+$/g, // Only numbers
    /^[^a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ\s]+$/i, // No valid characters
  ];

  // Maximum allowed length for ingredient name
  private static readonly MAX_INGREDIENT_LENGTH = 100;
  
  // Minimum allowed length
  private static readonly MIN_INGREDIENT_LENGTH = 2;

  // Required fields for recipe to be eligible for enrichment
  private static readonly MIN_RECIPE_COOK_COUNT = 1; // Must be cooked at least once
  private static readonly MIN_RECIPE_AGE_HOURS = 1; // Recipe must be at least 1 hour old
  private static readonly MIN_USER_ACCOUNT_AGE_DAYS = 7; // User account must be at least 7 days old

  /**
   * Validate ingredient name for security issues
   */
  static validateIngredientName(name: string): IngredientValidation {
    const issues: string[] = [];

    // Check length
    if (!name || name.trim().length < this.MIN_INGREDIENT_LENGTH) {
      issues.push('Ingredient name too short');
    }

    if (name.length > this.MAX_INGREDIENT_LENGTH) {
      issues.push('Ingredient name too long');
    }

    // Check for blacklist patterns (SQL injection, XSS)
    for (const pattern of this.BLACKLIST_PATTERNS) {
      if (pattern.test(name)) {
        issues.push('Contains suspicious/malicious pattern');
        logger.warn('Blacklist pattern detected', {
          name,
          pattern: pattern.toString(),
        });
        break;
      }
    }

    // Check for spam patterns
    for (const pattern of this.SPAM_PATTERNS) {
      if (pattern.test(name)) {
        issues.push('Appears to be spam');
        logger.warn('Spam pattern detected', {
          name,
          pattern: pattern.toString(),
        });
        break;
      }
    }

    // Check for excessive special characters
    const specialCharCount = (name.match(/[^a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ\s]/gi) || []).length;
    if (specialCharCount > name.length / 2) {
      issues.push('Too many special characters');
    }

    return {
      name,
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Check if recipe is eligible for ingredient enrichment
   * Prevents spam and abuse
   */
  static async isRecipeEligibleForEnrichment(recipeId: string): Promise<SecurityCheckResult> {
    try {
      // Get recipe metadata
      const recipe = await DynamoDBHelper.get(`RECIPE#${recipeId}`, 'METADATA');
      
      if (!recipe) {
        return {
          isValid: false,
          reason: 'Recipe not found',
          requiresManualReview: false,
          suspicionLevel: 'high',
        };
      }

      // 🔒 CHECK 1: Recipe must be AI-generated (not user-created spam)
      if (!recipe.is_ai_generated) {
        return {
          isValid: false,
          reason: 'Only AI-generated recipes can enrich MASTER INGREDIENTS',
          requiresManualReview: true,
          suspicionLevel: 'medium',
        };
      }

      // 🔒 CHECK 2: Recipe must have been cooked (verified usage)
      const cookCount = recipe.cook_count || 0;
      if (cookCount < this.MIN_RECIPE_COOK_COUNT) {
        return {
          isValid: false,
          reason: 'Recipe must be cooked at least once before enrichment',
          requiresManualReview: false,
          suspicionLevel: 'low',
        };
      }

      // 🔒 CHECK 3: Recipe must be at least X hours old (prevent spam)
      const createdAt = new Date(recipe.created_at);
      const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      
      if (ageHours < this.MIN_RECIPE_AGE_HOURS) {
        return {
          isValid: false,
          reason: `Recipe must be at least ${this.MIN_RECIPE_AGE_HOURS} hour(s) old`,
          requiresManualReview: false,
          suspicionLevel: 'medium',
        };
      }

      // 🔒 CHECK 4: User account age (prevent bot attacks)
      const userId = recipe.user_id || recipe.created_by;
      if (userId) {
        const userProfile = await DynamoDBHelper.get(`USER#${userId}`, 'PROFILE');
        
        if (userProfile) {
          const accountCreatedAt = new Date(userProfile.created_at);
          const accountAgeDays = (Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
          
          if (accountAgeDays < this.MIN_USER_ACCOUNT_AGE_DAYS) {
            return {
              isValid: false,
              reason: `User account must be at least ${this.MIN_USER_ACCOUNT_AGE_DAYS} days old`,
              requiresManualReview: true,
              suspicionLevel: 'high',
            };
          }
        }
      }

      // 🔒 CHECK 5: Check rating patterns (detect fake ratings)
      const ratingValidation = await this.validateRatingPattern(recipeId);
      if (!ratingValidation.isValid) {
        return ratingValidation;
      }

      // All checks passed
      return {
        isValid: true,
        requiresManualReview: false,
        suspicionLevel: 'low',
      };

    } catch (error) {
      logger.error('Error checking recipe eligibility', { error, recipeId });
      return {
        isValid: false,
        reason: 'Error during validation',
        requiresManualReview: true,
        suspicionLevel: 'high',
      };
    }
  }

  /**
   * Validate rating pattern to detect fake ratings
   */
  private static async validateRatingPattern(recipeId: string): Promise<SecurityCheckResult> {
    try {
      // Get all ratings for this recipe
      const ratingsResult = await DynamoDBHelper.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `RECIPE#${recipeId}`,
          ':sk': 'RATING#',
        },
      });

      const ratings = ratingsResult.Items || [];

      if (ratings.length === 0) {
        return {
          isValid: false,
          reason: 'No ratings found',
          requiresManualReview: false,
          suspicionLevel: 'medium',
        };
      }

      // 🔒 CHECK: All ratings from same user (self-rating spam)
      const uniqueUsers = new Set(ratings.map((r: any) => r.user_id));
      if (uniqueUsers.size === 1 && ratings.length > 1) {
        return {
          isValid: false,
          reason: 'All ratings from same user (suspicious)',
          requiresManualReview: true,
          suspicionLevel: 'high',
        };
      }

      // 🔒 CHECK: All ratings are 5 stars (too perfect)
      const allPerfect = ratings.every((r: any) => r.rating === 5);
      if (allPerfect && ratings.length > 2) {
        return {
          isValid: true, // Still valid but requires review
          requiresManualReview: true,
          suspicionLevel: 'medium',
        };
      }

      // 🔒 CHECK: Ratings submitted too quickly (bot behavior)
      if (ratings.length >= 3) {
        const timestamps = ratings.map((r: any) => new Date(r.created_at).getTime()).sort();
        const timeDiffs = [];
        
        for (let i = 1; i < timestamps.length; i++) {
          timeDiffs.push(timestamps[i] - timestamps[i - 1]);
        }
        
        const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
        const oneMinute = 60 * 1000;
        
        if (avgTimeDiff < oneMinute) {
          return {
            isValid: false,
            reason: 'Ratings submitted too quickly (bot-like behavior)',
            requiresManualReview: true,
            suspicionLevel: 'high',
          };
        }
      }

      return {
        isValid: true,
        requiresManualReview: false,
        suspicionLevel: 'low',
      };

    } catch (error) {
      logger.error('Error validating rating pattern', { error, recipeId });
      return {
        isValid: true, // Don't block on error
        requiresManualReview: true,
        suspicionLevel: 'medium',
      };
    }
  }

  /**
   * Add ingredient to manual review queue
   */
  static async addToManualReviewQueue(
    recipeId: string,
    ingredientName: string,
    reason: string,
    suspicionLevel: string
  ): Promise<void> {
    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    await DynamoDBHelper.put({
      PK: `REVIEW_QUEUE#INGREDIENT`,
      SK: `${timestamp}#${reviewId}`,
      entity_type: 'ingredient_review',
      review_id: reviewId,
      recipe_id: recipeId,
      ingredient_name: ingredientName,
      reason: reason,
      suspicion_level: suspicionLevel,
      status: 'pending',
      created_at: timestamp,
      // GSI for admin dashboard
      GSI1PK: 'PENDING_REVIEWS',
      GSI1SK: timestamp,
    });

    logger.warn('Ingredient added to manual review queue', {
      reviewId,
      recipeId,
      ingredientName,
      reason,
      suspicionLevel,
    });
  }

  /**
   * Check user reputation
   */
  static async getUserReputationScore(userId: string): Promise<number> {
    try {
      // Get user's approved recipes
      const recipesResult = await DynamoDBHelper.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        FilterExpression: 'is_approved = :approved AND entity_type = :type',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':approved': true,
          ':type': 'recipe',
        },
      });

      const approvedRecipes = recipesResult.Items || [];
      
      // Get user's ratings
      const ratingsResult = await DynamoDBHelper.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'RATING#',
        },
      });

      const userRatings = ratingsResult.Items || [];

      // Calculate reputation score
      // - 10 points per approved recipe
      // - 1 point per rating given
      // - Bonus for high-rated recipes
      let score = 0;
      score += approvedRecipes.length * 10;
      score += userRatings.length * 1;
      
      // Add bonus for recipes with good ratings
      for (const recipe of approvedRecipes) {
        if ((recipe.average_rating || 0) >= 4.5) {
          score += 5;
        }
      }

      return score;

    } catch (error) {
      logger.error('Error calculating user reputation', { error, userId });
      return 0;
    }
  }

  /**
   * Comprehensive security check for ingredient enrichment
   */
  static async canEnrichIngredients(recipeId: string, userId: string): Promise<SecurityCheckResult> {
    // Check recipe eligibility
    const recipeCheck = await this.isRecipeEligibleForEnrichment(recipeId);
    
    if (!recipeCheck.isValid) {
      return recipeCheck;
    }

    // Check user reputation
    const reputation = await this.getUserReputationScore(userId);
    const MIN_REPUTATION = 5; // Need at least 5 points
    
    if (reputation < MIN_REPUTATION) {
      return {
        isValid: false,
        reason: `Insufficient user reputation (${reputation}/${MIN_REPUTATION}). Contribute more to the community first.`,
        requiresManualReview: true,
        suspicionLevel: 'medium',
      };
    }

    // If suspicion level is high, require manual review
    if (recipeCheck.suspicionLevel === 'high') {
      return {
        isValid: false,
        reason: 'Recipe flagged for manual review due to high suspicion level',
        requiresManualReview: true,
        suspicionLevel: 'high',
      };
    }

    return {
      isValid: true,
      requiresManualReview: false,
      suspicionLevel: 'low',
    };
  }
}
