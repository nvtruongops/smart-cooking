# Smart Cooking Production Deployment Script
# PowerShell script for deploying to AWS ap-southeast-1

param(
    [Parameter(Mandatory=$false)]
    [string]$Profile
)

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Smart Cooking Production Deploy" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Set AWS profile if specified
if ($Profile) {
    Write-Host "Using AWS Profile: $Profile" -ForegroundColor Yellow
    $env:AWS_PROFILE = $Profile
} elseif ($env:AWS_PROFILE) {
    Write-Host "Using AWS Profile: $env:AWS_PROFILE" -ForegroundColor Yellow
} else {
    Write-Host "Using default AWS profile" -ForegroundColor Yellow
}
Write-Host ""

# Set environment variables for ap-southeast-1
Write-Host "Setting environment variables..." -ForegroundColor Yellow
$env:AWS_REGION = "ap-southeast-1"
$env:CDK_DEFAULT_REGION = "ap-southeast-1"
$env:BEDROCK_REGION = "ap-southeast-1"
$env:ENVIRONMENT = "prod"
$env:DOMAIN_NAME = "smartcooking.com"
$env:CREATE_HOSTED_ZONE = "true"
$env:ENABLE_WAF = "true"
$env:ENABLE_ENCRYPTION = "true"
$env:NODE_ENV = "production"

Write-Host "✓ Environment configured for production" -ForegroundColor Green
Write-Host "  Region: $env:AWS_REGION" -ForegroundColor Gray
Write-Host "  Environment: $env:ENVIRONMENT" -ForegroundColor Gray
Write-Host "  Domain: $env:DOMAIN_NAME" -ForegroundColor Gray
Write-Host ""

# Check AWS credentials
Write-Host "Checking AWS credentials..." -ForegroundColor Yellow
$awsIdentity = aws sts get-caller-identity 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ AWS credentials not configured!" -ForegroundColor Red
    Write-Host "  Please run: aws configure" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ AWS credentials verified" -ForegroundColor Green
Write-Host ""

# Navigate to CDK directory
Write-Host "Navigating to CDK directory..." -ForegroundColor Yellow
Set-Location -Path (Join-Path $PSScriptRoot "cdk")
if (-not (Test-Path "package.json")) {
    Write-Host "✗ CDK directory not found!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ CDK directory found" -ForegroundColor Green
Write-Host ""

# Build CDK TypeScript
Write-Host "Building CDK TypeScript code..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ CDK build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ CDK build successful" -ForegroundColor Green
Write-Host ""

# Show deployment diff
Write-Host "Showing deployment changes..." -ForegroundColor Yellow
Write-Host "(Review changes before deployment)" -ForegroundColor Gray
npx cdk diff --context environment=prod
Write-Host ""

# Confirm deployment
$confirmation = Read-Host "Do you want to deploy to PRODUCTION? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "Deployment cancelled." -ForegroundColor Yellow
    exit 0
}

# Deploy infrastructure
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "DEPLOYING TO PRODUCTION..." -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

$deployStart = Get-Date
npx cdk deploy SmartCooking-prod-Simple --context environment=prod --require-approval never

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "✗ Deployment failed!" -ForegroundColor Red
    Write-Host "  Check CloudFormation console for details" -ForegroundColor Yellow
    exit 1
}

$deployEnd = Get-Date
$deployDuration = $deployEnd - $deployStart

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "✓ DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Deployment time: $($deployDuration.Minutes)m $($deployDuration.Seconds)s" -ForegroundColor Gray
Write-Host ""

# Get stack outputs
Write-Host "Fetching stack outputs..." -ForegroundColor Yellow
$outputs = aws cloudformation describe-stacks --stack-name SmartCooking-prod-Simple --query "Stacks[0].Outputs" --output json | ConvertFrom-Json

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Production Endpoints" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

foreach ($output in $outputs) {
    Write-Host "$($output.OutputKey): $($output.OutputValue)" -ForegroundColor White
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Next Steps" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "1. Deploy frontend: npm run deploy:frontend" -ForegroundColor White
Write-Host "2. Run E2E tests: npm test -- tests/e2e/" -ForegroundColor White
Write-Host "3. Check CloudWatch: https://console.aws.amazon.com/cloudwatch" -ForegroundColor White
Write-Host "4. Monitor costs: https://console.aws.amazon.com/billing" -ForegroundColor White
Write-Host ""
Write-Host "✓ Ready for production traffic!" -ForegroundColor Green
Write-Host ""
