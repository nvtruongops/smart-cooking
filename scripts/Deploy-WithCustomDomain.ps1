# Smart Cooking MVP - Deploy with Custom Domain (PowerShell)
# Deploys to ap-southeast-1 with custom domain support

param(
    [string]$Environment = "prod",
    [string]$Domain = "smartcooking.com",
    [switch]$NoHostedZone,
    [switch]$SkipBootstrap,
    [switch]$Help
)

# Colors for output
function Write-Info($message) {
    Write-Host "[INFO] $message" -ForegroundColor Blue
}

function Write-Success($message) {
    Write-Host "[SUCCESS] $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "[WARNING] $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
}

# Show help
if ($Help) {
    Write-Host "Usage: .\Deploy-WithCustomDomain.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Deploy Smart Cooking MVP with custom domain to ap-southeast-1"
    Write-Host ""
    Write-Host "OPTIONS:"
    Write-Host "    -Environment ENV     Target environment (dev|prod) [default: prod]"
    Write-Host "    -Domain DOMAIN       Custom domain name [default: smartcooking.com]"
    Write-Host "    -NoHostedZone        Use existing hosted zone (don't create new)"
    Write-Host "    -SkipBootstrap       Skip CDK bootstrap process"
    Write-Host "    -Help               Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "    .\Deploy-WithCustomDomain.ps1 -Domain smartcooking.com"
    Write-Host "    .\Deploy-WithCustomDomain.ps1 -Environment dev -Domain dev.smartcooking.com"
    Write-Host "    .\Deploy-WithCustomDomain.ps1 -Domain myapp.com -NoHostedZone"
    exit 0
}

Write-Info "🚀 Smart Cooking MVP - Custom Domain Deployment"
Write-Info "================================================"

# Set environment variables
$env:AWS_REGION = "ap-southeast-1"
$env:CDK_DEFAULT_REGION = "ap-southeast-1"
$env:BEDROCK_REGION = "ap-southeast-1"
$env:ENVIRONMENT = $Environment
$env:DOMAIN_NAME = $Domain
$env:CREATE_HOSTED_ZONE = if ($NoHostedZone) { "false" } else { "true" }

Write-Info "Environment variables set:"
Write-Host "  AWS_REGION: $env:AWS_REGION"
Write-Host "  CDK_DEFAULT_REGION: $env:CDK_DEFAULT_REGION"
Write-Host "  BEDROCK_REGION: $env:BEDROCK_REGION"
Write-Host "  ENVIRONMENT: $env:ENVIRONMENT"
Write-Host "  DOMAIN_NAME: $env:DOMAIN_NAME"
Write-Host "  CREATE_HOSTED_ZONE: $env:CREATE_HOSTED_ZONE"
Write-Host ""

# Get AWS account ID
Write-Info "Getting AWS account information..."
try {
    $accountId = aws sts get-caller-identity --query Account --output text
    Write-Success "AWS Account ID: $accountId"
} catch {
    Write-Error "Failed to get AWS account ID. Please check your AWS credentials."
    exit 1
}

# Check domain availability warning
if ($env:CREATE_HOSTED_ZONE -eq "true") {
    Write-Info "Checking domain setup..."
    Write-Warning "Make sure you own the domain '$Domain' before proceeding."
    Write-Warning "If you don't own it, the certificate validation will fail."
    Write-Host ""
}

# Check CDK bootstrap status
if (-not $SkipBootstrap) {
    Write-Info "Checking CDK bootstrap status for ap-southeast-1..."
    try {
        aws cloudformation describe-stacks --stack-name CDKToolkit --region ap-southeast-1 2>$null | Out-Null
        Write-Success "CDK already bootstrapped for ap-southeast-1"
    } catch {
        Write-Warning "CDK not bootstrapped for ap-southeast-1. Bootstrapping now..."
        cdk bootstrap "aws://$accountId/ap-southeast-1"
        if ($LASTEXITCODE -eq 0) {
            Write-Success "CDK bootstrapped successfully for ap-southeast-1"
        } else {
            Write-Error "CDK bootstrap failed"
            exit 1
        }
    }
}

# Navigate to CDK directory
if (-not (Test-Path "cdk")) {
    Write-Error "CDK directory not found. Please run this script from the project root."
    exit 1
}

Set-Location cdk

# Install dependencies
Write-Info "Installing CDK dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install CDK dependencies"
    exit 1
}

# Synthesize CDK app
Write-Info "Synthesizing CDK application..."
cdk synth --context environment=$Environment
if ($LASTEXITCODE -ne 0) {
    Write-Error "CDK synthesis failed"
    exit 1
}

# Deploy CDK stacks
Write-Info "Deploying CDK stacks..."
Write-Warning "This will create:"
Write-Host "  - Route 53 hosted zone for $Domain (if CREATE_HOSTED_ZONE=true)"
Write-Host "  - SSL certificate at ap-southeast-1 (auto-replicated to us-east-1)"
Write-Host "  - CloudFront distribution with custom domain"
Write-Host "  - All other Smart Cooking infrastructure"
Write-Host ""

$response = Read-Host "Do you want to continue? (y/N)"
if ($response -notmatch "^[Yy]$") {
    Write-Warning "Deployment cancelled by user"
    exit 0
}

cdk deploy --all --require-approval never --context environment=$Environment
if ($LASTEXITCODE -eq 0) {
    Write-Success "Deployment completed successfully!"
    Write-Host ""
    Write-Info "📋 Post-deployment steps:"
    
    if ($env:CREATE_HOSTED_ZONE -eq "true") {
        Write-Host "1. 🌐 Update your domain registrar's name servers:"
        Write-Host "   - Go to your domain registrar (GoDaddy, Namecheap, etc.)"
        Write-Host "   - Update name servers to the ones shown in the CDK output"
        Write-Host "   - This may take 24-48 hours to propagate"
        Write-Host ""
    }
    
    Write-Host "2. 🔒 Certificate validation:"
    Write-Host "   - Certificate will be validated automatically via DNS"
    Write-Host "   - Check ACM console in ap-southeast-1 for status"
    Write-Host "   - This usually takes 5-10 minutes"
    Write-Host ""
    
    Write-Host "3. 🚀 Access your application:"
    Write-Host "   - https://$Domain"
    Write-Host "   - https://www.$Domain"
    Write-Host ""
    
    Write-Host "4. 📊 Monitor deployment:"
    Write-Host "   - CloudWatch dashboards in ap-southeast-1"
    Write-Host "   - CloudFront distribution status"
    Write-Host "   - Route 53 health checks"
    Write-Host ""
    
    Write-Success "🎉 Smart Cooking MVP deployed with custom domain!"
    Write-Success "🌍 100% ap-southeast-1 architecture with professional domain"
} else {
    Write-Error "Deployment failed"
    exit 1
}

# Return to original directory
Set-Location ..