/**
 * Integration tests for monitoring system
 * Tests logger, metrics, and tracer integration
 */

import { logger } from '../logger';
import { metrics, MetricsPublisher } from '../metrics';
import { 
  initializeMonitoring, 
  withMonitoring, 
  trackBusinessEvent,
  validateMonitoringConfig
} from '../monitoring-setup';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({})
  })),
  PutMetricDataCommand: jest.fn(),
  StandardUnit: {
    None: 'None',
    Count: 'Count',
    Milliseconds: 'Milliseconds',
    Percent: 'Percent'
  }
}));

jest.mock('aws-xray-sdk-core', () => ({
  captureAsyncFunc: jest.fn((name, fn) => fn()),
  getSegment: jest.fn(() => null),
  captureAWSv3Client: jest.fn((client) => client)
}));

describe('Monitoring Integration', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.LOG_LEVEL;
    delete process.env._X_AMZN_TRACE_ID;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.AWS_REGION;
    
    // Clear logger context
    logger.clearContext();
    
    // Clear console spies
    jest.clearAllMocks();
  });

  describe('Logger Integration', () => {
    it('should initialize logger with event context', () => {
      const mockEvent = {
        requestContext: {
          requestId: 'test-request-id',
          authorizer: {
            claims: {
              sub: 'test-user-id'
            }
          }
        }
      };

      logger.initFromEvent(mockEvent);
      const context = logger.getContext();

      expect(context.requestId).toBe('test-request-id');
      expect(context.userId).toBe('test-user-id');
    });

    it('should log structured JSON messages', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.info('Test message', { key: 'value' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"INFO"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test message"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"key":"value"')
      );
    });

    it('should respect log level configuration', () => {
      process.env.LOG_LEVEL = 'ERROR';
      
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Create new logger instance to pick up env var
      const testLogger = new (logger.constructor as any)();
      
      testLogger.info('Should not log');
      testLogger.error('Should log');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should log performance metrics', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.logPerformance('test-operation', 1500, { success: true });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"operation":"test-operation"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"durationMs":1500')
      );
    });
  });

  describe('Metrics Integration', () => {
    it('should add metrics to buffer', () => {
      const metricsPublisher = new MetricsPublisher('TestNamespace');
      
      metricsPublisher.addMetric({
        metricName: 'TestMetric',
        value: 1,
        dimensions: { TestDimension: 'TestValue' }
      });
      
      // Verify metric was added (buffer should have 1 item)
      expect(metricsPublisher['metricsBuffer']).toHaveLength(1);
    });

    it('should track API request metrics', () => {
      const addMetricSpy = jest.spyOn(metrics, 'addMetric');
      
      metrics.trackApiRequest(200, 1500, 'test-endpoint');
      
      expect(addMetricSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metricName: 'ApiRequest',
          value: 1,
          dimensions: expect.objectContaining({
            StatusCode: '200'
          })
        })
      );
      
      expect(addMetricSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metricName: 'ApiLatency',
          value: 1500
        })
      );
    });

    it('should track AI usage metrics', () => {
      const addMetricSpy = jest.spyOn(metrics, 'addMetric');
      
      metrics.trackAiUsage('claude-3-haiku', 100, 200, 3000, 0.05);
      
      expect(addMetricSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metricName: 'AiInvocation',
          value: 1,
          dimensions: { ModelId: 'claude-3-haiku' }
        })
      );
      
      expect(addMetricSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metricName: 'AiCost',
          value: 0.05
        })
      );
    });

    it('should track recipe suggestion metrics', () => {
      const addMetricSpy = jest.spyOn(metrics, 'addMetric');
      
      metrics.trackRecipeSuggestion(2, 1, 3);
      
      expect(addMetricSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metricName: 'RecipesFromDatabase',
          value: 2
        })
      );
      
      expect(addMetricSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metricName: 'RecipesFromAi',
          value: 1
        })
      );
      
      expect(addMetricSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metricName: 'DatabaseCoveragePercent',
          value: 66.66666666666666 // 2/3 * 100
        })
      );
    });
  });

  describe('X-Ray Tracing Integration', () => {
    it('should detect X-Ray availability', () => {
      // Without X-Ray trace ID
      delete process.env._X_AMZN_TRACE_ID;
      const tracerWithoutXRay = new (require('../tracer').XRayTracer)();
      expect(tracerWithoutXRay.isTracingEnabled()).toBe(false);
      
      // With X-Ray trace ID
      process.env._X_AMZN_TRACE_ID = 'Root=1-test-trace';
      const tracerWithXRay = new (require('../tracer').XRayTracer)();
      expect(tracerWithXRay.isTracingEnabled()).toBe(true);
    });

    it('should execute functions when X-Ray is disabled', async () => {
      delete process.env._X_AMZN_TRACE_ID;
      const testTracer = new (require('../tracer').XRayTracer)();
      const testFn = jest.fn().mockResolvedValue('test-result');
      
      const result = await testTracer.captureAsyncFunc('test-operation', testFn);
      
      expect(result).toBe('test-result');
      expect(testFn).toHaveBeenCalled();
    });
  });

  describe('Monitoring Setup Integration', () => {
    it('should initialize monitoring configuration', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      initializeMonitoring({
        functionName: 'test-function',
        logLevel: 'DEBUG',
        customDimensions: { TestDim: 'TestValue' }
      });
      
      expect(process.env.LOG_LEVEL).toBe('DEBUG');
      expect(process.env.METRIC_DIMENSION_TESTDIM).toBe('TestValue');
    });

    it('should wrap handlers with monitoring', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ statusCode: 200 });
      const mockEvent = {
        httpMethod: 'GET',
        requestContext: {
          requestId: 'test-request',
          authorizer: { claims: { sub: 'test-user' } }
        }
      };
      
      const wrappedHandler = withMonitoring('test-function', mockHandler);
      const result = await wrappedHandler(mockEvent);
      
      expect(mockHandler).toHaveBeenCalledWith(mockEvent);
      expect(result).toEqual({ statusCode: 200 });
    });

    it('should handle errors in wrapped handlers', async () => {
      const mockError = new Error('Test error');
      const mockHandler = jest.fn().mockRejectedValue(mockError);
      const mockEvent = { httpMethod: 'GET', requestContext: {} };
      
      const wrappedHandler = withMonitoring('test-function', mockHandler);
      
      await expect(wrappedHandler(mockEvent)).rejects.toThrow('Test error');
    });

    it('should track business events', () => {
      const addMetricSpy = jest.spyOn(metrics, 'addMetric');
      const logSpy = jest.spyOn(logger, 'logBusinessMetric');
      
      trackBusinessEvent('user-registration', 1, { source: 'web' });
      
      expect(addMetricSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          metricName: 'user-registration',
          value: 1,
          dimensions: expect.objectContaining({
            source: 'web'
          })
        })
      );
      
      expect(logSpy).toHaveBeenCalledWith('user-registration', 1, 'count', { source: 'web' });
    });
  });

  describe('Database Monitoring Integration', () => {
    it('should monitor database operations', async () => {
      const mockDbOperation = jest.fn().mockResolvedValue({ Items: [] });
      const trackDbSpy = jest.spyOn(metrics, 'trackDatabaseOperation');
      
      // Import the function dynamically to avoid import issues
      const { withDatabaseMonitoring } = require('../monitoring-setup');
      
      const result = await withDatabaseMonitoring(
        'query',
        'test-table',
        mockDbOperation
      );
      
      expect(mockDbOperation).toHaveBeenCalled();
      expect(trackDbSpy).toHaveBeenCalledWith(
        'query',
        expect.any(Number),
        true
      );
    });

    it('should handle database operation errors', async () => {
      const mockError = new Error('DB Error');
      const mockDbOperation = jest.fn().mockRejectedValue(mockError);
      const trackDbSpy = jest.spyOn(metrics, 'trackDatabaseOperation');
      
      const { withDatabaseMonitoring } = require('../monitoring-setup');
      
      await expect(
        withDatabaseMonitoring('query', 'test-table', mockDbOperation)
      ).rejects.toThrow('DB Error');
      
      expect(trackDbSpy).toHaveBeenCalledWith(
        'query',
        expect.any(Number),
        false
      );
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required environment variables', () => {
      const result = validateMonitoringConfig();
      
      expect(result.isValid).toBe(false);
      expect(result.missingVars).toContain('AWS_LAMBDA_FUNCTION_NAME');
      expect(result.missingVars).toContain('AWS_REGION');
    });

    it('should pass validation with required variables', () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-function';
      process.env.AWS_REGION = 'us-east-1';
      
      const result = validateMonitoringConfig();
      
      expect(result.isValid).toBe(true);
      expect(result.missingVars).toHaveLength(0);
    });

    it('should report warnings for optional variables', () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-function';
      process.env.AWS_REGION = 'us-east-1';
      
      const result = validateMonitoringConfig();
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('LOG_LEVEL'))).toBe(true);
    });
  });

  describe('End-to-End Monitoring Flow', () => {
    it('should complete full monitoring cycle', async () => {
      // Setup environment
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-function';
      process.env.AWS_REGION = 'us-east-1';
      process.env.LOG_LEVEL = 'INFO';
      
      const mockEvent = {
        httpMethod: 'POST',
        path: '/test',
        body: '{"test": true}',
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: { sub: 'test-user-id' } }
        }
      };
      
      const mockHandler = jest.fn().mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ success: true })
      });
      
      // Spy on monitoring functions
      const logSpy = jest.spyOn(logger, 'info');
      const metricsSpy = jest.spyOn(metrics, 'trackApiRequest');
      const flushSpy = jest.spyOn(metrics, 'flush').mockResolvedValue();
      
      // Execute wrapped handler
      const wrappedHandler = withMonitoring('test-function', mockHandler);
      const result = await wrappedHandler(mockEvent) as any;
      
      // Verify all monitoring components were called
      expect(logSpy).toHaveBeenCalled();
      expect(metricsSpy).toHaveBeenCalledWith(200, expect.any(Number), 'test-function');
      expect(flushSpy).toHaveBeenCalled();
      expect(result.statusCode).toBe(200);
    });
  });
});