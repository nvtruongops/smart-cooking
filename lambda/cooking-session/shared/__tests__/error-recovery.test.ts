/**
 * Tests for error recovery system
 */

import { ErrorRecoveryManager, executeWithRecovery, healthCheckWithRecovery } from '../error-recovery';
import { AIServiceError, DatabaseError, TimeoutError, ServiceUnavailableError } from '../errors';
import { logger } from '../logger';
import { metrics } from '../metrics';
import { DynamoDBHelper } from '../dynamodb';

// Mock dependencies
jest.mock('../logger');
jest.mock('../metrics');
jest.mock('../dynamodb');

describe('ErrorRecoveryManager', () => {
  let recoveryManager: ErrorRecoveryManager;

  beforeEach(() => {
    recoveryManager = new ErrorRecoveryManager();
    jest.clearAllMocks();
  });

  describe('recover', () => {
    it('should recover from AI service failure', async () => {
      const error = new AIServiceError('AI service failed');
      const context = {
        operation: 'ai-suggestion',
        userId: 'user-123',
        originalRequest: {
          ingredients: ['chicken', 'rice'],
          recipe_count: 2
        }
      };

      // Mock database recipes
      (DynamoDBHelper.searchRecipesByMethod as jest.Mock).mockResolvedValue({
        Items: [
          { recipe_id: '1', title: 'Chicken Rice' },
          { recipe_id: '2', title: 'Fried Rice' }
        ]
      });

      const result = await recoveryManager.recover(error, context);

      expect(result).toMatchObject({
        suggestions: expect.any(Array),
        stats: {
          requested: 2,
          from_database: expect.any(Number),
          from_ai: 0
        },
        warnings: [{
          message: 'AI service temporarily unavailable. Showing database recipes only.',
          type: 'ai_fallback'
        }]
      });

      expect(metrics.trackFallbackUsage).toHaveBeenCalledWith('ai-suggestion', true);
    });

    it('should handle database error recovery', async () => {
      const error = new DatabaseError('Database connection failed');
      const context = {
        operation: 'get-user-profile',
        userId: 'user-123'
      };

      // Should attempt database retry strategy but fail since it's not implemented
      await expect(
        recoveryManager.recover(error, context)
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle timeout error recovery', async () => {
      const error = new TimeoutError('Operation timed out');
      const context = {
        operation: 'ai-suggestion',
        userId: 'user-123',
        originalRequest: {
          ingredients: ['chicken'],
          recipe_count: 1
        }
      };

      // Mock database recipes for AI fallback
      (DynamoDBHelper.searchRecipesByMethod as jest.Mock).mockResolvedValue({
        Items: [{ recipe_id: '1', title: 'Chicken Dish' }]
      });

      const result = await recoveryManager.recover(error, context);

      expect(result.warnings).toContainEqual({
        message: 'AI service temporarily unavailable. Showing database recipes only.',
        type: 'ai_fallback'
      });
    });

    it('should handle partial success recovery', async () => {
      const error = new Error('partial failure detected');
      const context = {
        operation: 'batch-operation',
        userId: 'user-123',
        metadata: {
          allowPartialSuccess: true,
          partialResults: {
            successful: ['item1', 'item2'],
            failed: ['item3']
          }
        }
      };

      const result = await recoveryManager.recover(error, context);

      expect(result).toMatchObject({
        successful: ['item1', 'item2'],
        failed: ['item3'],
        warnings: [{
          message: 'Some operations failed. Showing partial results.',
          type: 'partial_success'
        }]
      });
    });

    it('should throw error when no recovery strategy available', async () => {
      const error = new Error('Unknown error');
      const context = {
        operation: 'unknown-operation',
        userId: 'user-123'
      };

      await expect(
        recoveryManager.recover(error, context)
      ).rejects.toThrow('Unknown error');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No recovery strategy found'),
        expect.any(Object)
      );
    });

    it('should try multiple strategies in priority order', async () => {
      const error = new AIServiceError('AI failed');
      const context = {
        operation: 'test-operation',
        userId: 'user-123'
      };

      // Mock first strategy to fail
      const originalRecover = recoveryManager['recoverFromAIFailure'];
      recoveryManager['recoverFromAIFailure'] = jest.fn().mockRejectedValue(new Error('First strategy failed'));

      await expect(
        recoveryManager.recover(error, context)
      ).rejects.toThrow('AI failed');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Recovery strategy AI_SERVICE_FALLBACK failed'),
        expect.any(Object)
      );

      expect(metrics.trackFallbackUsage).toHaveBeenCalledWith('test-operation', false);

      // Restore original method
      recoveryManager['recoverFromAIFailure'] = originalRecover;
    });
  });

  describe('registerStrategy', () => {
    it('should register and sort strategies by priority', () => {
      const strategy1 = {
        name: 'HIGH_PRIORITY',
        priority: 1,
        canHandle: () => true,
        recover: async () => 'result1'
      };

      const strategy2 = {
        name: 'LOW_PRIORITY',
        priority: 10,
        canHandle: () => true,
        recover: async () => 'result2'
      };

      recoveryManager.registerStrategy(strategy2);
      recoveryManager.registerStrategy(strategy1);

      // Strategies should be sorted by priority (lower number = higher priority)
      const strategies = recoveryManager['strategies'];
      expect(strategies[0].name).toBe('AI_SERVICE_FALLBACK'); // Default strategy with priority 1
      expect(strategies.find(s => s.name === 'HIGH_PRIORITY')).toBeDefined();
      expect(strategies.find(s => s.name === 'LOW_PRIORITY')).toBeDefined();
    });
  });

  describe('getDatabaseRecipes', () => {
    it('should get recipes from different cooking methods', async () => {
      const mockRecipes = [
        { recipe_id: '1', title: 'Stir Fry', cooking_method: 'stir-fry' },
        { recipe_id: '2', title: 'Soup', cooking_method: 'soup' }
      ];

      (DynamoDBHelper.searchRecipesByMethod as jest.Mock)
        .mockResolvedValueOnce({ Items: [mockRecipes[0]] })
        .mockResolvedValueOnce({ Items: [mockRecipes[1]] });

      const result = await recoveryManager['getDatabaseRecipes'](['chicken'], 2);

      expect(result).toHaveLength(2);
      expect(DynamoDBHelper.searchRecipesByMethod).toHaveBeenCalledWith('stir-fry', 2);
      expect(DynamoDBHelper.searchRecipesByMethod).toHaveBeenCalledWith('soup', 2);
    });

    it('should handle database query failures gracefully', async () => {
      (DynamoDBHelper.searchRecipesByMethod as jest.Mock).mockRejectedValue(new Error('DB failed'));

      const result = await recoveryManager['getDatabaseRecipes'](['chicken'], 2);

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get database recipes for fallback',
        expect.any(Error)
      );
    });
  });

  describe('reduceRequestScope', () => {
    it('should reduce recipe count', () => {
      const originalRequest = {
        recipe_count: 4,
        ingredients: ['a', 'b', 'c', 'd', 'e']
      };

      const reduced = recoveryManager['reduceRequestScope'](originalRequest);

      expect(reduced.recipe_count).toBe(2); // Half of 4
      expect(reduced.ingredients).toHaveLength(3); // Max 3 ingredients
    });

    it('should not reduce below minimum values', () => {
      const originalRequest = {
        recipe_count: 1,
        ingredients: ['a', 'b']
      };

      const reduced = recoveryManager['reduceRequestScope'](originalRequest);

      expect(reduced.recipe_count).toBe(1); // Should not go below 1
      expect(reduced.ingredients).toHaveLength(2); // Should not reduce if <= 3
    });
  });
});

