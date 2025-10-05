# Smart Cooking CDK Infrastructure

This directory contains the AWS CDK infrastructure code for the Smart Cooking MVP application.

## Architecture Overview

The infrastructure is organized into multiple stacks:

- **MainStack**: Orchestrates all other stacks
- **DatabaseStack**: DynamoDB single-table design with GSI indexes
- **AuthStack**: Cognito User Pool and Identity Pool
- **LambdaStack**: All Lambda functions with proper IAM permissions
- **ApiStack**: API Gateway with Cognito authorizer and WAF
- **FrontendStack**: S3 static hosting + CloudFront + Route 53
- **MonitoringStack**: CloudWatch dashboards, alarms, and budgets

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Node.js** 18+ and npm
3. **AWS CDK** CLI installed globally: `npm install -g aws-cdk`
4. **Domain name** (for production) with Route 53 hosted zone

## Environment Setup

### Development Environment

```bash
# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy to development
npm run deploy:dev
```

### Production Environment

```bash
# Deploy to production
npm run deploy:prod
```

## Configuration

Environment-specific configurations are defined in `bin/app.ts`:

### Development (`dev`)
- Domain: `dev.smartcooking.local`
- Budget: $50/month
- Point-in-time recovery: Disabled
- WAF: Disabled
- Log retention: 7 days

### Production (`prod`)
- Domain: `smartcooking.com` (update with your domain)
- Budget: $200/month
- Point-in-time recovery: Enabled
- WAF: Enabled
- Log retention: 30 days

## Deployment Commands

```bash
# Build TypeScript
npm run build

# Synthesize CloudFormation templates
npm run synth

# Deploy all stacks to development
npm run deploy:dev

# Deploy all stacks to production
npm run deploy:prod

# View differences before deployment
npm run diff

# Destroy all stacks (be careful!)
npm run destroy
```

## Stack Dependencies

The stacks have the following dependencies:

```
MainStack
├── DatabaseStack (independent)
├── AuthStack (independent)
├── LambdaStack (depends on Database, Auth)
├── ApiStack (depends on Auth, Lambda)
├── FrontendStack (depends on Api, Auth)
└── MonitoringStack (depends on Api, Lambda, Frontend)
```

## Custom Domain Setup

For production deployment with a custom domain:

1. **Purchase domain** and create Route 53 hosted zone
2. **Update domain** in `bin/app.ts` (replace `smartcooking.com`)
3. **SSL Certificate** will be created automatically
4. **DNS validation** required for certificate

## Monitoring and Alerts

The monitoring stack creates:

- **CloudWatch Dashboard** with key metrics
- **Alarms** for errors, latency, and costs
- **SNS Topic** for alert notifications
- **Budget alerts** at 80% and 100% thresholds

Update the email address in `lib/monitoring-stack.ts` for notifications.

## Cost Optimization

The infrastructure is designed for cost optimization:

- **On-demand DynamoDB** (pay per use)
- **Serverless Lambda** functions
- **S3 + CloudFront** for static hosting
- **Budget alerts** to prevent overspending
- **Log retention** policies to control storage costs

## Security Features

- **Cognito authentication** with JWT tokens
- **API Gateway authorizers** for protected endpoints
- **WAF protection** (production only)
- **S3 bucket policies** with least privilege
- **Lambda IAM roles** with minimal permissions
- **Encryption at rest** for DynamoDB

## Troubleshooting

### Common Issues

1. **Bootstrap Error**: Run `cdk bootstrap` first
2. **Permission Denied**: Check AWS credentials and IAM permissions
3. **Domain Validation**: Manually validate SSL certificate in ACM console
4. **Lambda Deployment**: Ensure Lambda code exists in `../lambda/` directory

### Useful Commands

```bash
# Check CDK version
cdk --version

# List all stacks
cdk list

# View stack outputs
cdk deploy --outputs-file outputs.json

# View CloudFormation events
aws cloudformation describe-stack-events --stack-name SmartCooking-dev
```

## Environment Variables

The CDK will create environment configuration for the frontend:

- `NEXT_PUBLIC_API_URL`: API Gateway URL
- `NEXT_PUBLIC_USER_POOL_ID`: Cognito User Pool ID
- `NEXT_PUBLIC_USER_POOL_CLIENT_ID`: Cognito Client ID
- `NEXT_PUBLIC_ENVIRONMENT`: Environment name
- `NEXT_PUBLIC_REGION`: AWS region

## Support

For issues or questions:

1. Check CloudWatch logs for Lambda functions
2. Review CloudFormation events in AWS Console
3. Use CDK diff to see what changes will be made
4. Consult AWS CDK documentation

## License

MIT License - see LICENSE file for details.