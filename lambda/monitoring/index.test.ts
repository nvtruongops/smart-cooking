import { handler, setClients } from './index';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { ScheduledEvent } from 'aws-lambda';

const mockCloudWatchSend = jest.fn();
const mockDynamoDBSend = jest.fn();

describe('Monitoring Lambda Handler', () => {
  const originalEnv = process.env;

  const createTestEvent = (): ScheduledEvent => ({
    id: 'test-event-id',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123456789012',
    time: '2025-01-20T10:00:00Z',
    region: 'us-east-1',
    detail: {},
    version: '0',
    resources: []
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ENVIRONMENT: 'test',
      DYNAMODB_TABLE: 'test-table',
      AWS_REGION: 'us-east-1'
    };

    // Set up mock clients
    const mockCloudWatch = { send: mockCloudWatchSend } as unknown as CloudWatchClient;
    const mockDynamoDB = { send: mockDynamoDBSend } as unknown as DynamoDBClient;
    setClients(mockCloudWatch, mockDynamoDB);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should successfully collect and publish cost optimization metrics', async () => {
    // Mock DynamoDB responses
    mockDynamoDBSend
      .mockResolvedValueOnce({ Count: 25, Items: [] }) // Approved recipes
      .mockResolvedValueOnce({ Count: 100, Items: [] }) // Total suggestions
      .mockResolvedValueOnce({ // AI history
        Count: 2,
        Items: [
          {
            stats: {
              M: {
                from_database: { N: '2' },
                from_ai: { N: '1' },
                generation_time_ms: { N: '3500' }
              }
            }
          },
          {
            stats: {
              M: {
                from_database: { N: '1' },
                from_ai: { N: '2' },
                generation_time_ms: { N: '4200' }
              }
            }
          }
        ]
      });

    // Mock CloudWatch success
    mockCloudWatchSend.mockResolvedValue({});

    const event = createTestEvent();
    const result = await handler(event, {} as any, {} as any);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Cost optimization metrics published successfully');

    // Verify DynamoDB calls
    expect(mockDynamoDBSend).toHaveBeenCalledTimes(3);
    
    // Verify CloudWatch calls
    expect(mockCloudWatchSend).toHaveBeenCalled();
    
    // Check that metrics were published
    const cloudWatchCalls = mockCloudWatchSend.mock.calls;
    expect(cloudWatchCalls.length).toBeGreaterThan(0);
    
    // Verify metric structure
    const firstCall = cloudWatchCalls[0][0];
    expect(firstCall).toBeInstanceOf(PutMetricDataCommand);
    expect(firstCall.input.Namespace).toBe('SmartCooking/Cost');
    expect(firstCall.input.MetricData).toBeDefined();
    expect(Array.isArray(firstCall.input.MetricData)).toBe(true);
  });

  it('should handle database coverage calculation correctly', async () => {
    // Mock responses for coverage calculation
    mockDynamoDBSend
      .mockResolvedValueOnce({ Count: 50, Items: [] }) // 50 approved recipes
      .mockResolvedValueOnce({ Count: 200, Items: [] }) // 200 total suggestions
      .mockResolvedValueOnce({ Count: 0, Items: [] }); // No recent AI history

    mockCloudWatchSend.mockResolvedValue({});

    const event = createTestEvent();
    await handler(event, {} as any, {} as any);

    // Verify the coverage calculation (50/200 = 25%)
    const cloudWatchCalls = mockCloudWatchSend.mock.calls;
    const metricsData = cloudWatchCalls.flatMap(call => call[0].input.MetricData);

    const coverageMetric = metricsData.find(metric => metric.MetricName === 'DatabaseCoverage');
    expect(coverageMetric).toBeDefined();
    expect(coverageMetric.Value).toBe(25); // 25% coverage
    expect(coverageMetric.Unit).toBe('Percent');
  });

  it('should handle AI cost optimization metrics correctly', async () => {
    mockDynamoDBSend
      .mockResolvedValueOnce({ Count: 10, Items: [] })
      .mockResolvedValueOnce({ Count: 50, Items: [] })
      .mockResolvedValueOnce({
        Count: 2,
        Items: [
          {
            stats: {
              M: {
                from_database: { N: '3' },
                from_ai: { N: '2' },
                generation_time_ms: { N: '2500' }
              }
            }
          },
          {
            stats: {
              M: {
                from_database: { N: '2' },
                from_ai: { N: '3' },
                generation_time_ms: { N: '58000' } // Near timeout
              }
            }
          }
        ]
      });

    mockCloudWatchSend.mockResolvedValue({});

    const event = createTestEvent();
    await handler(event, {} as any, {} as any);

    const cloudWatchCalls = mockCloudWatchSend.mock.calls;
    const metricsData = cloudWatchCalls.flatMap(call => call[0].input.MetricData);

    // Check DB ratio metric (5 DB recipes out of 10 total = 50%)
    const dbRatioMetric = metricsData.find(metric => metric.MetricName === 'DBRecipeRatio');
    expect(dbRatioMetric).toBeDefined();
    expect(dbRatioMetric.Value).toBe(50);

    // Check AI ratio metric (5 AI recipes out of 10 total = 50%)
    const aiRatioMetric = metricsData.find(metric => metric.MetricName === 'AIRecipeRatio');
    expect(aiRatioMetric).toBeDefined();
    expect(aiRatioMetric.Value).toBe(50);

    // Check timeout rate (1 out of 2 = 50%)
    const timeoutMetric = metricsData.find(metric => metric.MetricName === 'TimeoutRate');
    expect(timeoutMetric).toBeDefined();
    expect(timeoutMetric.Value).toBe(50);
  });

  it('should handle errors gracefully and publish error metrics', async () => {
    // Mock DynamoDB error - this will cause the DB queries to fail
    // but handler should catch errors and publish error metrics
    mockDynamoDBSend.mockRejectedValue(new Error('DynamoDB connection failed'));
    mockCloudWatchSend.mockResolvedValue({});

    const event = createTestEvent();
    const result = await handler(event, {} as any, {} as any);

    // Handler should complete successfully even with DB errors
    expect(result.statusCode).toBe(200);

    // Verify error metrics were published (Lambda-level metrics)
    expect(mockCloudWatchSend).toHaveBeenCalled();

    // The handler catches DB errors internally and returns empty arrays
    // Only Lambda performance metrics will be published in this case
    expect(JSON.parse(result.body).metricsCount).toBeGreaterThan(0);
  });

  it('should require DYNAMODB_TABLE environment variable', async () => {
    delete process.env.DYNAMODB_TABLE;

    const event = createTestEvent();
    await expect(handler(event, {} as any, {} as any)).rejects.toThrow('DYNAMODB_TABLE environment variable is required');
  });

  it('should handle empty database responses', async () => {
    // Mock empty responses
    mockDynamoDBSend
      .mockResolvedValueOnce({ Count: 0, Items: [] }) // No approved recipes
      .mockResolvedValueOnce({ Count: 0, Items: [] }) // No total suggestions
      .mockResolvedValueOnce({ Count: 0, Items: [] }); // No AI history

    mockCloudWatchSend.mockResolvedValue({});

    const event = createTestEvent();
    const result = await handler(event, {} as any, {} as any);

    expect(result.statusCode).toBe(200);

    // Verify metrics were still published with zero values
    const cloudWatchCalls = mockCloudWatchSend.mock.calls;
    const metricsData = cloudWatchCalls.flatMap(call => call[0].input.MetricData);

    const coverageMetric = metricsData.find(metric => metric.MetricName === 'DatabaseCoverage');
    expect(coverageMetric).toBeDefined();
    expect(coverageMetric.Value).toBe(0);
  });

  it('should batch metrics correctly when publishing to CloudWatch', async () => {
    // Mock responses that will generate many metrics
    mockDynamoDBSend
      .mockResolvedValueOnce({ Count: 100, Items: [] })
      .mockResolvedValueOnce({ Count: 500, Items: [] })
      .mockResolvedValueOnce({ Count: 0, Items: [] });

    mockCloudWatchSend.mockResolvedValue({});

    const event = createTestEvent();
    await handler(event, {} as any, {} as any);

    // Verify CloudWatch was called (should handle batching internally)
    expect(mockCloudWatchSend).toHaveBeenCalled();

    // Each call should have <= 20 metrics (CloudWatch limit)
    mockCloudWatchSend.mock.calls.forEach(call => {
      const metricsCount = call[0].input.MetricData.length;
      expect(metricsCount).toBeLessThanOrEqual(20);
    });
  });
});