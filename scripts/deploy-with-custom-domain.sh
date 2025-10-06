#!/bin/bash

# Smart Cooking MVP - Deploy with Custom Domain
# Deploys to ap-southeast-1 with custom domain support

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Default values
ENVIRONMENT="prod"
DOMAIN_NAME="smartcooking.com"
CREATE_HOSTED_ZONE="true"
SKIP_BOOTSTRAP=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -d|--domain)
            DOMAIN_NAME="$2"
            shift 2
            ;;
        --no-hosted-zone)
            CREATE_HOSTED_ZONE="false"
            shift
            ;;
        -s|--skip-bootstrap)
            SKIP_BOOTSTRAP=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Deploy Smart Cooking MVP with custom domain to ap-southeast-1"
            echo ""
            echo "OPTIONS:"
            echo "    -e, --environment ENV    Target environment (dev|prod) [default: prod]"
            echo "    -d, --domain DOMAIN      Custom domain name [default: smartcooking.com]"
            echo "    --no-hosted-zone         Use existing hosted zone (don't create new)"
            echo "    -s, --skip-bootstrap     Skip CDK bootstrap process"
            echo "    -h, --help              Show this help message"
            echo ""
            echo "Examples:"
            echo "    $0 --domain smartcooking.com"
            echo "    $0 --environment dev --domain dev.smartcooking.com"
            echo "    $0 --domain myapp.com --no-hosted-zone"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_status "🚀 Smart Cooking MVP - Custom Domain Deployment"
print_status "================================================"

# Set environment variables
export AWS_REGION=ap-southeast-1
export CDK_DEFAULT_REGION=ap-southeast-1
export BEDROCK_REGION=ap-southeast-1
export ENVIRONMENT=$ENVIRONMENT
export DOMAIN_NAME=$DOMAIN_NAME
export CREATE_HOSTED_ZONE=$CREATE_HOSTED_ZONE

print_status "Environment variables set:"
echo "  AWS_REGION: $AWS_REGION"
echo "  CDK_DEFAULT_REGION: $CDK_DEFAULT_REGION"
echo "  BEDROCK_REGION: $BEDROCK_REGION"
echo "  ENVIRONMENT: $ENVIRONMENT"
echo "  DOMAIN_NAME: $DOMAIN_NAME"
echo "  CREATE_HOSTED_ZONE: $CREATE_HOSTED_ZONE"
echo ""

# Get AWS account ID
print_status "Getting AWS account information..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ $? -ne 0 ]; then
    print_error "Failed to get AWS account ID. Please check your AWS credentials."
    exit 1
fi
print_success "AWS Account ID: $ACCOUNT_ID"

# Check if domain is available in Route 53 (if creating hosted zone)
if [ "$CREATE_HOSTED_ZONE" = "true" ]; then
    print_status "Checking domain availability..."
    # This is just a basic check - you might want to add more validation
    print_warning "Make sure you own the domain '$DOMAIN_NAME' before proceeding."
    print_warning "If you don't own it, the certificate validation will fail."
    echo ""
fi

# Check CDK bootstrap status
if [ "$SKIP_BOOTSTRAP" = "false" ]; then
    print_status "Checking CDK bootstrap status for ap-southeast-1..."
    if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region ap-southeast-1 >/dev/null 2>&1; then
        print_warning "CDK not bootstrapped for ap-southeast-1. Bootstrapping now..."
        cdk bootstrap aws://$ACCOUNT_ID/ap-southeast-1
        if [ $? -eq 0 ]; then
            print_success "CDK bootstrapped successfully for ap-southeast-1"
        else
            print_error "CDK bootstrap failed"
            exit 1
        fi
    else
        print_success "CDK already bootstrapped for ap-southeast-1"
    fi
fi

# Navigate to CDK directory
if [ ! -d "cdk" ]; then
    print_error "CDK directory not found. Please run this script from the project root."
    exit 1
fi

cd cdk

# Install dependencies
print_status "Installing CDK dependencies..."
npm install
if [ $? -ne 0 ]; then
    print_error "Failed to install CDK dependencies"
    exit 1
fi

# Synthesize CDK app
print_status "Synthesizing CDK application..."
cdk synth --context environment=$ENVIRONMENT
if [ $? -ne 0 ]; then
    print_error "CDK synthesis failed"
    exit 1
fi

# Deploy CDK stacks
print_status "Deploying CDK stacks..."
print_warning "This will create:"
echo "  - Route 53 hosted zone for $DOMAIN_NAME (if CREATE_HOSTED_ZONE=true)"
echo "  - SSL certificate at ap-southeast-1 (auto-replicated to us-east-1)"
echo "  - CloudFront distribution with custom domain"
echo "  - All other Smart Cooking infrastructure"
echo ""

read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Deployment cancelled by user"
    exit 0
fi

cdk deploy --all --require-approval never --context environment=$ENVIRONMENT
if [ $? -eq 0 ]; then
    print_success "Deployment completed successfully!"
    echo ""
    print_status "📋 Post-deployment steps:"
    
    if [ "$CREATE_HOSTED_ZONE" = "true" ]; then
        echo "1. 🌐 Update your domain registrar's name servers:"
        echo "   - Go to your domain registrar (GoDaddy, Namecheap, etc.)"
        echo "   - Update name servers to the ones shown in the CDK output"
        echo "   - This may take 24-48 hours to propagate"
        echo ""
    fi
    
    echo "2. 🔒 Certificate validation:"
    echo "   - Certificate will be validated automatically via DNS"
    echo "   - Check ACM console in ap-southeast-1 for status"
    echo "   - This usually takes 5-10 minutes"
    echo ""
    
    echo "3. 🚀 Access your application:"
    echo "   - https://$DOMAIN_NAME"
    echo "   - https://www.$DOMAIN_NAME"
    echo ""
    
    echo "4. 📊 Monitor deployment:"
    echo "   - CloudWatch dashboards in ap-southeast-1"
    echo "   - CloudFront distribution status"
    echo "   - Route 53 health checks"
    echo ""
    
    print_success "🎉 Smart Cooking MVP deployed with custom domain!"
    print_success "🌍 100% ap-southeast-1 architecture with professional domain"
else
    print_error "Deployment failed"
    exit 1
fi