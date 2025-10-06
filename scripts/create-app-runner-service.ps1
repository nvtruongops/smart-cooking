# Create AWS App Runner Service
# Run after Docker image is pushed to ECR

param(
    [string]$Region = "ap-southeast-1",
    [string]$ServiceName = "smart-cooking-frontend",
    [string]$ECRRepoName = "smart-cooking-nextjs"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Create App Runner Service" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get AWS Account ID and ECR URI
$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
$ECR_URI = "${ACCOUNT_ID}.dkr.ecr.${Region}.amazonaws.com/${ECRRepoName}:latest"

Write-Host "ECR Image: $ECR_URI" -ForegroundColor Cyan
Write-Host ""

# Check if service already exists
Write-Host "[1/3] Checking existing services..." -ForegroundColor Yellow
$ExistingService = aws apprunner list-services --region $Region --query "ServiceSummaryList[?ServiceName=='$ServiceName'].ServiceArn" --output text

if ($ExistingService) {
    Write-Host "⚠ Service '$ServiceName' already exists!" -ForegroundColor Yellow
    Write-Host "Service ARN: $ExistingService" -ForegroundColor Gray
    Write-Host ""
    
    $choice = Read-Host "Do you want to update it? (y/N)"
    if ($choice -ne 'y' -and $choice -ne 'Y') {
        Write-Host "Deployment cancelled." -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host ""
    Write-Host "[2/3] Updating service..." -ForegroundColor Yellow
    
    # Update service
    aws apprunner update-service `
        --service-arn $ExistingService `
        --source-configuration "ImageRepository={ImageIdentifier=$ECR_URI,ImageConfiguration={Port=3000,RuntimeEnvironmentVariables={NEXT_PUBLIC_API_URL=https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/,NEXT_PUBLIC_USER_POOL_ID=ap-southeast-1_Vnu4kcJin,NEXT_PUBLIC_USER_POOL_CLIENT_ID=7h6n8dal12qpuh3242kg4gg4t3,NEXT_PUBLIC_AWS_REGION=ap-southeast-1,NEXT_PUBLIC_ENVIRONMENT=production,NODE_ENV=production}},ImageRepositoryType=ECR}" `
        --region $Region
    
    Write-Host "✓ Service update initiated" -ForegroundColor Green
    $ServiceArn = $ExistingService
} else {
    Write-Host "✓ No existing service found. Creating new..." -ForegroundColor Green
    Write-Host ""
    
    # Create IAM role for App Runner
    Write-Host "[2/3] Creating IAM role..." -ForegroundColor Yellow
    
    $RoleName = "AppRunnerECRAccessRole"
    try {
        aws iam get-role --role-name $RoleName 2>$null | Out-Null
        Write-Host "✓ IAM role exists" -ForegroundColor Green
    } catch {
        $TrustPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "build.apprunner.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
"@
        $TrustPolicy | Out-File -FilePath "apprunner-trust.json" -Encoding utf8
        aws iam create-role --role-name $RoleName --assume-role-policy-document file://apprunner-trust.json | Out-Null
        aws iam attach-role-policy --role-name $RoleName --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
        Remove-Item apprunner-trust.json
        
        Write-Host "✓ IAM role created" -ForegroundColor Green
        Write-Host "⏳ Waiting 10 seconds for IAM propagation..." -ForegroundColor Gray
        Start-Sleep -Seconds 10
    }
    
    $RoleArn = aws iam get-role --role-name $RoleName --query 'Role.Arn' --output text
    
    Write-Host ""
    Write-Host "[3/3] Creating App Runner service..." -ForegroundColor Yellow
    Write-Host "This takes 3-5 minutes..." -ForegroundColor Gray
    
    # Create service
    $ServiceArn = aws apprunner create-service `
        --service-name $ServiceName `
        --source-configuration "ImageRepository={ImageIdentifier=$ECR_URI,ImageConfiguration={Port=3000,RuntimeEnvironmentVariables={NEXT_PUBLIC_API_URL=https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/,NEXT_PUBLIC_USER_POOL_ID=ap-southeast-1_Vnu4kcJin,NEXT_PUBLIC_USER_POOL_CLIENT_ID=7h6n8dal12qpuh3242kg4gg4t3,NEXT_PUBLIC_AWS_REGION=ap-southeast-1,NEXT_PUBLIC_ENVIRONMENT=production,NODE_ENV=production}},ImageRepositoryType=ECR,AuthenticationConfiguration={AccessRoleArn=$RoleArn}}" `
        --instance-configuration "Cpu=1024,Memory=2048" `
        --health-check-configuration "Protocol=HTTP,Path=/,Interval=10,Timeout=5,HealthyThreshold=1,UnhealthyThreshold=5" `
        --region $Region `
        --query 'Service.ServiceArn' `
        --output text
    
    Write-Host "✓ Service creation initiated" -ForegroundColor Green
}

Write-Host ""
Write-Host "Service ARN: $ServiceArn" -ForegroundColor Cyan
Write-Host ""

# Monitor service status
Write-Host "Monitoring service status..." -ForegroundColor Yellow
Write-Host "(Press Ctrl+C to stop monitoring - service continues provisioning)" -ForegroundColor Gray
Write-Host ""

$ServiceReady = $false
$StartTime = Get-Date

while (-not $ServiceReady) {
    Start-Sleep -Seconds 15
    
    $ServiceStatus = aws apprunner describe-service --service-arn $ServiceArn --region $Region --query 'Service.Status' --output text
    $ElapsedMinutes = [math]::Round(((Get-Date) - $StartTime).TotalMinutes, 1)
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Status: $ServiceStatus (${ElapsedMinutes}m elapsed)" -ForegroundColor Cyan
    
    if ($ServiceStatus -eq "RUNNING") {
        $ServiceReady = $true
        $ServiceUrl = aws apprunner describe-service --service-arn $ServiceArn --region $Region --query 'Service.ServiceUrl' --output text
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  ✓ Service is RUNNING!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "🌐 Your app is live at:" -ForegroundColor Cyan
        Write-Host "   https://$ServiceUrl" -ForegroundColor White
        Write-Host ""
        Write-Host "Total provisioning time: ${ElapsedMinutes} minutes" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "1. Test your app in browser" -ForegroundColor White
        Write-Host "2. Run E2E tests" -ForegroundColor White
        Write-Host "3. Monitor CloudWatch logs" -ForegroundColor White
        Write-Host ""
        
        # Open in browser
        Start-Process "https://$ServiceUrl"
        
    } elseif ($ServiceStatus -eq "CREATE_FAILED" -or $ServiceStatus -eq "OPERATION_IN_PROGRESS") {
        if ($ElapsedMinutes -gt 10) {
            Write-Host ""
            Write-Host "⚠ Service taking longer than expected" -ForegroundColor Yellow
            Write-Host "Check AWS Console for details:" -ForegroundColor Gray
            Write-Host "https://console.aws.amazon.com/apprunner/home?region=$Region#/services/$ServiceArn" -ForegroundColor White
        }
    }
}