describe('executeWithRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute operation successfully without recovery', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    const context = { operation: 'test-op' };

    const result = await executeWithRecovery(operation, context);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should attempt recovery on operation failure', async () => {
    const operation = jest.fn().mockRejectedValue(new AIServiceError('AI failed'));
    const context = {
      operation: 'ai-suggestion',
      originalRequest: {
        ingredients: ['chicken'],
        recipe_count: 1
      }
    };

    // Mock database recipes
    (DynamoDBHelper.searchRecipesByMethod as jest.Mock).mockResolvedValue({
      Items: [{ recipe_id: '1', title: 'Chicken Dish' }]
    });

    const result = await executeWithRecovery(operation, context);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      suggestions: expect.any(Array),
      warnings: expect.arrayContaining([
        expect.objectContaining({
          type: 'ai_fallback'
        })
      ])
    });
  });
});

describe('healthCheckWithRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return healthy when health check passes', async () => {
    const healthCheck = jest.fn().mockResolvedValue(undefined);

    const result = await healthCheckWithRecovery('test-service', healthCheck);

    expect(result).toEqual({ healthy: true });
    expect(metrics.trackServiceHealth).toHaveBeenCalledWith('test-service', true);
  });

  it('should attempt recovery when health check fails', async () => {
    const healthCheck = jest.fn().mockRejectedValue(new Error('Health check failed'));

    // Mock recovery to succeed
    (DynamoDBHelper.searchRecipesByMethod as jest.Mock).mockResolvedValue({ Items: [] });

    const result = await healthCheckWithRecovery('test-service', healthCheck);

    expect(result.healthy).toBe(false);
    expect(result.recoveryAttempted).toBe(true);
    expect(result.message).toBe('Health check failed');
    expect(metrics.trackServiceHealth).toHaveBeenCalledWith('test-service', false);
  });
});