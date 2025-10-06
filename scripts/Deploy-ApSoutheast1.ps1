# Smart Cooking MVP - Deploy to ap-southeast-1 (Singapore)
# PowerShell script for Windows deployment

param(
    [switch]$SkipTests,
    [switch]$Force,
    [string]$Environment = "prod"
)

# Color functions for output
function Write-Info($message) {
    Write-Host "[INFO] $message" -ForegroundColor Blue
}

function Write-Warning($message) {
    Write-Host "[WARNING] $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
}

function Write-Success($message) {
    Write-Host "[SUCCESS] $message" -ForegroundColor Green
}

Write-Host "🚀 Smart Cooking MVP - Deploying to ap-southeast-1" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Check prerequisites
Write-Info "Checking prerequisites..."

# Check AWS CLI
try {
    $awsVersion = aws --version 2>$null
    Write-Success "AWS CLI found: $awsVersion"
} catch {
    Write-Error "AWS CLI is not installed. Please install it first."
    exit 1
}

# Check CDK CLI
try {
    $cdkVersion = cdk --version 2>$null
    Write-Success "AWS CDK found: $cdkVersion"
} catch {
    Write-Error "AWS CDK CLI is not installed. Please install it first."
    exit 1
}

# Check Node.js
try {
    $nodeVersion = node --version 2>$null
    Write-Success "Node.js found: $nodeVersion"
} catch {
    Write-Error "Node.js is not installed. Please install it first."
    exit 1
}

# Check AWS credentials
try {
    $identity = aws sts get-caller-identity 2>$null | ConvertFrom-Json
    Write-Success "AWS credentials configured for account: $($identity.Account)"
} catch {
    Write-Error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
}

# Set environment variables for ap-southeast-1 deployment
Write-Info "Setting environment variables for ap-southeast-1..."

$env:AWS_REGION = "ap-southeast-1"
$env:CDK_DEFAULT_REGION = "ap-southeast-1"
$env:BEDROCK_REGION = "ap-southeast-1"  # Bedrock now available locally!
# Certificate region not needed - using default CloudFront domain
$env:ENVIRONMENT = $Environment

Write-Info "Environment variables set:"
Write-Host "  AWS_REGION: $env:AWS_REGION"
Write-Host "  CDK_DEFAULT_REGION: $env:CDK_DEFAULT_REGION"
Write-Host "  BEDROCK_REGION: $env:BEDROCK_REGION"
# Certificate region not needed for default CloudFront domain

# Get AWS account ID
$accountId = $identity.Account
Write-Info "AWS Account ID: $accountId"

# Check if Bedrock is accessible from ap-southeast-1
Write-Info "Testing Bedrock accessibility..."
try {
    aws bedrock list-foundation-models --region ap-southeast-1 --output json 2>$null | Out-Null
    Write-Success "Bedrock is accessible from ap-southeast-1 (local)"
} catch {
    Write-Warning "Bedrock access test failed. Please ensure you have Bedrock permissions."
}

# Bootstrap CDK for ap-southeast-1 if needed
Write-Info "Checking CDK bootstrap status for ap-southeast-1..."
try {
    aws cloudformation describe-stacks --stack-name CDKToolkit --region ap-southeast-1 2>$null | Out-Null
    Write-Success "CDK already bootstrapped for ap-southeast-1"
} catch {
    Write-Info "Bootstrapping CDK for ap-southeast-1..."
    cdk bootstrap "aws://$accountId/ap-southeast-1"
    if ($LASTEXITCODE -eq 0) {
        Write-Success "CDK bootstrap completed"
    } else {
        Write-Error "CDK bootstrap failed"
        exit 1
    }
}

# Check if we need to bootstrap us-east-1 for cross-region resources
Write-Info "Checking CDK bootstrap status for us-east-1 (for cross-region resources)..."
try {
    aws cloudformation describe-stacks --stack-name CDKToolkit --region us-east-1 2>$null | Out-Null
    Write-Success "CDK already bootstrapped for us-east-1"
} catch {
    Write-Warning "CDK not bootstrapped for us-east-1. Some cross-region features may not work."
    if (-not $Force) {
        $response = Read-Host "Do you want to bootstrap us-east-1? (y/n)"
        if ($response -eq 'y' -or $response -eq 'Y') {
            cdk bootstrap "aws://$accountId/us-east-1"
            if ($LASTEXITCODE -eq 0) {
                Write-Success "CDK bootstrap completed for us-east-1"
            }
        }
    }
}

# Build Lambda functions
Write-Info "Building Lambda functions..."
Push-Location lambda

$lambdaDirs = @("auth-handler", "user-profile", "ingredient-validator", "ai-suggestion", "cooking-session", "recipe", "rating", "monitoring")

foreach ($dir in $lambdaDirs) {
    if (Test-Path $dir) {
        Write-Info "Building $dir..."
        Push-Location $dir
        if (Test-Path "package.json") {
            npm install --production --silent
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "npm install failed for $dir, continuing..."
            }
        }
        Pop-Location
    }
}

Pop-Location

# Synthesize CDK
Write-Info "Synthesizing CDK templates..."
Push-Location cdk
npm install --silent
cdk synth --all --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Error "CDK synthesis failed"
    Pop-Location
    exit 1
}

