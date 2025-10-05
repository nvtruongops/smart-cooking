import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { DatabaseStack } from './database-stack';
import { AuthStack } from './auth-stack';
import { ApiStack } from './api-stack';
import { LambdaStack } from './lambda-stack';
import { FrontendStack } from './frontend-stack';
import { MonitoringStack } from './monitoring-stack';

export interface MainStackProps extends cdk.StackProps {
  environment: string;
  config: {
    account?: string;
    region: string;
    domainName: string;
    certificateArn: string;
    enablePointInTimeRecovery: boolean;
    enableWaf: boolean;
    logRetentionDays: logs.RetentionDays;
    budgetLimit: number;
  };
}

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    const { environment, config } = props;

    // 1. Database Stack - DynamoDB tables and indexes
    const databaseStack = new DatabaseStack(this, 'Database', {
      environment,
      enablePointInTimeRecovery: config.enablePointInTimeRecovery,
      logRetentionDays: config.logRetentionDays
    });

    // 2. Auth Stack - Cognito User Pool and Identity Pool
    const authStack = new AuthStack(this, 'Auth', {
      environment,
      domainName: config.domainName
    });

    // Create SNS topic first for admin notifications
    const adminTopic = new cdk.aws_sns.Topic(this, 'AdminAlarmTopic', {
      topicName: `smart-cooking-alerts-${environment}`,
      displayName: `Smart Cooking ${environment} Alerts`
    });

    // Add email subscription for admin notifications
    adminTopic.addSubscription(
      new cdk.aws_sns_subscriptions.EmailSubscription('admin@smartcooking.com') // Replace with actual email
    );

    // 3. Lambda Stack - All Lambda functions
    const lambdaStack = new LambdaStack(this, 'Lambda', {
      environment,
      table: databaseStack.table,
      userPool: authStack.userPool,
      userPoolClient: authStack.userPoolClient,
      logRetentionDays: config.logRetentionDays,
      adminTopicArn: adminTopic.topicArn
    });

    // 4. API Stack - API Gateway with Lambda integrations
    const apiStack = new ApiStack(this, 'Api', {
      environment,
      userPool: authStack.userPool,
      lambdaFunctions: lambdaStack.functions,
      enableWaf: config.enableWaf
    });

    // 5. Frontend Stack - S3, CloudFront, Route 53
    const frontendStack = new FrontendStack(this, 'Frontend', {
      environment,
      domainName: config.domainName,
      certificateArn: config.certificateArn,
      apiGatewayUrl: apiStack.apiUrl,
      userPoolId: authStack.userPool.userPoolId,
      userPoolClientId: authStack.userPoolClient.userPoolClientId
    });

    // 6. Monitoring Stack - CloudWatch, X-Ray, Budgets
    const monitoringStack = new MonitoringStack(this, 'Monitoring', {
      environment,
      budgetLimit: config.budgetLimit,
      apiGateway: apiStack.api,
      lambdaFunctions: Object.values(lambdaStack.functions),
      distribution: frontendStack.distribution
    });

    // Stack outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: apiStack.apiUrl,
      description: 'API Gateway URL'
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: frontendStack.websiteUrl,
      description: 'Website URL'
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: authStack.userPool.userPoolId,
      description: 'Cognito User Pool ID'
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: authStack.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID'
    });

    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: databaseStack.table.tableName,
      description: 'DynamoDB Table Name'
    });
  }
}