# Smart Cooking Frontend Deployment Script (PowerShell)
# This script builds and deploys the Next.js frontend to S3 and invalidates CloudFront cache

param(
    [string]$Environment = "dev",
    [string]$Region = "us-east-1",
    [switch]$SkipBuild,
    [switch]$SkipTests,
    [switch]$DryRun,
    [switch]$Help
)

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Function to show usage
function Show-Usage {
    @"
Usage: .\deploy-frontend.ps1 [OPTIONS]

Deploy Smart Cooking frontend to AWS S3 and CloudFront

OPTIONS:
    -Environment ENV     Target environment (dev|prod) [default: dev]
    -Region REGION       AWS region [default: us-east-1]
    -SkipBuild          Skip the build process
    -SkipTests          Skip running tests
    -DryRun             Show what would be deployed without actually deploying
    -Help               Show this help message

EXAMPLES:
    .\deploy-frontend.ps1                                    # Deploy to dev environment
    .\deploy-frontend.ps1 -Environment prod                  # Deploy to production
    .\deploy-frontend.ps1 -Environment dev -SkipTests       # Deploy to dev without running tests
    .\deploy-frontend.ps1 -Environment prod -DryRun         # Show what would be deployed to prod

PREREQUISITES:
    - AWS CLI configured with appropriate credentials
    - Node.js and npm installed
    - CDK infrastructure already deployed
    - Frontend directory exists with package.json
"@
}

# Show help if requested
if ($Help) {
    Show-Usage
    exit 0
}

# Validate environment
if ($Environment -notin @("dev", "prod")) {
    Write-Error "Environment must be 'dev' or 'prod'"
    exit 1
}

# Check prerequisites
Write-Status "Checking prerequisites..."

# Check if AWS CLI is installed
try {
    aws --version | Out-Null
} catch {
    Write-Error "AWS CLI is not installed. Please install it first."
    exit 1
}

# Check AWS credentials
try {
    aws sts get-caller-identity | Out-Null
} catch {
    Write-Error "AWS credentials not configured or invalid"
    exit 1
}

# Check if Node.js is installed
try {
    node --version | Out-Null
} catch {
    Write-Error "Node.js is not installed. Please install it first."
    exit 1
}

# Check if frontend directory exists
if (-not (Test-Path "frontend")) {
    Write-Error "Frontend directory not found. Please run this script from the project root."
    exit 1
}

# Check if package.json exists
if (-not (Test-Path "frontend/package.json")) {
    Write-Error "Frontend package.json not found"
    exit 1
}

Write-Success "Prerequisites check passed"

# Function to get CloudFormation stack output
function Get-StackOutput {
    param(
        [string]$StackName,
        [string]$OutputKey
    )
    
    try {
        $output = aws cloudformation describe-stacks `
            --stack-name $StackName `
            --region $Region `
            --query "Stacks[0].Outputs[?OutputKey=='$OutputKey'].OutputValue" `
            --output text 2>$null
        
        if ($LASTEXITCODE -eq 0 -and $output -ne "None") {
            return $output
        }
        return ""
    } catch {
        return ""
    }
}

# Get infrastructure outputs from CloudFormation
Write-Status "Getting infrastructure information..."

$BucketName = Get-StackOutput "SmartCooking-$Environment-Frontend" "WebsiteBucketName"
$DistributionId = Get-StackOutput "SmartCooking-$Environment-Frontend" "DistributionId"
$ApiUrl = Get-StackOutput "SmartCooking-$Environment-Api" "ApiUrl"
$UserPoolId = Get-StackOutput "SmartCooking-$Environment-Auth" "UserPoolId"
$UserPoolClientId = Get-StackOutput "SmartCooking-$Environment-Auth" "UserPoolClientId"
$WebsiteUrl = Get-StackOutput "SmartCooking-$Environment-Frontend" "WebsiteUrl"

# Validate that we got the required outputs
if ([string]::IsNullOrEmpty($BucketName) -or [string]::IsNullOrEmpty($DistributionId)) {
    Write-Error "Could not retrieve infrastructure information. Make sure CDK stacks are deployed."
    Write-Error "Missing: Bucket Name: '$BucketName', Distribution ID: '$DistributionId'"
    exit 1
}

Write-Success "Infrastructure information retrieved"
Write-Status "S3 Bucket: $BucketName"
Write-Status "CloudFront Distribution: $DistributionId"
Write-Status "Website URL: $WebsiteUrl"

