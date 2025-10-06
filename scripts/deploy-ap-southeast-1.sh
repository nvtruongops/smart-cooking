#!/bin/bash

# Smart Cooking MVP - Deploy to ap-southeast-1 (Singapore)
# This script handles the region-specific configuration for deployment

set -e

echo "🚀 Smart Cooking MVP - Deploying to ap-southeast-1"
echo "=================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check prerequisites
print_status "Checking prerequisites..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check CDK CLI
if ! command -v cdk &> /dev/null; then
    print_error "AWS CDK CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

print_success "Prerequisites check passed"

# Set environment variables for ap-southeast-1 deployment
print_status "Setting environment variables for ap-southeast-1..."

export AWS_REGION=ap-southeast-1
export CDK_DEFAULT_REGION=ap-southeast-1
export BEDROCK_REGION=ap-southeast-1  # Bedrock now available locally!
# Certificate region not needed - using default CloudFront domain

print_status "Environment variables set:"
echo "  AWS_REGION: $AWS_REGION"
echo "  CDK_DEFAULT_REGION: $CDK_DEFAULT_REGION"
echo "  BEDROCK_REGION: $BEDROCK_REGION"
# Certificate region not needed for default CloudFront domain

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
print_status "AWS Account ID: $ACCOUNT_ID"

# Check if Bedrock is accessible from us-east-1
print_status "Testing Bedrock accessibility..."
if aws bedrock list-foundation-models --region us-east-1 &> /dev/null; then
    print_success "Bedrock is accessible from us-east-1"
else
    print_warning "Bedrock access test failed. Please ensure you have Bedrock permissions."
fi

# Bootstrap CDK for ap-southeast-1 if needed
print_status "Checking CDK bootstrap status for ap-southeast-1..."
if aws cloudformation describe-stacks --stack-name CDKToolkit --region ap-southeast-1 &> /dev/null; then
    print_success "CDK already bootstrapped for ap-southeast-1"
else
    print_status "Bootstrapping CDK for ap-southeast-1..."
    cdk bootstrap aws://$ACCOUNT_ID/ap-southeast-1
    print_success "CDK bootstrap completed"
fi

# Check if we need to bootstrap us-east-1 for cross-region resources
print_status "Checking CDK bootstrap status for us-east-1 (for cross-region resources)..."
if aws cloudformation describe-stacks --stack-name CDKToolkit --region us-east-1 &> /dev/null; then
    print_success "CDK already bootstrapped for us-east-1"
else
    print_warning "CDK not bootstrapped for us-east-1. Some cross-region features may not work."
    read -p "Do you want to bootstrap us-east-1? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cdk bootstrap aws://$ACCOUNT_ID/us-east-1
        print_success "CDK bootstrap completed for us-east-1"
    fi
fi

# Build Lambda functions
print_status "Building Lambda functions..."
cd lambda

# Build each Lambda function
for dir in auth-handler user-profile ingredient-validator ai-suggestion cooking-session recipe rating monitoring; do
    if [ -d "$dir" ]; then
        print_status "Building $dir..."
        cd $dir
        if [ -f "package.json" ]; then
            npm install --production
        fi
        cd ..
    fi
done

cd ..

# Synthesize CDK
print_status "Synthesizing CDK templates..."
cd cdk
npm install
cdk synth --all

# Deploy infrastructure
print_status "Deploying infrastructure to ap-southeast-1..."
print_warning "This deployment will use cross-region calls to Bedrock in us-east-1"
print_warning "Expected additional latency: 180-250ms for AI operations"

read -p "Do you want to proceed with deployment? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_status "Deployment cancelled by user"
    exit 0
fi

# Deploy with environment context
cdk deploy --all --context environment=prod --require-approval never

print_success "Deployment completed!"

# Get outputs
print_status "Retrieving deployment outputs..."

API_URL=$(aws cloudformation describe-stacks --stack-name SmartCooking-prod --region ap-southeast-1 --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text 2>/dev/null || echo "Not found")
WEBSITE_URL=$(aws cloudformation describe-stacks --stack-name SmartCooking-prod --region ap-southeast-1 --query 'Stacks[0].Outputs[?OutputKey==`WebsiteUrl`].OutputValue' --output text 2>/dev/null || echo "Not found")
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name SmartCooking-prod --region ap-southeast-1 --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text 2>/dev/null || echo "Not found")

echo ""
echo "🎉 Deployment Summary"
echo "===================="
echo "Region: ap-southeast-1 (Singapore)"
echo "API URL: $API_URL"
echo "Website URL: $WEBSITE_URL"
echo "User Pool ID: $USER_POOL_ID"
echo ""

# Performance testing
print_status "Running basic connectivity tests..."

# Test API Gateway
if [ "$API_URL" != "Not found" ]; then
    print_status "Testing API Gateway connectivity..."
    if curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" | grep -q "200\|404"; then
        print_success "API Gateway is accessible"
    else
        print_warning "API Gateway connectivity test failed"
    fi
fi

# Test DynamoDB
print_status "Testing DynamoDB connectivity..."
TABLE_NAME=$(aws cloudformation describe-stacks --stack-name SmartCooking-prod --region ap-southeast-1 --query 'Stacks[0].Outputs[?OutputKey==`DynamoDBTableName`].OutputValue' --output text 2>/dev/null || echo "")
if [ -n "$TABLE_NAME" ] && [ "$TABLE_NAME" != "Not found" ]; then
    if aws dynamodb describe-table --table-name "$TABLE_NAME" --region ap-southeast-1 &> /dev/null; then
        print_success "DynamoDB table is accessible"
    else
        print_warning "DynamoDB connectivity test failed"
    fi
fi

# Performance recommendations
echo ""
print_status "Performance Recommendations for ap-southeast-1:"
echo "• AI operations will have additional 180-250ms latency due to cross-region Bedrock calls"
echo "• Consider implementing caching for frequent AI requests"
echo "• Monitor CloudWatch metrics for cross-region performance"
echo "• Set appropriate timeout values for Lambda functions"

# Cost considerations
echo ""
print_status "Cost Considerations:"
echo "• Cross-region data transfer: ~\$0.02/GB for Bedrock calls"
echo "• Typical AI request: 1-2KB → negligible additional cost"
echo "• Estimated monthly impact: <\$1 for 10,000 requests"

# Next steps
echo ""
print_status "Next Steps:"
echo "1. Update your application configuration with the new endpoints"
echo "2. Run E2E tests to verify functionality: cd tests/e2e && TEST_ENV=prod npm test"
echo "3. Monitor CloudWatch dashboards for performance metrics"
echo "4. Set up DNS records if using custom domain"

print_success "Deployment to ap-southeast-1 completed successfully!"

cd ..