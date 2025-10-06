# Smart Cooking MVP - E2E Test Suite

## Overview

This comprehensive end-to-end test suite validates the complete Smart Cooking MVP functionality by testing actual deployed API endpoints. The tests cover the entire user journey from registration to recipe rating, AI suggestion validation, auto-approval system, and cost optimization metrics.

## Test Suites

### 1. User Journey Tests (`user-journey.test.ts`)
**Estimated Time:** 3-5 minutes

Tests the complete user workflow:
- ✅ User registration and profile setup
- ✅ Ingredient input and validation
- ✅ AI recipe suggestions
- ✅ Starting cooking sessions
- ✅ Completing cooking and rating recipes
- ✅ Viewing cooking history

### 2. AI Suggestions Tests (`ai-suggestions.test.ts`)
**Estimated Time:** 5-8 minutes

Validates AI suggestion engine with various scenarios:
- ✅ Valid ingredients only
- ✅ Mixed valid/invalid ingredients
- ✅ Fuzzy match ingredients (missing tone marks)
- ✅ Large ingredient lists (10+ items)
- ✅ Minimal ingredient lists (2-3 items)
- ✅ Performance benchmarking
- ✅ Error handling

### 3. Auto-Approval Tests (`auto-approval.test.ts`)
**Estimated Time:** 4-6 minutes

Tests the recipe auto-approval system:
- ✅ High ratings triggering auto-approval (≥4.0 average)
- ✅ Low ratings preventing auto-approval (<4.0 average)
- ✅ Edge cases (exactly at 4.0 threshold)
- ✅ Minimum rating count requirements
- ✅ Multiple user rating scenarios

### 4. Cost Metrics Tests (`cost-metrics.test.ts`)
**Estimated Time:** 3-5 minutes

Verifies cost optimization and monitoring:
- ✅ DB/AI mix ratio tracking
- ✅ CloudWatch custom metrics verification
- ✅ Performance benchmarking
- ✅ Cost optimization trends
- ✅ Flexible mix algorithm validation

## Prerequisites

### Environment Setup

1. **AWS Credentials**
   ```bash
   export AWS_REGION=us-east-1
   export AWS_ACCESS_KEY_ID=your-access-key
   export AWS_SECRET_ACCESS_KEY=your-secret-key
   ```

2. **API Endpoints**
   ```bash
   # Development
   export DEV_API_URL=https://api-dev.smartcooking.com/v1
   export DEV_USER_POOL_ID=us-east-1_devpool123
   export DEV_USER_POOL_CLIENT_ID=devclient123
   export DEV_TABLE_NAME=smart-cooking-data-dev

   # Production
   export PROD_API_URL=https://api.smartcooking.com/v1
   export PROD_USER_POOL_ID=us-east-1_prodpool123
   export PROD_USER_POOL_CLIENT_ID=prodclient123
   export PROD_TABLE_NAME=smart-cooking-data-prod
   ```

3. **Install Dependencies**
   ```bash
   cd tests/e2e
   npm install
   ```

## Running Tests

### Quick Start
```bash
# Run all tests in development environment
npm test

# Run all tests in production environment
npm run test:prod
```

### Individual Test Suites
```bash
# User journey tests
npm run test:user-journey

# AI suggestion tests
npm run test:ai-suggestions

# Auto-approval tests
npm run test:auto-approval

# Cost metrics tests
npm run test:cost-metrics
```

### Advanced Options
```bash
# Run with coverage report
npm run test:coverage

# Run in watch mode (development)
npm run test:watch

# Run specific test file
TEST_ENV=dev npx jest user-journey.test.ts
```

## Test Data Management

### Automatic Setup
- Test users are created automatically in Cognito and DynamoDB
- Test ingredients and recipes are seeded before tests
- All test data is cleaned up after test completion

### Manual Cleanup
If tests fail and leave test data:
```bash
# Clean up test users (replace with actual test emails)
aws cognito-idp admin-delete-user --user-pool-id $USER_POOL_ID --username test-user@example.com

# Clean up DynamoDB test data
aws dynamodb delete-item --table-name $TABLE_NAME --key '{"PK":{"S":"USER#test-user-id"},"SK":{"S":"PROFILE"}}'
```

## Expected Results

### Success Criteria
- ✅ All test suites pass (100% success rate)
- ✅ API response times < 30 seconds for AI generation
- ✅ Database coverage > 0% (flexible mix algorithm working)
- ✅ Auto-approval triggers at ≥4.0 average rating
- ✅ Cost metrics are tracked and reasonable

### Performance Benchmarks
- **Ingredient Validation:** < 5 seconds
- **AI Suggestions (3 ingredients):** < 15 seconds
- **AI Suggestions (5 ingredients):** < 20 seconds
- **AI Suggestions (8+ ingredients):** < 30 seconds
- **Database Operations:** < 3 seconds

### Cost Optimization Targets
- **DB Recipe Ratio:** > 20% (increasing over time)
- **AI Cost per Request:** < $0.01
- **Monthly Cost Savings:** Measurable reduction in AI costs

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   ```
   Error: Authentication failed: 401 Unauthorized
   ```
   - Verify Cognito User Pool configuration
   - Check API Gateway authorizer setup
   - Ensure test user creation succeeded

2. **API Timeouts**
   ```
   Error: Request timeout after 30000ms
   ```
   - Check Lambda function performance
   - Verify Bedrock AI service availability
   - Increase timeout in test configuration

3. **DynamoDB Access Errors**
   ```
   Error: AccessDeniedException
   ```
   - Verify AWS credentials have DynamoDB permissions
   - Check table names and region configuration
   - Ensure Lambda execution roles are correct

4. **Missing CloudWatch Metrics**
   ```
   No CloudWatch metrics found yet
   ```
   - Metrics are published hourly by monitoring Lambda
   - New deployments may not have metrics yet
   - Check monitoring Lambda execution logs

### Debug Mode
```bash
# Enable verbose logging
DEBUG=true npm test

# Run single test with detailed output
npx jest --verbose user-journey.test.ts
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd tests/e2e
          npm install
      
      - name: Run E2E tests
        env:
          AWS_REGION: ${{ secrets.AWS_REGION }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          TEST_ENV: dev
        run: |
          cd tests/e2e
          npm test
```

## Monitoring and Reporting

### Test Results
- Jest generates detailed test reports
- Coverage reports available in `coverage/` directory
- Performance metrics logged to console

### Cost Analysis
Tests automatically log cost optimization metrics:
```
Cost Optimization Metrics: {
  totalRequests: 3,
  totalDbRecipes: 5,
  totalAiRecipes: 4,
  dbRatio: '55.6%',
  aiRatio: '44.4%',
  avgGenerationTime: '3500ms'
}
```

### CloudWatch Integration
- Custom metrics are verified during tests
- Performance data is tracked over time
- Cost trends are monitored automatically

## Contributing

### Adding New Tests
1. Create test file in appropriate category
2. Follow existing naming conventions
3. Include proper setup/teardown
4. Add to test suite documentation

### Test Guidelines
- Use descriptive test names
- Include performance expectations
- Clean up test data properly
- Log relevant metrics for analysis
- Handle errors gracefully

## Support

For issues with the E2E test suite:
1. Check the troubleshooting section
2. Verify environment configuration
3. Review test logs for specific errors
4. Ensure AWS resources are properly deployed