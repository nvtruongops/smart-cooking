import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';

export interface MonitoringStackProps {
  environment: string;
  budgetLimit: number;
  apiGateway: apigateway.RestApi;
  lambdaFunctions: lambda.Function[];
  distribution: cloudfront.Distribution;
}

export class MonitoringStack extends Construct {
  public readonly alarmTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id);

    const { environment, budgetLimit, apiGateway, lambdaFunctions, distribution } = props;

    // SNS Topic for alerts
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `smart-cooking-alerts-${environment}`,
      displayName: `Smart Cooking ${environment} Alerts`
    });

    // Email subscription (replace with actual email)
    this.alarmTopic.addSubscription(
      new subscriptions.EmailSubscription('admin@smartcooking.com') // Replace with actual email
    );

    // CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `SmartCooking-${environment}`,
      defaultInterval: cdk.Duration.hours(1)
    });

    // API Gateway Metrics
    const apiErrorRate = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: {
        ApiName: apiGateway.restApiName
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5)
    });

    const apiLatency = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Latency',
      dimensionsMap: {
        ApiName: apiGateway.restApiName
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(5)
    });

    const apiRequestCount = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Count',
      dimensionsMap: {
        ApiName: apiGateway.restApiName
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5)
    });

    // Lambda Metrics
    const lambdaErrors = lambdaFunctions.map(func => 
      new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: {
          FunctionName: func.functionName
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5)
      })
    );

    const lambdaDuration = lambdaFunctions.map(func => 
      new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Duration',
        dimensionsMap: {
          FunctionName: func.functionName
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5)
      })
    );

    // CloudFront Metrics
    const cloudFrontErrorRate = new cloudwatch.Metric({
      namespace: 'AWS/CloudFront',
      metricName: '4xxErrorRate',
      dimensionsMap: {
        DistributionId: distribution.distributionId
      },
      statistic: 'Average',
      period: cdk.Duration.minutes(5)
    });

    // Custom AI Metrics (will be published by Lambda functions)
    const aiGenerationCount = new cloudwatch.Metric({
      namespace: 'SmartCooking',
      metricName: 'RecipesFromAi',
      statistic: 'Sum',
      period: cdk.Duration.hours(1)
    });

    const dbRecipeCount = new cloudwatch.Metric({
      namespace: 'SmartCooking',
      metricName: 'RecipesFromDatabase',
      statistic: 'Sum',
      period: cdk.Duration.hours(1)
    });

    const aiCostMetric = new cloudwatch.Metric({
      namespace: 'SmartCooking',
      metricName: 'AiCost',
      statistic: 'Sum',
      period: cdk.Duration.hours(1)
    });

    const aiTokensMetric = new cloudwatch.Metric({
      namespace: 'SmartCooking',
      metricName: 'AiInputTokens',
      statistic: 'Sum',
      period: cdk.Duration.hours(1)
    });

    const dbCoverageMetric = new cloudwatch.Metric({
      namespace: 'SmartCooking',
      metricName: 'DatabaseCoveragePercent',
      statistic: 'Average',
      period: cdk.Duration.hours(1)
    });

    // Alarms

    // 1. API Gateway Error Rate Alarm
    const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
      alarmName: `SmartCooking-${environment}-API-Errors`,
      alarmDescription: 'API Gateway 5xx error rate is too high',
      metric: apiErrorRate,
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    apiErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // 2. API Gateway Latency Alarm
    const apiLatencyAlarm = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      alarmName: `SmartCooking-${environment}-API-Latency`,
      alarmDescription: 'API Gateway latency is too high',
      metric: apiLatency,
      threshold: 5000, // 5 seconds
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    });
    apiLatencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // 3. Lambda Error Alarms
    lambdaFunctions.forEach((func, index) => {
      const errorAlarm = new cloudwatch.Alarm(this, `LambdaErrorAlarm${index}`, {
        alarmName: `SmartCooking-${environment}-Lambda-${func.functionName}-Errors`,
        alarmDescription: `Lambda function ${func.functionName} error rate is too high`,
        metric: lambdaErrors[index],
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
      });
      errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

      // Duration alarm for AI function
      if (func.functionName.includes('ai-suggestion')) {
        const durationAlarm = new cloudwatch.Alarm(this, `AIDurationAlarm`, {
          alarmName: `SmartCooking-${environment}-AI-Duration`,
          alarmDescription: 'AI suggestion function duration is too high',
          metric: lambdaDuration[index],
          threshold: 45000, // 45 seconds
          evaluationPeriods: 2,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
        });
        durationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));
      }
    });

    // 4. CloudFront Error Rate Alarm
    const cfErrorAlarm = new cloudwatch.Alarm(this, 'CloudFrontErrorAlarm', {
      alarmName: `SmartCooking-${environment}-CloudFront-Errors`,
      alarmDescription: 'CloudFront 4xx error rate is too high',
      metric: cloudFrontErrorRate,
      threshold: 10, // 10%
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
    });
    cfErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // 5. AI Cost Alarm (Hourly)
    const aiCostAlarm = new cloudwatch.Alarm(this, 'AiCostAlarm', {
      alarmName: `SmartCooking-${environment}-AI-Cost-High`,
      alarmDescription: 'AI generation cost exceeding threshold',
      metric: aiCostMetric,
      threshold: 10, // $10 per hour
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    aiCostAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // 5b. Daily AI Cost Alarm
    const dailyAiCostMetric = new cloudwatch.Metric({
      namespace: 'SmartCooking',
      metricName: 'AiCost',
      statistic: 'Sum',
      period: cdk.Duration.hours(24)
    });

    const dailyAiCostAlarm = new cloudwatch.Alarm(this, 'DailyAiCostAlarm', {
      alarmName: `SmartCooking-${environment}-AI-Cost-Daily`,
      alarmDescription: 'Daily AI generation cost exceeding threshold',
      metric: dailyAiCostMetric,
      threshold: 50, // $50 per day
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    dailyAiCostAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // 6. Low Database Coverage Alarm
    const lowCoverageAlarm = new cloudwatch.Alarm(this, 'LowCoverageAlarm', {
      alarmName: `SmartCooking-${environment}-Low-DB-Coverage`,
      alarmDescription: 'Database recipe coverage is too low',
      metric: dbCoverageMetric,
      threshold: 30, // 30%
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    lowCoverageAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // 7. High Error Rate Alarm (Custom Metrics)
    const customErrorMetric = new cloudwatch.Metric({
      namespace: 'SmartCooking',
      metricName: 'ApiError',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5)
    });

    const customErrorAlarm = new cloudwatch.Alarm(this, 'CustomErrorAlarm', {
      alarmName: `SmartCooking-${environment}-Custom-Errors`,
      alarmDescription: 'High error rate in custom metrics',
      metric: customErrorMetric,
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    customErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // 8. Ingredient Validation Rate Alarm
    const validationRateMetric = new cloudwatch.Metric({
      namespace: 'SmartCooking',
      metricName: 'IngredientValidationRate',
      statistic: 'Average',
      period: cdk.Duration.hours(1)
    });

    const lowValidationRateAlarm = new cloudwatch.Alarm(this, 'LowValidationRateAlarm', {
      alarmName: `SmartCooking-${environment}-Low-Validation-Rate`,
      alarmDescription: 'Ingredient validation rate is too low',
      metric: validationRateMetric,
      threshold: 70, // 70%
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    lowValidationRateAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // 9. Security Events Alarm
    const securityEventMetric = new cloudwatch.Metric({
      namespace: 'SmartCooking',
      metricName: 'SecurityEvent',
      statistic: 'Sum',
      period: cdk.Duration.minutes(15)
    });

    const securityEventAlarm = new cloudwatch.Alarm(this, 'SecurityEventAlarm', {
      alarmName: `SmartCooking-${environment}-Security-Events`,
      alarmDescription: 'Security events detected',
      metric: securityEventMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    securityEventAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));

    // Dashboard Widgets
    this.dashboard.addWidgets(
      // API Gateway Row
      new cloudwatch.GraphWidget({
        title: 'API Gateway Metrics',
        left: [apiRequestCount, apiErrorRate],
        right: [apiLatency],
        width: 24,
        height: 6
      }),

      // Lambda Functions Row
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: lambdaErrors,
        width: 12,
        height: 6
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: lambdaDuration,
        width: 12,
        height: 6
      }),

      // AI Metrics Row
      new cloudwatch.GraphWidget({
        title: 'AI vs Database Recipe Generation',
        left: [aiGenerationCount, dbRecipeCount],
        width: 12,
        height: 6
      }),
      new cloudwatch.GraphWidget({
        title: 'Database Coverage %',
        left: [dbCoverageMetric],
        width: 12,
        height: 6
      }),
      new cloudwatch.GraphWidget({
        title: 'AI Generation Cost (USD/hour)',
        left: [aiCostMetric],
        width: 12,
        height: 6
      }),
      new cloudwatch.GraphWidget({
        title: 'AI Token Usage',
        left: [aiTokensMetric],
        width: 12,
        height: 6
      }),

      // CloudFront Row
      new cloudwatch.GraphWidget({
        title: 'CloudFront Error Rate',
        left: [cloudFrontErrorRate],
        width: 24,
        height: 6
      }),

      // Business Metrics Row
      new cloudwatch.GraphWidget({
        title: 'Ingredient Validation Metrics',
        left: [
          new cloudwatch.Metric({
            namespace: 'SmartCooking',
            metricName: 'ValidIngredients',
            statistic: 'Sum',
            period: cdk.Duration.hours(1)
          }),
          new cloudwatch.Metric({
            namespace: 'SmartCooking',
            metricName: 'InvalidIngredients',
            statistic: 'Sum',
            period: cdk.Duration.hours(1)
          })
        ],
        right: [validationRateMetric],
        width: 12,
        height: 6
      }),
      new cloudwatch.GraphWidget({
        title: 'User Activity',
        left: [
          new cloudwatch.Metric({
            namespace: 'SmartCooking',
            metricName: 'UserActivity',
            statistic: 'Sum',
            period: cdk.Duration.hours(1)
          })
        ],
        width: 12,
        height: 6
      }),

      // Security and Performance Row
      new cloudwatch.GraphWidget({
        title: 'Security Events',
        left: [securityEventMetric],
        width: 12,
        height: 6
      }),
      new cloudwatch.GraphWidget({
        title: 'Custom Error Rate',
        left: [customErrorMetric],
        width: 12,
        height: 6
      })
    );

    // Budget Alert
    const budget = new budgets.CfnBudget(this, 'Budget', {
      budget: {
        budgetName: `smart-cooking-budget-${environment}`,
        budgetLimit: {
          amount: budgetLimit,
          unit: 'USD'
        },
        timeUnit: 'MONTHLY',
        budgetType: 'COST',
        costFilters: {
          TagKey: ['Project'],
          TagValue: ['SmartCooking']
        }
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80, // 80% of budget
            thresholdType: 'PERCENTAGE'
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: 'admin@smartcooking.com' // Replace with actual email
            }
          ]
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100, // 100% of budget
            thresholdType: 'PERCENTAGE'
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: 'admin@smartcooking.com' // Replace with actual email
            }
          ]
        }
      ]
    });

    // Outputs
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${cdk.Stack.of(this).region}.console.aws.amazon.com/cloudwatch/home?region=${cdk.Stack.of(this).region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
      exportName: `SmartCooking-${environment}-DashboardUrl`
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic ARN for Alarms',
      exportName: `SmartCooking-${environment}-AlarmTopicArn`
    });

    // Tags
    cdk.Tags.of(this.alarmTopic).add('Component', 'Monitoring');
    cdk.Tags.of(this.dashboard).add('Component', 'Monitoring');
  }
}