if ($DryRun) {
    Write-Warning "DRY RUN MODE - No actual deployment will occur"
    Write-Status "Would deploy to:"
    Write-Status "  Environment: $Environment"
    Write-Status "  S3 Bucket: $BucketName"
    Write-Status "  CloudFront Distribution: $DistributionId"
    Write-Status "  API URL: $ApiUrl"
    exit 0
}

# Change to frontend directory
Set-Location frontend

# Install dependencies
Write-Status "Installing frontend dependencies..."
npm ci
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install dependencies"
    exit 1
}

# Run tests (unless skipped)
if (-not $SkipTests) {
    Write-Status "Running tests..."
    npm test -- --run --coverage
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Tests failed. Use -SkipTests to bypass."
        exit 1
    }
    Write-Success "Tests passed"
}

# Create environment configuration
Write-Status "Creating environment configuration..."
$envContent = @"
NEXT_PUBLIC_API_URL=$ApiUrl
NEXT_PUBLIC_USER_POOL_ID=$UserPoolId
NEXT_PUBLIC_USER_POOL_CLIENT_ID=$UserPoolClientId
NEXT_PUBLIC_ENVIRONMENT=$Environment
NEXT_PUBLIC_REGION=$Region
NEXT_PUBLIC_S3_BUCKET=$BucketName
"@

$envContent | Out-File -FilePath ".env.local" -Encoding UTF8
Write-Success "Environment configuration created"

# Build the application (unless skipped)
if (-not $SkipBuild) {
    Write-Status "Building frontend application..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed"
        exit 1
    }
    
    npm run export
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Export failed"
        exit 1
    }
    
    Write-Success "Build completed"
} else {
    Write-Warning "Skipping build process"
    if (-not (Test-Path "out")) {
        Write-Error "No build output found and build was skipped. Run without -SkipBuild first."
        exit 1
    }
}

# Deploy to S3
Write-Status "Deploying to S3..."

# Sync static assets with long cache
Write-Status "Uploading static assets with long cache..."
aws s3 sync out/ "s3://$BucketName/" `
    --region $Region `
    --delete `
    --cache-control "public, max-age=31536000" `
    --exclude "*.html" `
    --exclude "*.json" `
    --exclude "service-worker.js" `
    --exclude "sitemap.xml" `
    --exclude "robots.txt"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to upload static assets"
    exit 1
}

# Sync HTML and dynamic files with short cache
Write-Status "Uploading HTML and dynamic files with short cache..."
aws s3 sync out/ "s3://$BucketName/" `
    --region $Region `
    --cache-control "public, max-age=3600" `
    --include "*.html" `
    --include "*.json" `
    --include "service-worker.js" `
    --include "sitemap.xml" `
    --include "robots.txt"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to upload HTML files"
    exit 1
}

Write-Success "Files uploaded to S3"

# Invalidate CloudFront cache
Write-Status "Invalidating CloudFront cache..."
$invalidationOutput = aws cloudfront create-invalidation `
    --distribution-id $DistributionId `
    --paths "/*" `
    --query 'Invalidation.Id' `
    --output text

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create CloudFront invalidation"
    exit 1
}

$InvalidationId = $invalidationOutput
Write-Success "CloudFront invalidation created: $InvalidationId"

# Wait for invalidation to complete
Write-Status "Waiting for cache invalidation to complete..."
aws cloudfront wait invalidation-completed `
    --distribution-id $DistributionId `
    --id $InvalidationId

if ($LASTEXITCODE -eq 0) {
    Write-Success "Cache invalidation completed"
} else {
    Write-Warning "Cache invalidation may still be in progress"
}

# Verify deployment
Write-Status "Verifying deployment..."
if (-not [string]::IsNullOrEmpty($WebsiteUrl)) {
    try {
        $response = Invoke-WebRequest -Uri $WebsiteUrl -Method Head -TimeoutSec 30
        if ($response.StatusCode -eq 200) {
            Write-Success "Website is responding correctly (HTTP $($response.StatusCode))"
        } else {
            Write-Warning "Website health check returned HTTP $($response.StatusCode)"
        }
    } catch {
        Write-Warning "Website health check failed: $($_.Exception.Message)"
    }
} else {
    Write-Warning "Website URL not available for verification"
}

# Final success message
Write-Success "🚀 Frontend deployment completed successfully!"
Write-Status "Environment: $Environment"
Write-Status "Website URL: $WebsiteUrl"
Write-Status "Deployment time: $(Get-Date)"

# Clean up
if (Test-Path ".env.local") {
    Remove-Item ".env.local"
}

# Return to original directory
Set-Location ..

Write-Status "Deployment script completed"