# Deploy infrastructure
Write-Info "Deploying infrastructure to ap-southeast-1..."
Write-Warning "This deployment will use cross-region calls to Bedrock in us-east-1"
Write-Warning "Expected additional latency: 180-250ms for AI operations"

if (-not $Force) {
    $response = Read-Host "Do you want to proceed with deployment? (y/n)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Info "Deployment cancelled by user"
        Pop-Location
        exit 0
    }
}

# Deploy with environment context
Write-Info "Starting CDK deployment..."
cdk deploy --all --context environment=$Environment --require-approval never

if ($LASTEXITCODE -ne 0) {
    Write-Error "CDK deployment failed"
    Pop-Location
    exit 1
}

Pop-Location

Write-Success "Deployment completed!"

# Get outputs
Write-Info "Retrieving deployment outputs..."

try {
    $apiUrl = aws cloudformation describe-stacks --stack-name "SmartCooking-$Environment" --region ap-southeast-1 --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text 2>$null
    $websiteUrl = aws cloudformation describe-stacks --stack-name "SmartCooking-$Environment" --region ap-southeast-1 --query 'Stacks[0].Outputs[?OutputKey==`WebsiteUrl`].OutputValue' --output text 2>$null
    $userPoolId = aws cloudformation describe-stacks --stack-name "SmartCooking-$Environment" --region ap-southeast-1 --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text 2>$null
    $tableName = aws cloudformation describe-stacks --stack-name "SmartCooking-$Environment" --region ap-southeast-1 --query 'Stacks[0].Outputs[?OutputKey==`DynamoDBTableName`].OutputValue' --output text 2>$null
} catch {
    Write-Warning "Could not retrieve all stack outputs"
    $apiUrl = "Not found"
    $websiteUrl = "Not found"
    $userPoolId = "Not found"
    $tableName = "Not found"
}

Write-Host ""
Write-Host "🎉 Deployment Summary" -ForegroundColor Green
Write-Host "====================" -ForegroundColor Green
Write-Host "Region: ap-southeast-1 (Singapore)"
Write-Host "Environment: $Environment"
Write-Host "API URL: $apiUrl"
Write-Host "Website URL: $websiteUrl"
Write-Host "User Pool ID: $userPoolId"
Write-Host "DynamoDB Table: $tableName"
Write-Host ""

# Performance testing
if (-not $SkipTests) {
    Write-Info "Running basic connectivity tests..."

    # Test API Gateway
    if ($apiUrl -ne "Not found" -and $apiUrl -ne "") {
        Write-Info "Testing API Gateway connectivity..."
        try {
            $response = Invoke-WebRequest -Uri "$apiUrl/health" -Method GET -TimeoutSec 10 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 404) {
                Write-Success "API Gateway is accessible"
            } else {
                Write-Warning "API Gateway returned status: $($response.StatusCode)"
            }
        } catch {
            Write-Warning "API Gateway connectivity test failed: $($_.Exception.Message)"
        }
    }

    # Test DynamoDB
    if ($tableName -ne "Not found" -and $tableName -ne "") {
        Write-Info "Testing DynamoDB connectivity..."
        try {
            aws dynamodb describe-table --table-name $tableName --region ap-southeast-1 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Success "DynamoDB table is accessible"
            } else {
                Write-Warning "DynamoDB connectivity test failed"
            }
        } catch {
            Write-Warning "DynamoDB connectivity test failed"
        }
    }
}

# Performance recommendations
Write-Host ""
Write-Info "Performance Recommendations for ap-southeast-1:"
Write-Host "• AI operations will have additional 180-250ms latency due to cross-region Bedrock calls"
Write-Host "• Consider implementing caching for frequent AI requests"
Write-Host "• Monitor CloudWatch metrics for cross-region performance"
Write-Host "• Set appropriate timeout values for Lambda functions"

# Cost considerations
Write-Host ""
Write-Info "Cost Considerations:"
Write-Host "• Cross-region data transfer: ~`$0.02/GB for Bedrock calls"
Write-Host "• Typical AI request: 1-2KB → negligible additional cost"
Write-Host "• Estimated monthly impact: <`$1 for 10,000 requests"

# Next steps
Write-Host ""
Write-Info "Next Steps:"
Write-Host "1. Update your application configuration with the new endpoints"
Write-Host "2. Run E2E tests: cd tests/e2e && `$env:TEST_ENV='prod'; npm test"
Write-Host "3. Monitor CloudWatch dashboards for performance metrics"
Write-Host "4. Set up DNS records if using custom domain"

# Save configuration
$configFile = "config/deployed-ap-southeast-1.json"
$config = @{
    region = "ap-southeast-1"
    environment = $Environment
    deployedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    apiUrl = $apiUrl
    websiteUrl = $websiteUrl
    userPoolId = $userPoolId
    tableName = $tableName
    bedrockRegion = "us-east-1"
} | ConvertTo-Json -Depth 3

New-Item -Path "config" -ItemType Directory -Force | Out-Null
$config | Out-File -FilePath $configFile -Encoding UTF8

Write-Success "Configuration saved to $configFile"
Write-Success "Deployment to ap-southeast-1 completed successfully!"