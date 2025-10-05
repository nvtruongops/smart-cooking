# Smart Cooking Deployment Guide

This guide covers the complete deployment process for the Smart Cooking MVP application, including infrastructure setup, frontend deployment, and domain configuration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Infrastructure Deployment](#infrastructure-deployment)
3. [Frontend Deployment](#frontend-deployment)
4. [Domain Configuration](#domain-configuration)
5. [Environment Configuration](#environment-configuration)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

- **AWS CLI** (v2.x): [Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- **Node.js** (v20.x): [Download](https://nodejs.org/)
- **AWS CDK** (v2.100.0): `npm install -g aws-cdk`
- **Git**: For version control

### AWS Account Setup

1. **AWS Account**: Ensure you have an AWS account with appropriate permissions
2. **IAM User**: Create an IAM user with the following managed policies:
   - `PowerUserAccess` (for development)
   - `IAMFullAccess` (for CDK bootstrap)
3. **AWS CLI Configuration**:
   ```bash
   aws configure
   # Enter your Access Key ID, Secret Access Key, and default region (us-east-1)
   ```

### Domain Setup (Production Only)

If deploying to production with a custom domain:

1. **Domain Registration**: Register your domain (e.g., `smartcooking.com`)
2. **Route 53 Hosted Zone**: Will be created automatically by CDK
3. **SSL Certificate**: Will be created automatically by CDK

## Infrastructure Deployment

### 1. Clone and Setup

```bash
git clone <repository-url>
cd smart-cooking
```

### 2. Deploy Infrastructure

#### Development Environment

```bash
# Deploy to development
./scripts/deploy-infrastructure.sh -e dev

# Or using PowerShell on Windows
.\scripts\deploy-infrastructure.ps1 -Environment dev
```

#### Production Environment

```bash
# Show what will be deployed (recommended first)
./scripts/deploy-infrastructure.sh -e prod --diff-only

# Deploy to production
./scripts/deploy-infrastructure.sh -e prod

# Or using PowerShell on Windows
.\scripts\deploy-infrastructure.ps1 -Environment prod
```

### 3. Verify Infrastructure

After deployment, verify the following resources were created:

- **S3 Buckets**: Website hosting and CloudFront logs
- **CloudFront Distribution**: CDN for global content delivery
- **Route 53 Records**: DNS records (production only)
- **DynamoDB Table**: Database for application data
- **Lambda Functions**: Backend API functions
- **API Gateway**: REST API endpoints
- **Cognito User Pool**: User authentication

## Frontend Deployment

### 1. Build and Deploy Frontend

#### Development Environment

```bash
# Deploy frontend to development
./scripts/deploy-frontend.sh -e dev

# Or using PowerShell on Windows
.\scripts\deploy-frontend.ps1 -Environment dev
```

#### Production Environment

```bash
# Deploy frontend to production
./scripts/deploy-frontend.sh -e prod

# Or using PowerShell on Windows
.\scripts\deploy-frontend.ps1 -Environment prod
```

### 2. Deployment Options

The deployment script supports several options:

```bash
# Skip tests (faster deployment)
./scripts/deploy-frontend.sh -e dev --skip-tests

# Skip build (use existing build)
./scripts/deploy-frontend.sh -e dev --skip-build

# Dry run (show what would be deployed)
./scripts/deploy-frontend.sh -e prod --dry-run
```

### 3. Automated Deployment

The application includes GitHub Actions workflows for automated deployment:

- **Infrastructure**: `.github/workflows/deploy.yml`
- **Frontend**: `.github/workflows/frontend-deploy.yml`

#### Setup GitHub Actions

1. **Repository Secrets**: Add the following secrets to your GitHub repository:

   ```
   AWS_ACCESS_KEY_ID          # Development AWS access key
   AWS_SECRET_ACCESS_KEY      # Development AWS secret key
   AWS_ACCESS_KEY_ID_PROD     # Production AWS access key
   AWS_SECRET_ACCESS_KEY_PROD # Production AWS secret key
   SNYK_TOKEN                 # Snyk security scanning token (optional)
   ```

2. **Deployment Triggers**:
   - Push to `develop` branch → Deploy to development
   - Push to `main` branch → Deploy to production
   - Manual workflow dispatch → Deploy to specified environment

## Domain Configuration

### Development Environment

Development uses CloudFront distribution domain:
- URL: `https://d1234567890.cloudfront.net`
- No custom domain required

### Production Environment

#### Automatic Domain Setup (Recommended)

If you own a domain, CDK will automatically:

1. Create Route 53 hosted zone
2. Generate SSL certificate
3. Configure DNS records
4. Set up domain redirects

#### Manual Domain Setup

If CDK cannot automatically configure your domain:

1. **Get Name Servers**: After deployment, check CloudFormation outputs for name servers
2. **Update Domain Registrar**: Point your domain to the Route 53 name servers
3. **Wait for Propagation**: DNS changes can take up to 48 hours

#### Domain Configuration Example

```typescript
// In cdk/bin/app.ts
const config = {
  prod: {
    domainName: 'smartcooking.com', // Replace with your domain
    // ... other config
  }
};
```

## Environment Configuration

### Environment Variables

The application uses the following environment variables:

#### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=https://api.smartcooking.com
NEXT_PUBLIC_USER_POOL_ID=us-east-1_XXXXXXXXX
NEXT_PUBLIC_USER_POOL_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_ENVIRONMENT=prod
NEXT_PUBLIC_REGION=us-east-1
NEXT_PUBLIC_S3_BUCKET=smart-cooking-frontend-prod-XXXXXX
```

#### Backend (Lambda Environment Variables)

Set automatically by CDK:

```env
DYNAMODB_TABLE=smart-cooking-data
BEDROCK_REGION=us-east-1
USER_POOL_ID=us-east-1_XXXXXXXXX
```

### Configuration Management

- **Development**: Uses default configurations with reduced resources
- **Production**: Uses optimized configurations with enhanced security and monitoring

## Monitoring and Maintenance

### CloudWatch Monitoring

The application includes comprehensive monitoring:

1. **Dashboards**: Custom CloudWatch dashboards for key metrics
2. **Alarms**: Automated alerts for errors, latency, and costs
3. **Logs**: Structured logging across all components

### Cost Monitoring

- **Budget Alerts**: Configured at $140 (warning) and $170 (critical)
- **Cost Optimization**: Automatic scaling and resource optimization
- **Usage Tracking**: Monitor AI usage and database costs

### Backup and Recovery

- **DynamoDB**: Point-in-time recovery enabled (production)
- **S3**: Versioning enabled for website assets
- **CloudFormation**: Infrastructure as code for easy recovery

### Security Monitoring

- **AWS WAF**: Web application firewall (production)
- **CloudTrail**: API call logging
- **Security Scanning**: Automated vulnerability scanning

## Troubleshooting

### Common Issues

#### 1. CDK Bootstrap Errors

```bash
# Error: CDK not bootstrapped
# Solution: Bootstrap CDK
npx cdk bootstrap --context environment=dev
```

#### 2. Domain Certificate Issues

```bash
# Error: Certificate validation failed
# Solution: Check DNS records and wait for propagation
aws route53 list-resource-record-sets --hosted-zone-id ZXXXXXXXXXXXXX
```

#### 3. CloudFront Cache Issues

```bash
# Error: Old content still showing
# Solution: Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id EXXXXXXXXXXXXX --paths "/*"
```

#### 4. Lambda Function Errors

```bash
# Check Lambda logs
aws logs tail /aws/lambda/smart-cooking-ai-suggestion --follow
```

#### 5. API Gateway Issues

```bash
# Test API endpoints
curl -X GET https://api.smartcooking.com/health
```

### Deployment Rollback

#### Infrastructure Rollback

```bash
# Rollback to previous CDK deployment
npx cdk deploy --rollback --context environment=prod
```

#### Frontend Rollback

```bash
# Deploy previous frontend version
git checkout <previous-commit>
./scripts/deploy-frontend.sh -e prod
```

### Performance Optimization

#### CloudFront Optimization

- **Cache Policies**: Optimized for static assets vs. dynamic content
- **Compression**: Gzip and Brotli compression enabled
- **Geographic Distribution**: Global edge locations

#### Lambda Optimization

- **Memory Allocation**: Right-sized based on function requirements
- **Cold Start Reduction**: Provisioned concurrency for critical functions
- **Connection Pooling**: Reuse database connections

### Security Best Practices

#### Infrastructure Security

- **IAM Roles**: Least privilege access
- **VPC**: Network isolation (if required)
- **Encryption**: At rest and in transit
- **WAF Rules**: Protection against common attacks

#### Application Security

- **Authentication**: Cognito JWT tokens
- **Authorization**: Resource-based access control
- **Input Validation**: Sanitization and validation
- **HTTPS Only**: Secure communication

### Maintenance Tasks

#### Regular Maintenance

1. **Update Dependencies**: Monthly security updates
2. **Review Logs**: Weekly log analysis
3. **Cost Review**: Monthly cost optimization
4. **Security Scan**: Weekly vulnerability scanning

#### Quarterly Tasks

1. **Performance Review**: Analyze and optimize performance
2. **Capacity Planning**: Review and adjust resource allocation
3. **Disaster Recovery Test**: Test backup and recovery procedures
4. **Security Audit**: Comprehensive security review

## Support and Resources

### Documentation

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Next.js Documentation](https://nextjs.org/docs)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)

### Monitoring URLs

After deployment, access these URLs for monitoring:

- **CloudWatch Dashboard**: AWS Console → CloudWatch → Dashboards
- **API Gateway Logs**: AWS Console → API Gateway → Logs
- **Lambda Logs**: AWS Console → Lambda → Functions → Monitoring

### Emergency Contacts

- **AWS Support**: [AWS Support Center](https://console.aws.amazon.com/support/)
- **Development Team**: [Contact Information]
- **On-Call Engineer**: [Contact Information]

---

For additional help or questions, please refer to the project documentation or contact the development team.