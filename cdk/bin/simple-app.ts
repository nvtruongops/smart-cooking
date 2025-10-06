#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SimpleStack } from '../lib/simple-stack';

const app = new cdk.App();

// Get environment from context
const environment = app.node.tryGetContext('environment') || 'dev';

// Create the simplified stack
new SimpleStack(app, `SmartCooking-${environment}-Simple`, {
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-1',
  },
  description: `Smart Cooking MVP - ${environment} environment (Simplified Stack)`,
  tags: {
    Environment: environment,
    Project: 'SmartCooking',
    Version: '1.0.0',
  },
});

app.synth();