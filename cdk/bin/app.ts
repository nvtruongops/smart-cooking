#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { MainStack } from '../lib/main-stack';

const app = new cdk.App();

// Get environment from context
const environment = app.node.tryGetContext('environment') || 'dev';
const isDev = environment === 'dev';
const isProd = environment === 'prod';

// Environment-specific configurations
const config = {
  dev: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-1',
    domainName: process.env.DOMAIN_NAME || '', // e.g., 'dev.smartcooking.com'
    certificateArn: process.env.CERTIFICATE_ARN || '',
    createHostedZone: process.env.CREATE_HOSTED_ZONE === 'true',
    enablePointInTimeRecovery: false,
    enableWaf: false,
    logRetentionDays: logs.RetentionDays.ONE_WEEK,
    budgetLimit: 50 // USD
  },
  prod: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-1',
    domainName: process.env.DOMAIN_NAME || 'smartcooking.com', // Default production domain
    certificateArn: process.env.CERTIFICATE_ARN || '',
    createHostedZone: process.env.CREATE_HOSTED_ZONE === 'true',
    enablePointInTimeRecovery: true,
    enableWaf: true,
    logRetentionDays: logs.RetentionDays.ONE_MONTH,
    budgetLimit: 200 // USD
  }
};

const envConfig = config[environment as keyof typeof config] || config.dev;

// Create main stack
new MainStack(app, `SmartCooking-${environment}`, {
  env: {
    account: envConfig.account,
    region: envConfig.region,
  },
  environment,
  config: envConfig,
  tags: {
    Project: 'SmartCooking',
    Environment: environment,
    ManagedBy: 'CDK',
    CostCenter: 'SmartCooking-MVP'
  }
});

// Add global tags
cdk.Tags.of(app).add('Project', 'SmartCooking');
cdk.Tags.of(app).add('Environment', environment);
cdk.Tags.of(app).add('ManagedBy', 'CDK');