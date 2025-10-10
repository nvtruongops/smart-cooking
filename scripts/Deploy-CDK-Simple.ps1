# Simple CDK Deployment Script

Write-Host "Deploying CDK Stack - Smart Cooking" -ForegroundColor Cyan

$rootPath = "C:\Users\nvtru\Documents\smart-cooking"
Set-Location $rootPath

# Check AWS credentials
try {
    $awsIdentity = aws sts get-caller-identity --output json | ConvertFrom-Json
    Write-Host "AWS Identity: $($awsIdentity.Arn)" -ForegroundColor Green
} catch {
    Write-Host "AWS CLI not configured" -ForegroundColor Red
    exit 1
}

# Navigate to CDK directory
Set-Location "$rootPath\cdk"

# Install dependencies
Write-Host "Installing CDK dependencies..." -ForegroundColor Green
npm install

# Build CDK
Write-Host "Building CDK..." -ForegroundColor Green
npm run build

# Deploy CDK Stack
Write-Host "Deploying CDK Stack..." -ForegroundColor Green
$stackName = "SmartCooking-dev-Simple"

try {
    cdk deploy $stackName -c env=dev --require-approval never --outputs-file outputs.json
    Write-Host "CDK deployment successful!" -ForegroundColor Green
} catch {
    Write-Host "CDK deployment failed" -ForegroundColor Red
    exit 1
}

# Show outputs
if (Test-Path "outputs.json") {
    $outputs = Get-Content "outputs.json" | ConvertFrom-Json
    $stackOutputs = $outputs.$stackName
    
    Write-Host "Stack Outputs:" -ForegroundColor Green
    if ($stackOutputs.ApiEndpoint) {
        Write-Host "API Endpoint: $($stackOutputs.ApiEndpoint)" -ForegroundColor Cyan
    }
    if ($stackOutputs.UserPoolId) {
        Write-Host "User Pool ID: $($stackOutputs.UserPoolId)" -ForegroundColor Cyan
    }
    if ($stackOutputs.UserPoolClientId) {
        Write-Host "Client ID: $($stackOutputs.UserPoolClientId)" -ForegroundColor Cyan
    }
}

Write-Host "Deployment completed successfully!" -ForegroundColor Green