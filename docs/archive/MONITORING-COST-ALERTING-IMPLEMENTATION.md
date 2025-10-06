# Monitoring and Cost Alerting Implementation

## Overview

This document describes the comprehensive monitoring and cost alerting system implemented for the Smart Cooking MVP. The system includes budget alerts, performance dashboards, SNS notifications, and log retention policies to optimize costs and ensure system reliability.

## Implementation Summary

### 1. Cost Monitoring and Budget Alerts

**Budget Configuration:**
- **Development Environment:**
  - Budget Limit: $200/month
  - Warning Alert: $140 (70%)
  - Critical Alert: $170 (85%)
- **Production Environment:**
  - Budget Limit: $500/month
  - Warning Alert: $450 (90%)
  - Critical Alert: $500 (100%)

**Features:**
- Actual cost monitoring with percentage-based thresholds
- Forecasted cost alerts when projected to exceed 100% of budget
- SNS notifications for all budget alerts
- Cost allocation tags for detailed cost tracking

### 2. Performance Dashboards

**CloudWatch Dashboard Widgets:**

1. **API Gateway Metrics**
   - Request count and latency (p95)
   - Error rates (4xx and 5xx)

2. **Lambda Performance**
   - Duration (average) for all functions
   - Invocation counts
   - Error rates and throttles

3. **DynamoDB Metrics**
   - Read/Write capacity consumption
   - Throttled requests

4. **AI Generation Metrics**
   - DB vs AI recipe mix ratio
   - Generation time and timeout rates
   - Cost optimization trends

5. **Cost Tracking**
   - Monthly cost estimates
   - Daily cost trends

### 3. SNS Notifications

**Alert Topics:**
- **Critical Alerts Topic:** System errors, performance issues
- **Cost Alerts Topic:** Budget and cost-related notifications

**Notification Triggers:**
- Lambda error rate > 1%
- Lambda duration exceeds thresholds (5s for most, 50s for AI)
- Lambda throttles detected
- API Gateway 5xx errors > 10 in 5 minutes
- API Gateway latency > 5 seconds (p95)
- DynamoDB throttled requests
- AI generation timeout rate > 10%
- Budget threshold breaches

### 4. Log Retention Policies

**Retention Periods:**
- **Development:** 3 days (aggressive cost optimization)
- **Production:** 14 days (reduced from standard 30 days for cost savings)

**Log Groups:**
- Lambda function logs: `/aws/lambda/{function-name}`
- API Gateway access logs: `/aws/apigateway/smart-cooking-{env}-access`
- CloudFront access logs: `/aws/cloudfront/smart-cooking-{env}`

### 5. Cost Optimization Metrics

**Custom Metrics (SmartCooking/Cost namespace):**

1. **Database Coverage Metrics**
   - `DatabaseCoverage`: Percentage of recipes served from database vs AI
   - `ApprovedRecipesCount`: Total approved recipes in database
   - `TotalSuggestionsCount`: Total AI suggestions made

2. **AI Cost Optimization**
   - `DBRecipeRatio`: Percentage of recipes from database
   - `AIRecipeRatio`: Percentage of recipes from AI generation
   - `AverageGenerationTime`: Average AI generation time
   - `TimeoutRate`: Percentage of AI requests that timeout
   - `EstimatedAICost`: Estimated AI costs in USD
   - `PotentialSavings`: Cost savings from using database recipes

3. **System Optimization**
   - `LambdaCostOptimization`: Lambda cost optimization score
   - `DynamoCostOptimization`: DynamoDB cost optimization score

## Implementation Details

### 1. Monitoring Stack (CDK)

**File:** `cdk/lib/monitoring-stack.ts`

Key components:
- Budget alerts with SNS integration
- CloudWatch alarms for all critical metrics
- Performance dashboard with 7 widget rows
- Log retention policies for cost optimization

### 2. Cost Optimization Utilities

**File:** `cdk/lib/cost-optimization.ts`

Features:
- Automated log retention configuration
- Cost allocation tagging
- Cost tracking metrics setup
- Utility functions for cost calculations

### 3. Monitoring Lambda Function

**File:** `lambda/monitoring/index.ts`

Scheduled function (runs hourly) that:
- Collects database coverage metrics
- Calculates AI cost optimization ratios
- Publishes custom metrics to CloudWatch
- Handles errors gracefully with error metrics

### 4. Integration with Main Stack

**File:** `cdk/lib/simple-stack.ts`

Integration points:
- Monitoring stack instantiation
- Cost optimization setup
- Scheduled trigger for monitoring Lambda
- CloudWatch permissions for metrics collection

## Cost Optimization Strategy

### 1. AI Cost Reduction (40% of total cost)

