# Deploy Next.js to AWS App Runner
# Requires: AWS CLI configured with ap-southeast-1 region

param(
    [string]$Region = "ap-southeast-1",
    [string]$ServiceName = "smart-cooking-frontend",
    [string]$ECRRepoName = "smart-cooking-nextjs"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AWS App Runner Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create ECR repository (if not exists)
Write-Host "[1/6] Creating ECR repository..." -ForegroundColor Yellow
try {
    aws ecr describe-repositories --repository-names $ECRRepoName --region $Region 2>$null
    Write-Host "✓ Repository exists" -ForegroundColor Green
} catch {
    Write-Host "Creating new repository..." -ForegroundColor Yellow
    aws ecr create-repository --repository-name $ECRRepoName --region $Region
    Write-Host "✓ Repository created" -ForegroundColor Green
}

# Get ECR URI
$ECR_URI = aws ecr describe-repositories --repository-names $ECRRepoName --region $Region --query 'repositories[0].repositoryUri' --output text
$ACCOUNT_ID = aws sts get-caller-identity --query Account --output text

Write-Host ""
Write-Host "[2/6] ECR Repository: $ECR_URI" -ForegroundColor Cyan
Write-Host ""

# Step 2: Login to ECR
Write-Host "[3/6] Logging in to ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$Region.amazonaws.com"
Write-Host "✓ Logged in to ECR" -ForegroundColor Green

# Step 3: Build Docker image
Write-Host ""
Write-Host "[4/6] Building Docker image..." -ForegroundColor Yellow
Write-Host "This may take 3-5 minutes..." -ForegroundColor Gray
Set-Location frontend
docker build -t $ECRRepoName .
docker tag ${ECRRepoName}:latest ${ECR_URI}:latest
Set-Location ..
Write-Host "✓ Docker image built" -ForegroundColor Green

# Step 4: Push to ECR
Write-Host ""
Write-Host "[5/6] Pushing image to ECR..." -ForegroundColor Yellow
docker push ${ECR_URI}:latest
Write-Host "✓ Image pushed to ECR" -ForegroundColor Green

# Step 5: Create/Update App Runner service
Write-Host ""
Write-Host "[6/6] Creating App Runner service..." -ForegroundColor Yellow

# Create apprunner.yaml for service configuration
$AppRunnerConfig = @"
{
  "ServiceName": "$ServiceName",
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "${ECR_URI}:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "NEXT_PUBLIC_API_URL": "https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/",
          "NEXT_PUBLIC_USER_POOL_ID": "ap-southeast-1_Vnu4kcJin",
          "NEXT_PUBLIC_USER_POOL_CLIENT_ID": "7h6n8dal12qpuh3242kg4gg4t3",
          "NEXT_PUBLIC_AWS_REGION": "ap-southeast-1",
          "NEXT_PUBLIC_ENVIRONMENT": "production",
          "NODE_ENV": "production"
        }
      }
    },
    "AutoDeploymentsEnabled": false
  },
  "InstanceConfiguration": {
    "Cpu": "1 vCPU",
    "Memory": "2 GB"
  },
  "HealthCheckConfiguration": {
    "Protocol": "HTTP",
    "Path": "/",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 5
  }
}
"@

$AppRunnerConfig | Out-File -FilePath "apprunner-config.json" -Encoding utf8

# Check if service exists
try {
    $ServiceArn = aws apprunner list-services --region $Region --query "ServiceSummaryList[?ServiceName=='$ServiceName'].ServiceArn" --output text
    
    if ($ServiceArn) {
        Write-Host "Service exists. Updating..." -ForegroundColor Yellow
        aws apprunner update-service --service-arn $ServiceArn --source-configuration file://apprunner-config.json --region $Region
    } else {
        throw "Service not found"
    }
} catch {
    Write-Host "Creating new service..." -ForegroundColor Yellow
    aws apprunner create-service --cli-input-json file://apprunner-config.json --region $Region
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✓ Deployment Initiated!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "App Runner is provisioning your service..." -ForegroundColor Cyan
Write-Host "This takes 3-5 minutes." -ForegroundColor Gray
Write-Host ""
Write-Host "Check status:" -ForegroundColor Yellow
Write-Host "  aws apprunner list-services --region $Region" -ForegroundColor White
Write-Host ""
Write-Host "Get service URL:" -ForegroundColor Yellow
Write-Host "  aws apprunner describe-service --service-arn <SERVICE_ARN> --region $Region --query 'Service.ServiceUrl'" -ForegroundColor White
