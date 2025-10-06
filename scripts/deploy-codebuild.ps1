# Deploy Next.js to AWS App Runner using CodeBuild
# No Docker installation needed - builds on AWS

param(
    [string]$Region = "ap-southeast-1",
    [string]$ProjectName = "smart-cooking-nextjs-build"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AWS App Runner Deployment (CodeBuild)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get AWS Account ID
$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
$ECR_REPO = "smart-cooking-nextjs"

# Step 1: Create ECR repository
Write-Host "[1/5] Creating ECR repository..." -ForegroundColor Yellow
try {
    aws ecr describe-repositories --repository-names $ECR_REPO --region $Region 2>$null | Out-Null
    Write-Host "✓ ECR repository exists" -ForegroundColor Green
} catch {
    aws ecr create-repository --repository-name $ECR_REPO --region $Region | Out-Null
    Write-Host "✓ ECR repository created" -ForegroundColor Green
}

# Step 2: Create CodeBuild IAM role (if not exists)
Write-Host ""
Write-Host "[2/5] Setting up CodeBuild IAM role..." -ForegroundColor Yellow

$RoleName = "CodeBuildSmartCookingRole"
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
        "Service": "codebuild.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
"@
    $TrustPolicy | Out-File -FilePath "trust-policy.json" -Encoding utf8
    aws iam create-role --role-name $RoleName --assume-role-policy-document file://trust-policy.json | Out-Null
    
    # Attach policies
    aws iam attach-role-policy --role-name $RoleName --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
    aws iam attach-role-policy --role-name $RoleName --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess
    
    Remove-Item trust-policy.json
    Write-Host "✓ IAM role created" -ForegroundColor Green
}

$RoleArn = aws iam get-role --role-name $RoleName --query 'Role.Arn' --output text

# Step 3: Create CodeBuild project
Write-Host ""
Write-Host "[3/5] Creating CodeBuild project..." -ForegroundColor Yellow

$BuildProject = @"
{
  "name": "$ProjectName",
  "source": {
    "type": "GITHUB",
    "location": "https://github.com/nvtruongops/smart-cooking.git",
    "buildspec": "buildspec-docker.yml"
  },
  "artifacts": {
    "type": "NO_ARTIFACTS"
  },
  "environment": {
    "type": "LINUX_CONTAINER",
    "image": "aws/codebuild/standard:7.0",
    "computeType": "BUILD_GENERAL1_MEDIUM",
    "privilegedMode": true,
    "environmentVariables": [
      {
        "name": "AWS_ACCOUNT_ID",
        "value": "$ACCOUNT_ID"
      },
      {
        "name": "AWS_REGION",
        "value": "$Region"
      },
      {
        "name": "IMAGE_REPO_NAME",
        "value": "$ECR_REPO"
      }
    ]
  },
  "serviceRole": "$RoleArn"
}
"@

$BuildProject | Out-File -FilePath "codebuild-project.json" -Encoding utf8

try {
    aws codebuild create-project --cli-input-json file://codebuild-project.json --region $Region | Out-Null
    Write-Host "✓ CodeBuild project created" -ForegroundColor Green
} catch {
    Write-Host "✓ CodeBuild project already exists" -ForegroundColor Green
}

Remove-Item codebuild-project.json

# Step 4: Start build
Write-Host ""
Write-Host "[4/5] Starting CodeBuild..." -ForegroundColor Yellow
Write-Host "This will take 3-5 minutes to build Docker image..." -ForegroundColor Gray

$BuildId = aws codebuild start-build --project-name $ProjectName --region $Region --query 'build.id' --output text

Write-Host "✓ Build started: $BuildId" -ForegroundColor Green

# Step 5: Monitor build
Write-Host ""
Write-Host "[5/5] Monitoring build progress..." -ForegroundColor Yellow
Write-Host "(Press Ctrl+C to stop monitoring - build continues in background)" -ForegroundColor Gray
Write-Host ""

$BuildComplete = $false
while (-not $BuildComplete) {
    Start-Sleep -Seconds 15
    
    $BuildStatus = aws codebuild batch-get-builds --ids $BuildId --region $Region --query 'builds[0].buildStatus' --output text
    $CurrentPhase = aws codebuild batch-get-builds --ids $BuildId --region $Region --query 'builds[0].currentPhase' --output text
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Phase: $CurrentPhase | Status: $BuildStatus" -ForegroundColor Cyan
    
    if ($BuildStatus -eq "SUCCEEDED") {
        $BuildComplete = $true
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  ✓ Docker Image Built Successfully!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Image: ${ACCOUNT_ID}.dkr.ecr.${Region}.amazonaws.com/${ECR_REPO}:latest" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Next step: Create App Runner service" -ForegroundColor Yellow
        Write-Host "Run: .\scripts\create-app-runner-service.ps1" -ForegroundColor White
    } elseif ($BuildStatus -eq "FAILED" -or $BuildStatus -eq "FAULT" -or $BuildStatus -eq "STOPPED" -or $BuildStatus -eq "TIMED_OUT") {
        $BuildComplete = $true
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "  ✗ Build Failed" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "Check logs:" -ForegroundColor Yellow
        Write-Host "  aws codebuild batch-get-builds --ids $BuildId --region $Region" -ForegroundColor White
        exit 1
    }
}
