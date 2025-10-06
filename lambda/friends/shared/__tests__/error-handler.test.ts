/**
 * Tests for centralized error handling system
 */

import { ErrorHandler, CircuitBreaker } from '../error-handler';
import { 
  AppError, 
  ErrorCode, 
  AIServiceError, 
  DatabaseError, 
  TimeoutError,
  BadRequestError,
  ValidationError 
} from '../errors';
import { logger } from '../logger';
import { metrics } from '../metrics';
import * as utils from '../utils';

// Mock dependencies
jest.mock('../logger');
jest.mock('../metrics');
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  retryWithExponentialBackoff: jest.fn()
}));

describe('ErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleError', () => {
    it('should handle AppError correctly', () => {
      const error = new BadRequestError('Invalid input');
      const options = {
        operation: 'test-operation',
        userId: 'user-123',
        requestId: 'req-456'
      };

      const response = ErrorHandler.handleError(error, options);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toMatchObject({
        error: {
          code: ErrorCode.BAD_REQUEST,
          message: 'Invalid input',
          recoverable: true
        }
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Error in test-operation',
        error,
        expect.objectContaining({
          userId: 'user-123',
          requestId: 'req-456',
          operation: 'test-operation'
        })
      );

      expect(metrics.trackError).toHaveBeenCalledWith(
        'test-operation',
        'BadRequestError',
        400
      );
    });

    it('should handle generic Error correctly', () => {
      const error = new Error('Generic error');
      const options = { operation: 'test-operation' };

      const response = ErrorHandler.handleError(error, options);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toMatchObject({
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred',
          recoverable: true
        }
      });
    });
  });

  describe('executeWithErrorHandling', () => {
    it('should execute operation successfully', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const options = { operation: 'test-op' };

      const result = await ErrorHandler.executeWithErrorHandling(operation, options);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should execute fallback on error when enabled', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const fallbackFn = jest.fn().mockResolvedValue('fallback-result');
      const options = {
        operation: 'test-op',
        enableFallback: true,
        fallbackFn
      };

      const result = await ErrorHandler.executeWithErrorHandling(operation, options);

      expect(result).toBe('fallback-result');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should retry operation when enabled', async () => {
      // Mock retryWithExponentialBackoff to call the operation function
      (utils.retryWithExponentialBackoff as jest.Mock).mockImplementation(async (fn: any, options: any) => {
        // Call the operation function which will retry internally
        return await fn();
      });

      const operation = jest.fn().mockResolvedValue('success');

      const options = {
        operation: 'test-op',
        enableRetry: true,
        retryOptions: {
          maxRetries: 2,
          baseDelay: 10
        }
      };

      const result = await ErrorHandler.executeWithErrorHandling(operation, options);

      expect(result).toBe('success');
      expect(utils.retryWithExponentialBackoff).toHaveBeenCalled();
      expect(operation).toHaveBeenCalled();
    });
  });

  describe('createUserFriendlyError', () => {
    it('should return AppError as-is', () => {
      const error = new ValidationError('Validation failed');
      const result = ErrorHandler.createUserFriendlyError(error);

      expect(result).toBe(error);
    });

    it('should convert AWS ValidationException', () => {
      const error = new Error('Invalid parameter');
      error.name = 'ValidationException';

      const result = ErrorHandler.createUserFriendlyError(error);

      expect(result).toBeInstanceOf(ValidationError);
      expect(result.message).toContain('invalid data');
    });

    it('should convert timeout errors', () => {
      const error = new Error('Operation timed out');
      error.name = 'TimeoutError';

      const result = ErrorHandler.createUserFriendlyError(error, 'AI generation');

      expect(result).toBeInstanceOf(TimeoutError);
      expect(result.message).toContain('AI generation timed out');
    });

    it('should convert AI service errors', () => {
      const error = new Error('bedrock service failed');

      const result = ErrorHandler.createUserFriendlyError(error);

      expect(result).toBeInstanceOf(AIServiceError);
      expect(result.message).toContain('AI service is temporarily unavailable');
      expect(result.recoverable).toBe(true);
    });
  });

  describe('validateRequest', () => {
    it('should validate request successfully', () => {
      const body = JSON.stringify({ field1: 'value1', field2: 'value2' });
      const requiredFields = ['field1'];

      const result = ErrorHandler.validateRequest(body, requiredFields);

      expect(result).toEqual({ field1: 'value1', field2: 'value2' });
    });

    it('should throw error for missing body', () => {
      expect(() => {
        ErrorHandler.validateRequest(null);
      }).toThrow(BadRequestError);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => {
        ErrorHandler.validateRequest('invalid json');
      }).toThrow(BadRequestError);
    });

    it('should throw error for missing required fields', () => {
      const body = JSON.stringify({ field1: 'value1' });
      const requiredFields = ['field1', 'field2'];

      expect(() => {
        ErrorHandler.validateRequest(body, requiredFields);
      }).toThrow(ValidationError);
    });
  });

  describe('extractUserId', () => {
    it('should extract user ID successfully', () => {
      const event = {
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123'
            }
          }
        }
      };

      const userId = ErrorHandler.extractUserId(event);

      expect(userId).toBe('user-123');
    });

    it('should throw error for missing user ID', () => {
      const event = { requestContext: {} };

      expect(() => {
        ErrorHandler.extractUserId(event);
      }).toThrow('Authentication required');
    });
  });

  describe('handleAIServiceFailure', () => {
    it('should execute AI operation successfully', async () => {
      const aiOperation = jest.fn().mockResolvedValue('ai-result');
      const fallbackOperation = jest.fn();

      const result = await ErrorHandler.handleAIServiceFailure(
        aiOperation,
        fallbackOperation,
        'test-context'
      );

      expect(result).toBe('ai-result');
      expect(aiOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).not.toHaveBeenCalled();
    });

    it('should use fallback when AI operation fails', async () => {
      const aiOperation = jest.fn().mockRejectedValue(new Error('AI failed'));
      const fallbackOperation = jest.fn().mockResolvedValue({ data: 'fallback' });

      const result = await ErrorHandler.handleAIServiceFailure(
        aiOperation,
        fallbackOperation,
        'test-context'
      );

      expect(result).toEqual({
        data: 'fallback',
        warnings: [{
          message: 'AI service temporarily unavailable. Showing database recipes only.',
          type: 'ai_fallback'
        }]
      });
      expect(aiOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).toHaveBeenCalledTimes(1);
    });

    it('should throw ServiceUnavailableError when both fail', async () => {
      const aiOperation = jest.fn().mockRejectedValue(new Error('AI failed'));
      const fallbackOperation = jest.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(
        ErrorHandler.handleAIServiceFailure(aiOperation, fallbackOperation, 'test-context')
      ).rejects.toThrow('Recipe suggestion service');
    });
  });

  describe('withTimeout', () => {
    it('should complete operation within timeout', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await ErrorHandler.withTimeout(operation, 1000, 'test-op');

      expect(result).toBe('success');
    });

    it('should timeout operation that takes too long', async () => {
      const operation = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      await expect(
        ErrorHandler.withTimeout(operation, 100, 'test-op')
      ).rejects.toThrow(TimeoutError);
    });
  });

  describe('handleBatchOperation', () => {
    it('should handle all successful items', async () => {
      const items = ['item1', 'item2', 'item3'];
      const operation = jest.fn().mockImplementation(item => Promise.resolve(`processed-${item}`));

      const result = await ErrorHandler.handleBatchOperation(items, operation, 'test-batch');

      expect(result.successful).toEqual(['processed-item1', 'processed-item2', 'processed-item3']);
      expect(result.failed).toEqual([]);
      expect(result.partialSuccess).toBe(false);
    });

    it('should handle partial success', async () => {
      const items = ['item1', 'item2', 'item3'];
      const operation = jest.fn()
        .mockResolvedValueOnce('processed-item1')
        .mockRejectedValueOnce(new Error('Failed item2'))
        .mockResolvedValueOnce('processed-item3');

      const result = await ErrorHandler.handleBatchOperation(items, operation, 'test-batch');

      expect(result.successful).toEqual(['processed-item1', 'processed-item3']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].item).toBe('item2');
      expect(result.partialSuccess).toBe(true);
    });
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', 2, 1000);
  });

  it('should execute operation successfully when closed', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    const result = await circuitBreaker.execute(operation);

    expect(result).toBe('success');
    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker.getFailureCount()).toBe(0);
  });

  it('should open circuit after failure threshold', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Service failed'));

    // First failure
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service failed');
    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker.getFailureCount()).toBe(1);

    // Second failure - should open circuit
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service failed');
    expect(circuitBreaker.getState()).toBe('OPEN');
    expect(circuitBreaker.getFailureCount()).toBe(2);
  });

  it('should reject requests when circuit is open', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Service failed'));

    // Trigger circuit to open
    await expect(circuitBreaker.execute(operation)).rejects.toThrow();
    await expect(circuitBreaker.execute(operation)).rejects.toThrow();

    // Now circuit should be open and reject immediately
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('test-service is temporarily unavailable');
    
    // Operation should not have been called the third time
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should reset on successful operation', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('Service failed'))
      .mockResolvedValue('success');

    // First failure
    await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service failed');
    expect(circuitBreaker.getFailureCount()).toBe(1);

    // Success should reset
    const result = await circuitBreaker.execute(operation);
    expect(result).toBe('success');
    expect(circuitBreaker.getFailureCount()).toBe(0);
    expect(circuitBreaker.getState()).toBe('CLOSED');
  });
});