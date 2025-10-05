#!/bin/bash

# Smart Cooking Frontend Deployment Script
# This script builds and deploys the Next.js frontend to S3 and invalidates CloudFront cache

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
AWS_REGION="us-east-1"
SKIP_BUILD=false
SKIP_TESTS=false
DRY_RUN=false

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

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy Smart Cooking frontend to AWS S3 and CloudFront

OPTIONS:
    -e, --environment ENV    Target environment (dev|prod) [default: dev]
    -r, --region REGION      AWS region [default: us-east-1]
    -s, --skip-build         Skip the build process
    -t, --skip-tests         Skip running tests
    -d, --dry-run           Show what would be deployed without actually deploying
    -h, --help              Show this help message

EXAMPLES:
    $0                                    # Deploy to dev environment
    $0 -e prod                           # Deploy to production
    $0 -e dev --skip-tests               # Deploy to dev without running tests
    $0 -e prod --dry-run                 # Show what would be deployed to prod

PREREQUISITES:
    - AWS CLI configured with appropriate credentials
    - Node.js and npm installed
    - CDK infrastructure already deployed
    - Frontend directory exists with package.json

EOF
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
        -s|--skip-build)
            SKIP_BUILD=true
            shift
            ;;
        -t|--skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    print_error "Environment must be 'dev' or 'prod'"
    exit 1
fi

# Check prerequisites
print_status "Checking prerequisites..."

# Check if AWS CLI is installed and configured
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured or invalid"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install it first."
    exit 1
fi

# Check if frontend directory exists
if [[ ! -d "frontend" ]]; then
    print_error "Frontend directory not found. Please run this script from the project root."
    exit 1
fi

# Check if package.json exists
if [[ ! -f "frontend/package.json" ]]; then
    print_error "Frontend package.json not found"
    exit 1
fi

print_success "Prerequisites check passed"

# Get infrastructure outputs from CloudFormation
print_status "Getting infrastructure information..."

get_stack_output() {
    local stack_name=$1
    local output_key=$2
    
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --region "$AWS_REGION" \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text 2>/dev/null || echo ""
}

# Get required infrastructure outputs
BUCKET_NAME=$(get_stack_output "SmartCooking-$ENVIRONMENT-Frontend" "WebsiteBucketName")
DISTRIBUTION_ID=$(get_stack_output "SmartCooking-$ENVIRONMENT-Frontend" "DistributionId")
API_URL=$(get_stack_output "SmartCooking-$ENVIRONMENT-Api" "ApiUrl")
USER_POOL_ID=$(get_stack_output "SmartCooking-$ENVIRONMENT-Auth" "UserPoolId")
USER_POOL_CLIENT_ID=$(get_stack_output "SmartCooking-$ENVIRONMENT-Auth" "UserPoolClientId")
WEBSITE_URL=$(get_stack_output "SmartCooking-$ENVIRONMENT-Frontend" "WebsiteUrl")

# Validate that we got the required outputs
if [[ -z "$BUCKET_NAME" || -z "$DISTRIBUTION_ID" ]]; then
    print_error "Could not retrieve infrastructure information. Make sure CDK stacks are deployed."
    print_error "Missing: Bucket Name: '$BUCKET_NAME', Distribution ID: '$DISTRIBUTION_ID'"
    exit 1
fi

print_success "Infrastructure information retrieved"
print_status "S3 Bucket: $BUCKET_NAME"
print_status "CloudFront Distribution: $DISTRIBUTION_ID"
print_status "Website URL: $WEBSITE_URL"

if [[ "$DRY_RUN" == "true" ]]; then
    print_warning "DRY RUN MODE - No actual deployment will occur"
    print_status "Would deploy to:"
    print_status "  Environment: $ENVIRONMENT"
    print_status "  S3 Bucket: $BUCKET_NAME"
    print_status "  CloudFront Distribution: $DISTRIBUTION_ID"
    print_status "  API URL: $API_URL"
    exit 0
fi

# Change to frontend directory
cd frontend

# Install dependencies
print_status "Installing frontend dependencies..."
npm ci

# Run tests (unless skipped)
if [[ "$SKIP_TESTS" != "true" ]]; then
    print_status "Running tests..."
    npm test -- --run --coverage || {
        print_error "Tests failed. Use --skip-tests to bypass."
        exit 1
    }
    print_success "Tests passed"
fi

# Create environment configuration
print_status "Creating environment configuration..."
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=$API_URL
NEXT_PUBLIC_USER_POOL_ID=$USER_POOL_ID
NEXT_PUBLIC_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
NEXT_PUBLIC_ENVIRONMENT=$ENVIRONMENT
NEXT_PUBLIC_REGION=$AWS_REGION
NEXT_PUBLIC_S3_BUCKET=$BUCKET_NAME
EOF

print_success "Environment configuration created"

# Build the application (unless skipped)
if [[ "$SKIP_BUILD" != "true" ]]; then
    print_status "Building frontend application..."
    npm run build
    npm run export
    print_success "Build completed"
else
    print_warning "Skipping build process"
    if [[ ! -d "out" ]]; then
        print_error "No build output found and build was skipped. Run without --skip-build first."
        exit 1
    fi
fi

# Deploy to S3
print_status "Deploying to S3..."

# Sync static assets with long cache
print_status "Uploading static assets with long cache..."
aws s3 sync out/ s3://$BUCKET_NAME/ \
    --region "$AWS_REGION" \
    --delete \
    --cache-control "public, max-age=31536000" \
    --exclude "*.html" \
    --exclude "*.json" \
    --exclude "service-worker.js" \
    --exclude "sitemap.xml" \
    --exclude "robots.txt"

# Sync HTML and dynamic files with short cache
print_status "Uploading HTML and dynamic files with short cache..."
aws s3 sync out/ s3://$BUCKET_NAME/ \
    --region "$AWS_REGION" \
    --cache-control "public, max-age=3600" \
    --include "*.html" \
    --include "*.json" \
    --include "service-worker.js" \
    --include "sitemap.xml" \
    --include "robots.txt"

print_success "Files uploaded to S3"

# Invalidate CloudFront cache
print_status "Invalidating CloudFront cache..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --query 'Invalidation.Id' \
    --output text)

print_success "CloudFront invalidation created: $INVALIDATION_ID"

# Wait for invalidation to complete
print_status "Waiting for cache invalidation to complete..."
aws cloudfront wait invalidation-completed \
    --distribution-id "$DISTRIBUTION_ID" \
    --id "$INVALIDATION_ID"

print_success "Cache invalidation completed"

# Verify deployment
print_status "Verifying deployment..."
if [[ -n "$WEBSITE_URL" ]]; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEBSITE_URL" || echo "000")
    if [[ "$HTTP_STATUS" == "200" ]]; then
        print_success "Website is responding correctly (HTTP $HTTP_STATUS)"
    else
        print_warning "Website health check returned HTTP $HTTP_STATUS"
    fi
else
    print_warning "Website URL not available for verification"
fi

# Final success message
print_success "🚀 Frontend deployment completed successfully!"
print_status "Environment: $ENVIRONMENT"
print_status "Website URL: $WEBSITE_URL"
print_status "Deployment time: $(date)"

# Clean up
rm -f .env.local

print_status "Deployment script completed"