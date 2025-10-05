#!/bin/bash

# Smart Cooking Infrastructure Deployment Script
# This script deploys the CDK infrastructure and handles post-deployment tasks

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
SKIP_BOOTSTRAP=false
DIFF_ONLY=false
DESTROY=false

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

Deploy Smart Cooking CDK infrastructure to AWS

OPTIONS:
    -e, --environment ENV    Target environment (dev|prod) [default: dev]
    -r, --region REGION      AWS region [default: us-east-1]
    -s, --skip-bootstrap     Skip CDK bootstrap process
    -d, --diff-only         Show differences without deploying
    -x, --destroy           Destroy the infrastructure
    -h, --help              Show this help message

EXAMPLES:
    $0                                    # Deploy to dev environment
    $0 -e prod                           # Deploy to production
    $0 -e dev --diff-only                # Show what would change in dev
    $0 -e prod --destroy                 # Destroy production infrastructure

PREREQUISITES:
    - AWS CLI configured with appropriate credentials
    - Node.js and npm installed
    - CDK CLI installed globally (npm install -g aws-cdk)

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
        -s|--skip-bootstrap)
            SKIP_BOOTSTRAP=true
            shift
            ;;
        -d|--diff-only)
            DIFF_ONLY=true
            shift
            ;;
        -x|--destroy)
            DESTROY=true
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

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    print_error "AWS CDK is not installed. Please install it: npm install -g aws-cdk"
    exit 1
fi

# Check if CDK directory exists
if [[ ! -d "cdk" ]]; then
    print_error "CDK directory not found. Please run this script from the project root."
    exit 1
fi

print_success "Prerequisites check passed"

# Change to CDK directory
cd cdk

# Install dependencies
print_status "Installing CDK dependencies..."
npm ci

# Build the CDK project
print_status "Building CDK project..."
npm run build

# Bootstrap CDK (unless skipped)
if [[ "$SKIP_BOOTSTRAP" != "true" ]]; then
    print_status "Bootstrapping CDK..."
    npx cdk bootstrap --context environment=$ENVIRONMENT
    print_success "CDK bootstrap completed"
fi

# Handle destroy operation
if [[ "$DESTROY" == "true" ]]; then
    print_warning "⚠️  DESTROYING INFRASTRUCTURE FOR ENVIRONMENT: $ENVIRONMENT"
    print_warning "This action cannot be undone!"
    
    read -p "Are you sure you want to destroy the infrastructure? (type 'yes' to confirm): " confirm
    if [[ "$confirm" != "yes" ]]; then
        print_status "Destruction cancelled"
        exit 0
    fi
    
    print_status "Destroying infrastructure..."
    npx cdk destroy --all --force --context environment=$ENVIRONMENT
    print_success "Infrastructure destroyed"
    exit 0
fi

# Show diff if requested
if [[ "$DIFF_ONLY" == "true" ]]; then
    print_status "Showing infrastructure differences..."
    npx cdk diff --context environment=$ENVIRONMENT
    exit 0
fi

# Deploy the infrastructure
print_status "Deploying infrastructure to $ENVIRONMENT..."
print_status "This may take several minutes..."

# Deploy all stacks
npx cdk deploy --all --require-approval never --context environment=$ENVIRONMENT --outputs-file ../deployment-outputs-$ENVIRONMENT.json

if [[ $? -eq 0 ]]; then
    print_success "Infrastructure deployment completed successfully!"
    
    # Display important outputs
    print_status "Deployment outputs:"
    if [[ -f "../deployment-outputs-$ENVIRONMENT.json" ]]; then
        cat "../deployment-outputs-$ENVIRONMENT.json" | jq -r '
            to_entries[] | 
            .value | 
            to_entries[] | 
            "  \(.key): \(.value)"
        ' 2>/dev/null || cat "../deployment-outputs-$ENVIRONMENT.json"
    fi
    
    # Post-deployment tasks
    print_status "Running post-deployment tasks..."
    
    # Get CloudFront distribution ID for cache invalidation
    DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
        --stack-name "SmartCooking-$ENVIRONMENT-Frontend" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    if [[ -n "$DISTRIBUTION_ID" && "$DISTRIBUTION_ID" != "None" ]]; then
        print_status "Invalidating CloudFront cache..."
        INVALIDATION_ID=$(aws cloudfront create-invalidation \
            --distribution-id "$DISTRIBUTION_ID" \
            --paths "/*" \
            --query 'Invalidation.Id' \
            --output text)
        
        print_success "CloudFront cache invalidation created: $INVALIDATION_ID"
    fi
    
    # Display next steps
    print_success "🚀 Deployment completed successfully!"
    print_status "Environment: $ENVIRONMENT"
    print_status "Region: $AWS_REGION"
    print_status "Deployment time: $(date)"
    
    print_status "Next steps:"
    print_status "1. Deploy the frontend: ./scripts/deploy-frontend.sh -e $ENVIRONMENT"
    print_status "2. Seed the database: npm run seed:ingredients"
    print_status "3. Test the application endpoints"
    
    if [[ "$ENVIRONMENT" == "prod" ]]; then
        print_warning "Production deployment notes:"
        print_status "- Update DNS records if using custom domain"
        print_status "- Configure monitoring alerts"
        print_status "- Set up backup procedures"
        print_status "- Review security settings"
    fi
    
else
    print_error "Infrastructure deployment failed!"
    exit 1
fi

# Return to original directory
cd ..

print_status "Infrastructure deployment script completed"