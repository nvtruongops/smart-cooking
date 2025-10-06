#!/bin/bash

# Smart Cooking Deployment Validation Script
# This script validates that the deployment was successful

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
AWS_REGION="ap-southeast-1"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [-e environment] [-r region]"
            echo "Validate Smart Cooking deployment"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_status "Validating Smart Cooking deployment for environment: $ENVIRONMENT"

# Function to get CloudFormation stack output
get_stack_output() {
    local stack_name=$1
    local output_key=$2
    
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text 2>/dev/null || echo ""
}

# Function to check if stack exists
check_stack_exists() {
    local stack_name=$1
    
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$AWS_REGION" \
        --query "Stacks[0].StackStatus" \
        --output text &>/dev/null
}

# Validation counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Function to run a validation check
run_check() {
    local check_name=$1
    local check_command=$2
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    print_status "Checking: $check_name"
    
    if eval "$check_command" &>/dev/null; then
        print_success "✅ $check_name"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        print_error "❌ $check_name"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

print_status "Starting validation checks..."

# 1. Check CloudFormation Stacks
print_status "=== CloudFormation Stacks ==="

run_check "Main Stack exists" "check_stack_exists 'SmartCooking-$ENVIRONMENT'"
run_check "Database Stack exists" "check_stack_exists 'SmartCooking-$ENVIRONMENT-Database'"
run_check "Auth Stack exists" "check_stack_exists 'SmartCooking-$ENVIRONMENT-Auth'"
run_check "Lambda Stack exists" "check_stack_exists 'SmartCooking-$ENVIRONMENT-Lambda'"
run_check "API Stack exists" "check_stack_exists 'SmartCooking-$ENVIRONMENT-Api'"
run_check "Frontend Stack exists" "check_stack_exists 'SmartCooking-$ENVIRONMENT-Frontend'"

# 2. Check Infrastructure Resources
print_status "=== Infrastructure Resources ==="

# Get resource information
BUCKET_NAME=$(get_stack_output "SmartCooking-$ENVIRONMENT-Frontend" "WebsiteBucketName")
DISTRIBUTION_ID=$(get_stack_output "SmartCooking-$ENVIRONMENT-Frontend" "DistributionId")
API_URL=$(get_stack_output "SmartCooking-$ENVIRONMENT-Api" "ApiUrl")
USER_POOL_ID=$(get_stack_output "SmartCooking-$ENVIRONMENT-Auth" "UserPoolId")
TABLE_NAME=$(get_stack_output "SmartCooking-$ENVIRONMENT-Database" "DynamoDBTableName")

run_check "S3 Bucket exists" "aws s3 ls s3://$BUCKET_NAME"
run_check "CloudFront Distribution exists" "aws cloudfront get-distribution --id $DISTRIBUTION_ID"
run_check "DynamoDB Table exists" "aws dynamodb describe-table --table-name $TABLE_NAME"
run_check "Cognito User Pool exists" "aws cognito-idp describe-user-pool --user-pool-id $USER_POOL_ID"

# 3. Check API Endpoints
print_status "=== API Endpoints ==="

if [[ -n "$API_URL" ]]; then
    run_check "API Gateway health check" "curl -f -s $API_URL/health"
    run_check "API Gateway CORS headers" "curl -s -I $API_URL/health | grep -i 'access-control-allow-origin'"
else
    print_warning "API URL not found, skipping API checks"
fi

# 4. Check Website
print_status "=== Website ==="

WEBSITE_URL=$(get_stack_output "SmartCooking-$ENVIRONMENT-Frontend" "WebsiteUrl")

if [[ -n "$WEBSITE_URL" ]]; then
    run_check "Website responds" "curl -f -s $WEBSITE_URL"
    run_check "Website returns HTML" "curl -s $WEBSITE_URL | grep -i '<html>'"
    run_check "Website has correct headers" "curl -s -I $WEBSITE_URL | grep -i 'content-type: text/html'"
else
    print_warning "Website URL not found, skipping website checks"
fi

# 5. Check Lambda Functions
print_status "=== Lambda Functions ==="

LAMBDA_FUNCTIONS=(
    "smart-cooking-$ENVIRONMENT-ai-suggestion"
    "smart-cooking-$ENVIRONMENT-auth-handler"
    "smart-cooking-$ENVIRONMENT-cooking-history"
    "smart-cooking-$ENVIRONMENT-ingredient-validator"
    "smart-cooking-$ENVIRONMENT-user-profile"
)

for func in "${LAMBDA_FUNCTIONS[@]}"; do
    run_check "Lambda function $func exists" "aws lambda get-function --function-name $func"
done

# 6. Check Monitoring
print_status "=== Monitoring ==="

run_check "CloudWatch Log Groups exist" "aws logs describe-log-groups --log-group-name-prefix '/aws/lambda/smart-cooking-$ENVIRONMENT'"

# 7. Security Checks
print_status "=== Security ==="

if [[ -n "$BUCKET_NAME" ]]; then
    run_check "S3 Bucket has public read policy" "aws s3api get-bucket-policy --bucket $BUCKET_NAME"
fi

if [[ -n "$DISTRIBUTION_ID" ]]; then
    run_check "CloudFront uses HTTPS" "aws cloudfront get-distribution --id $DISTRIBUTION_ID | grep -i 'ViewerProtocolPolicy.*redirect-to-https'"
fi

# Summary
print_status "=== Validation Summary ==="
print_status "Total checks: $TOTAL_CHECKS"
print_success "Passed: $PASSED_CHECKS"

if [[ $FAILED_CHECKS -gt 0 ]]; then
    print_error "Failed: $FAILED_CHECKS"
    print_error "Some validation checks failed. Please review the errors above."
    exit 1
else
    print_success "All validation checks passed! 🎉"
    print_status "Deployment appears to be successful."
fi

# Display useful information
print_status "=== Deployment Information ==="
print_status "Environment: $ENVIRONMENT"
print_status "Region: $AWS_REGION"
[[ -n "$WEBSITE_URL" ]] && print_status "Website URL: $WEBSITE_URL"
[[ -n "$API_URL" ]] && print_status "API URL: $API_URL"
[[ -n "$BUCKET_NAME" ]] && print_status "S3 Bucket: $BUCKET_NAME"
[[ -n "$DISTRIBUTION_ID" ]] && print_status "CloudFront Distribution: $DISTRIBUTION_ID"

print_status "Validation completed successfully!"