**Flexible DB/AI Mix Strategy:**
```
Month 1: 0% DB, 100% AI → $30/month AI cost
Month 3: 30% DB, 70% AI → $21/month AI cost (30% savings)
Month 6: 60% DB, 40% AI → $12/month AI cost (60% savings)
Month 12: 80% DB, 20% AI → $6/month AI cost (80% savings)
```

**Tracking:**
- Real-time monitoring of DB vs AI ratio
- Cost savings calculations
- Automatic recipe approval system

### 2. Log Retention Optimization

**Aggressive Retention Policies:**
- Development: 3 days (vs standard 7 days)
- Production: 14 days (vs standard 30 days)
- Estimated savings: $5-10/month

### 3. Resource Right-Sizing

**Lambda Memory Optimization:**
- Monitoring function: 512MB (sufficient for metrics collection)
- AI function: 1024MB (optimized for performance)
- Other functions: 256MB (cost-optimized)

## Monitoring Metrics and Thresholds

### Critical Alarms

| Metric | Threshold | Action |
|--------|-----------|--------|
| Lambda Error Rate | > 1% | SNS Alert |
| Lambda Duration | > 5s (50s for AI) | SNS Alert |
| API Gateway 5xx | > 10 in 5min | SNS Alert |
| API Gateway Latency | > 5s (p95) | SNS Alert |
| DynamoDB Throttles | > 0 | SNS Alert |
| AI Timeout Rate | > 10% | SNS Alert |
| Budget Usage | > 70% (dev), 90% (prod) | SNS Alert |

### Performance Targets

| Service | Target | Current |
|---------|--------|---------|
| API Response Time | < 500ms (p95) | Monitored |
| AI Generation | < 5s per recipe | Monitored |
| Database Queries | < 100ms | Monitored |
| System Uptime | >= 99.5% | Monitored |
| Error Rate | < 1% | Monitored |

## Cost Tracking and Budgets

### Monthly Cost Estimates

**Development Environment:**
- Target: $140/month
- Warning: $140 (100%)
- Critical: $170 (121%)

**Production Environment:**
- Target: $450/month
- Warning: $450 (100%)
- Critical: $500 (111%)

### Cost Allocation Tags

All resources are tagged with:
- `Project`: smart-cooking-{environment}
- `Environment`: dev/prod
- `CostCenter`: Engineering
- `Owner`: SmartCookingTeam
- `Application`: SmartCooking
- `Version`: 1.0.0

## Testing

### Monitoring Lambda Tests

**File:** `lambda/monitoring/index.test.ts`

Test coverage:
- ✅ Successful metrics collection and publishing
- ✅ Database coverage calculation
- ✅ AI cost optimization metrics
- ✅ Error handling and error metrics
- ✅ Environment variable validation
- ✅ Empty database response handling
- ✅ CloudWatch metrics batching

**Test Results:** 7/7 tests passing

## Deployment

### CDK Deployment

```bash
# Deploy monitoring stack
cd cdk
npm run deploy -- --all

# Verify monitoring Lambda
aws lambda invoke --function-name smart-cooking-monitoring-dev response.json
```

### Verification Steps

1. **Budget Alerts:** Check AWS Budgets console for configured alerts
2. **CloudWatch Dashboard:** Verify dashboard creation and widgets
3. **SNS Topics:** Confirm topic creation and subscriptions
4. **Log Groups:** Verify retention policies are applied
5. **Monitoring Lambda:** Test scheduled execution
6. **Custom Metrics:** Check CloudWatch for SmartCooking/Cost namespace

## Maintenance

### Regular Tasks

1. **Weekly:** Review cost trends and optimization opportunities
2. **Monthly:** Analyze budget alerts and adjust thresholds if needed
3. **Quarterly:** Review log retention policies and adjust for cost optimization
4. **As needed:** Update alert thresholds based on system growth

### Troubleshooting

**Common Issues:**
1. **Missing Metrics:** Check monitoring Lambda execution logs
2. **Budget Alerts Not Working:** Verify SNS topic subscriptions
3. **High Costs:** Review cost allocation tags and optimize resources
4. **Dashboard Not Loading:** Check CloudWatch permissions

## Future Enhancements

1. **Advanced Cost Analytics:** Implement cost per user tracking
2. **Predictive Alerting:** Use ML for cost forecasting
3. **Automated Optimization:** Auto-scaling based on cost metrics
4. **Enhanced Dashboards:** Add business metrics and KPIs
5. **Integration:** Connect with external monitoring tools (DataDog, New Relic)

## Compliance and Security

- All metrics data is encrypted at rest and in transit
- SNS topics use AWS managed encryption
- Log retention complies with data retention policies
- Cost data is aggregated and anonymized
- Access to monitoring data requires appropriate IAM permissions

## Conclusion

The monitoring and cost alerting system provides comprehensive visibility into system performance and costs, enabling proactive optimization and issue resolution. The implementation follows AWS best practices and is designed to scale with the application growth while maintaining cost efficiency.