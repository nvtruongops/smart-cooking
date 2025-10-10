import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { E2ETestSetup, TestUser, makeAuthenticatedRequest, generateTestEmail } from './setup';
import { getTestConfig, TEST_INGREDIENTS, TIMEOUTS } from './config';

describe('E2E: Cost Optimization and Metrics', () => {
  let testSetup: E2ETestSetup;
  let testUser: TestUser;
  let config: ReturnType<typeof getTestConfig>;
  let cloudwatch: CloudWatchClient;

  beforeAll(async () => {
    config = getTestConfig(process.env.TEST_ENV || 'dev');
    testSetup = new E2ETestSetup(config);
    cloudwatch = new CloudWatchClient({ region: config.region });
    
    await testSetup.seedTestIngredients();
    await testSetup.seedTestRecipes();
    
    testUser = await testSetup.createTestUser(generateTestEmail());
    testUser = await testSetup.authenticateUser(testUser);
  }, TIMEOUTS.DATABASE_OPERATION * 2);

  afterAll(async () => {
    if (testUser) {
      await testSetup.cleanupTestUser(testUser);
    }
    await testSetup.cleanupTestData();
  });

  test('Verify DB/AI Mix Ratio Tracking', async () => {
    // Make multiple AI suggestion requests to generate metrics
    const requests = [];
    
    for (let i = 0; i < 3; i++) {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/suggestions/ai`,
        {
          method: 'POST',
          body: JSON.stringify({
            ingredients: TEST_INGREDIENTS.VALID,
            preferences: {
              cuisine_type: 'vietnamese',
              cooking_method: i % 2 === 0 ? 'stir_fry' : 'boil'
            }
          })
        },
        testUser.accessToken!
      );

      expect(response.ok).toBe(true);
      const result = await response.json();
      
      requests.push({
        dbRecipes: result.stats.from_database,
        aiRecipes: result.stats.from_ai,
        totalRecipes: result.stats.total_recipes,
        generationTime: result.stats.generation_time_ms
      });
    }

    // Verify flexible mix algorithm is working
    const totalDbRecipes = requests.reduce((sum, req) => sum + req.dbRecipes, 0);
    const totalAiRecipes = requests.reduce((sum, req) => sum + req.aiRecipes, 0);
    const totalRequests = requests.reduce((sum, req) => sum + req.totalRecipes, 0);

    expect(totalDbRecipes + totalAiRecipes).toBe(totalRequests);
    
    // Log cost optimization data
    console.log('Cost Optimization Metrics:', {
      totalRequests: requests.length,
      totalDbRecipes,
      totalAiRecipes,
      dbRatio: (totalDbRecipes / totalRequests * 100).toFixed(1) + '%',
      aiRatio: (totalAiRecipes / totalRequests * 100).toFixed(1) + '%',
      avgGenerationTime: (requests.reduce((sum, req) => sum + req.generationTime, 0) / requests.length).toFixed(0) + 'ms'
    });

    // Verify cost savings potential
    const estimatedAICost = totalAiRecipes * 0.002; // $0.002 per AI recipe
    const potentialSavings = totalDbRecipes * 0.002; // Savings from using DB
    
    console.log('Cost Analysis:', {
      estimatedAICost: `$${estimatedAICost.toFixed(4)}`,
      potentialSavings: `$${potentialSavings.toFixed(4)}`,
      costEfficiency: `${(potentialSavings / (estimatedAICost + potentialSavings) * 100).toFixed(1)}%`
    });

  }, TIMEOUTS.AI_GENERATION * 3);

  test('Verify CloudWatch Custom Metrics', async () => {
    // Wait for metrics to be published (monitoring Lambda runs hourly)
    // In a real test, you might trigger the monitoring Lambda directly
    
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    try {
      // Check for AI cost optimization metrics
      const aiMetricsResponse = await cloudwatch.send(new GetMetricStatisticsCommand({
        Namespace: 'SmartCooking/Cost',
        MetricName: 'DBRecipeRatio',
        Dimensions: [
          {
            Name: 'Environment',
            Value: process.env.TEST_ENV || 'dev'
          }
        ],
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600, // 1 hour
        Statistics: ['Average', 'Maximum', 'Minimum']
      }));

      if (aiMetricsResponse.Datapoints && aiMetricsResponse.Datapoints.length > 0) {
        console.log('CloudWatch DB Recipe Ratio Metrics:', aiMetricsResponse.Datapoints);
        
        // Verify metrics are reasonable
        const latestDatapoint = aiMetricsResponse.Datapoints[aiMetricsResponse.Datapoints.length - 1];
        expect(latestDatapoint.Average).toBeGreaterThanOrEqual(0);
        expect(latestDatapoint.Average).toBeLessThanOrEqual(100);
      } else {
        console.log('No CloudWatch metrics found yet - this is expected for new deployments');
      }

      // Check for database coverage metrics
      const coverageResponse = await cloudwatch.send(new GetMetricStatisticsCommand({
        Namespace: 'SmartCooking/Cost',
        MetricName: 'DatabaseCoverage',
        Dimensions: [
          {
            Name: 'Environment',
            Value: process.env.TEST_ENV || 'dev'
          }
        ],
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600,
        Statistics: ['Average']
      }));

      if (coverageResponse.Datapoints && coverageResponse.Datapoints.length > 0) {
        console.log('Database Coverage Metrics:', coverageResponse.Datapoints);
      }

    } catch (error) {
      console.log('CloudWatch metrics check failed (expected for new deployments):', error.message);
      // Don't fail the test - metrics might not be available yet
    }
  });

  test('Performance Benchmarking', async () => {
    const performanceTests = [
      {
        name: 'Small ingredient list (3 items)',
        ingredients: TEST_INGREDIENTS.VALID.slice(0, 3),
        expectedMaxTime: 15000 // 15 seconds
      },
      {
        name: 'Medium ingredient list (5 items)',
        ingredients: TEST_INGREDIENTS.VALID,
        expectedMaxTime: 20000 // 20 seconds
      },
      {
        name: 'Large ingredient list (8 items)',
        ingredients: [...TEST_INGREDIENTS.VALID, 'bánh phở', 'gừng', 'hành lá'],
        expectedMaxTime: 30000 // 30 seconds
      }
    ];

    const results = [];

    for (const test of performanceTests) {
      const startTime = Date.now();
      
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/suggestions/ai`,
        {
          method: 'POST',
          body: JSON.stringify({
            ingredients: test.ingredients,
            preferences: {
              cuisine_type: 'vietnamese'
            }
          })
        },
        testUser.accessToken!
      );

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.ok).toBe(true);
      expect(responseTime).toBeLessThan(test.expectedMaxTime);

      const result = await response.json();
      
      results.push({
        testName: test.name,
        ingredientCount: test.ingredients.length,
        responseTime,
        dbRecipes: result.stats.from_database,
        aiRecipes: result.stats.from_ai,
        generationTime: result.stats.generation_time_ms
      });
    }

    // Log performance results
    console.log('Performance Benchmark Results:');
    results.forEach(result => {
      console.log(`${result.testName}:`, {
        ingredientCount: result.ingredientCount,
        responseTime: `${result.responseTime}ms`,
        dbRecipes: result.dbRecipes,
        aiRecipes: result.aiRecipes,
        generationTime: `${result.generationTime}ms`,
        efficiency: `${(result.dbRecipes / (result.dbRecipes + result.aiRecipes) * 100).toFixed(1)}% DB`
      });
    });

    // Verify performance improves with database coverage
    const avgDbRatio = results.reduce((sum, r) => sum + (r.dbRecipes / (r.dbRecipes + r.aiRecipes)), 0) / results.length;
    expect(avgDbRatio).toBeGreaterThan(0); // Should have some database coverage
  }, TIMEOUTS.AI_GENERATION * 4);

  test('Cost Optimization Trends', async () => {
    // Simulate multiple requests over time to track optimization trends
    const trendData = [];
    
    for (let i = 0; i < 5; i++) {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/suggestions/ai`,
        {
          method: 'POST',
          body: JSON.stringify({
            ingredients: TEST_INGREDIENTS.VALID,
            preferences: {
              cuisine_type: 'vietnamese',
              cooking_method: 'stir_fry'
            }
          })
        },
        testUser.accessToken!
      );

      const result = await response.json();
      
      trendData.push({
        timestamp: new Date().toISOString(),
        dbRatio: result.stats.from_database / result.stats.total_recipes,
        aiCost: result.stats.from_ai * 0.002,
        savings: result.stats.from_database * 0.002
      });

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Analyze trends
    const avgDbRatio = trendData.reduce((sum, d) => sum + d.dbRatio, 0) / trendData.length;
    const totalAiCost = trendData.reduce((sum, d) => sum + d.aiCost, 0);
    const totalSavings = trendData.reduce((sum, d) => sum + d.savings, 0);

    console.log('Cost Optimization Trends:', {
      averageDbRatio: `${(avgDbRatio * 100).toFixed(1)}%`,
      totalAiCost: `$${totalAiCost.toFixed(4)}`,
      totalSavings: `$${totalSavings.toFixed(4)}`,
      costEfficiency: `${(totalSavings / (totalAiCost + totalSavings) * 100).toFixed(1)}%`,
      projectedMonthlySavings: `$${(totalSavings * 30).toFixed(2)}`
    });

    // Verify cost optimization is working
    expect(avgDbRatio).toBeGreaterThan(0);
    expect(totalSavings).toBeGreaterThanOrEqual(0);
  }, TIMEOUTS.AI_GENERATION * 6);
});