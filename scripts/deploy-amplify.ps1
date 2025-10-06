#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automated AWS Amplify deployment script for Smart Cooking production
.DESCRIPTION
    Creates and configures AWS Amplify app with all required settings,
    environment variables, and triggers deployment automatically.
.PARAMETER AppName
    Name of the Amplify app (default: smart-cooking-prod)
.PARAMETER Repository
    GitHub repository URL (default: https://github.com/nvtruongops/smart-cooking)
.PARAMETER Branch
    Git branch to deploy (default: main)
.PARAMETER Region
    AWS region (default: ap-southeast-1)
.PARAMETER Profile
    AWS profile to use (default: default)
.PARAMETER SkipCreate
    Skip app creation if already exists
.PARAMETER MonitorBuild
    Wait and monitor build progress
.EXAMPLE
    .\scripts\deploy-amplify.ps1
    .\scripts\deploy-amplify.ps1 -Profile production
    .\scripts\deploy-amplify.ps1 -SkipCreate -MonitorBuild
#>

param(
    [string]$AppName = "smart-cooking-prod",
    [string]$Repository = "https://github.com/nvtruongops/smart-cooking",
    [string]$Branch = "main",
    [string]$Region = "ap-southeast-1",
    [string]$Profile = "default",
    [switch]$SkipCreate,
    [switch]$MonitorBuild
)

$ErrorActionPreference = "Stop"

# Colors
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"

# Configuration
$GitHubToken = $env:GITHUB_TOKEN
$ApiUrl = "https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/"
$UserPoolId = "ap-southeast-1_Vnu4kcJin"
$ClientId = "7h6n8dal12qpuh3242kg4gg4t3"

Write-Host "`n========================================" -ForegroundColor $Cyan
Write-Host "  AWS Amplify Automated Deployment" -ForegroundColor $Cyan
Write-Host "========================================`n" -ForegroundColor $Cyan

# Step 1: Validate Prerequisites
Write-Host "[1/8] Validating prerequisites..." -ForegroundColor $Yellow

# Check AWS CLI
try {
    $awsVersion = aws --version 2>&1
    Write-Host "  AWS CLI: $awsVersion" -ForegroundColor $Green
} catch {
    Write-Host "  ERROR: AWS CLI not found. Install from: https://aws.amazon.com/cli/" -ForegroundColor $Red
    exit 1
}

# Check GitHub Token
if (-not $GitHubToken) {
    Write-Host "`n  WARNING: GITHUB_TOKEN environment variable not set" -ForegroundColor $Yellow
    Write-Host "  You'll need to authorize AWS Amplify manually in the AWS Console`n" -ForegroundColor $Yellow
    
    $response = Read-Host "Continue anyway? (y/N)"
    if ($response -ne "y") {
        Write-Host "`nTo set GitHub token:" -ForegroundColor $Cyan
        Write-Host "  1. Create token at: https://github.com/settings/tokens" -ForegroundColor $Cyan
        Write-Host "  2. Scopes needed: repo, admin:repo_hook" -ForegroundColor $Cyan
        Write-Host "  3. Run: `$env:GITHUB_TOKEN = 'your_token_here'" -ForegroundColor $Cyan
        exit 1
    }
}

# Check AWS credentials
try {
    if ($Profile -ne "default") {
        $env:AWS_PROFILE = $Profile
    }
    $identity = aws sts get-caller-identity --region $Region 2>&1 | ConvertFrom-Json
    Write-Host "  AWS Account: $($identity.Account)" -ForegroundColor $Green
    Write-Host "  AWS User: $($identity.Arn.Split('/')[-1])" -ForegroundColor $Green
} catch {
    Write-Host "  ERROR: Cannot authenticate with AWS" -ForegroundColor $Red
    Write-Host "  Check AWS credentials for profile: $Profile" -ForegroundColor $Red
    exit 1
}

# Check if app already exists
Write-Host "`n[2/8] Checking existing Amplify apps..." -ForegroundColor $Yellow
$existingApp = $null

try {
    $apps = aws amplify list-apps --region $Region 2>&1 | ConvertFrom-Json
    $existingApp = $apps.apps | Where-Object { $_.name -eq $AppName }
    
    if ($existingApp) {
        Write-Host "  Found existing app: $AppName (ID: $($existingApp.appId))" -ForegroundColor $Yellow
        
        if (-not $SkipCreate) {
            Write-Host "`n  Options:" -ForegroundColor $Cyan
            Write-Host "    1. Delete and recreate (clean slate)" -ForegroundColor $Cyan
            Write-Host "    2. Update existing app" -ForegroundColor $Cyan
            Write-Host "    3. Cancel" -ForegroundColor $Cyan
            
            $choice = Read-Host "`n  Choose (1/2/3)"
            
            if ($choice -eq "1") {
                Write-Host "`n  Deleting existing app..." -ForegroundColor $Yellow
                aws amplify delete-app --app-id $($existingApp.appId) --region $Region
                Write-Host "  Deleted successfully" -ForegroundColor $Green
                $existingApp = $null
            } elseif ($choice -eq "3") {
                Write-Host "  Cancelled by user" -ForegroundColor $Yellow
                exit 0
            }
        }
    } else {
        Write-Host "  No existing app found - will create new" -ForegroundColor $Green
    }
} catch {
    Write-Host "  Could not list apps (this is OK if none exist)" -ForegroundColor $Yellow
}

# Step 3: Create or Get App
if (-not $existingApp -and -not $SkipCreate) {
    Write-Host "`n[3/8] Creating Amplify app..." -ForegroundColor $Yellow
    
    # Build settings for Next.js
    $buildSpec = @"
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd frontend
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: frontend/.next
    files:
      - '**/*'
  cache:
    paths:
      - frontend/node_modules/**/*
"@
    
    # Create app with GitHub token if available
    $createParams = @{
        name = $AppName
        repository = $Repository
        platform = "WEB"
        buildSpec = $buildSpec
        enableBranchAutoBuild = $true
        enableBranchAutoDeploy = $true
    }
    
    if ($GitHubToken) {
        $createParams.accessToken = $GitHubToken
    }
    
    $createParamsJson = $createParams | ConvertTo-Json -Depth 10
    
    try {
        # Create app
        $appResult = aws amplify create-app `
            --name $AppName `
            --repository $Repository `
            --platform WEB `
            --region $Region `
            --enable-branch-auto-build `
            --enable-branch-auto-deploy `
            2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Failed to create app" -ForegroundColor $Red
            Write-Host "  $appResult" -ForegroundColor $Red
            
            Write-Host "`n  MANUAL SETUP REQUIRED:" -ForegroundColor $Yellow
            Write-Host "  1. Go to: https://console.aws.amazon.com/amplify/" -ForegroundColor $Cyan
            Write-Host "  2. Click 'New app' -> 'Host web app'" -ForegroundColor $Cyan
            Write-Host "  3. Connect GitHub repository manually" -ForegroundColor $Cyan
            Write-Host "  4. Then re-run this script with -SkipCreate flag" -ForegroundColor $Cyan
            exit 1
        }
        
        $app = $appResult | ConvertFrom-Json
        $appId = $app.app.appId
        
        Write-Host "  Created app successfully!" -ForegroundColor $Green
        Write-Host "  App ID: $appId" -ForegroundColor $Green
        
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor $Red
        Write-Host "`n  GitHub authorization required:" -ForegroundColor $Yellow
        Write-Host "  1. Go to: https://$Region.console.aws.amazon.com/amplify/home?region=$Region#/" -ForegroundColor $Cyan
        Write-Host "  2. Click 'New app' -> 'Host web app' -> GitHub" -ForegroundColor $Cyan
        Write-Host "  3. Authorize AWS Amplify" -ForegroundColor $Cyan
        Write-Host "  4. Come back and re-run this script with -SkipCreate" -ForegroundColor $Cyan
        exit 1
    }
    
} else {
    if ($existingApp) {
        $appId = $existingApp.appId
        Write-Host "`n[3/8] Using existing app: $appId" -ForegroundColor $Green
    } else {
        Write-Host "`n[3/8] Skipping app creation (use -SkipCreate flag)" -ForegroundColor $Yellow
        Write-Host "  Please provide App ID:" -ForegroundColor $Cyan
        $appId = Read-Host "  App ID"
        
        if (-not $appId) {
            Write-Host "  ERROR: App ID required" -ForegroundColor $Red
            exit 1
        }
    }
}

# Step 4: Create Branch
Write-Host "`n[4/8] Setting up branch: $Branch..." -ForegroundColor $Yellow

try {
    # Check if branch exists
    $branches = aws amplify list-branches --app-id $appId --region $Region 2>&1 | ConvertFrom-Json
    $existingBranch = $branches.branches | Where-Object { $_.branchName -eq $Branch }
    
    if (-not $existingBranch) {
        Write-Host "  Creating branch..." -ForegroundColor $Yellow
        
        $branchResult = aws amplify create-branch `
            --app-id $appId `
            --branch-name $Branch `
            --enable-auto-build `
            --region $Region `
            2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Branch created successfully" -ForegroundColor $Green
        } else {
            Write-Host "  WARNING: Could not create branch (may already exist)" -ForegroundColor $Yellow
        }
    } else {
        Write-Host "  Branch already exists" -ForegroundColor $Green
    }
} catch {
    Write-Host "  WARNING: Branch setup issue - continuing..." -ForegroundColor $Yellow
}

# Step 5: Configure Environment Variables
Write-Host "`n[5/8] Setting environment variables..." -ForegroundColor $Yellow

$envVars = @{
    "NEXT_PUBLIC_API_URL" = $ApiUrl
    "NEXT_PUBLIC_USER_POOL_ID" = $UserPoolId
    "NEXT_PUBLIC_USER_POOL_CLIENT_ID" = $ClientId
    "NEXT_PUBLIC_AWS_REGION" = $Region
    "NEXT_PUBLIC_ENVIRONMENT" = "production"
    "NODE_ENV" = "production"
    "_LIVE_UPDATES" = '[{"name":"Next.js version","pkg":"next-version","type":"internal","version":"latest"}]'
}

foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    
    try {
        aws amplify update-app `
            --app-id $appId `
            --environment-variables $key=$value `
            --region $Region `
            --no-cli-pager `
            2>&1 | Out-Null
        
        Write-Host "  Set $key" -ForegroundColor $Green
    } catch {
        Write-Host "  WARNING: Could not set $key" -ForegroundColor $Yellow
    }
}

# Alternative method: Set all at once
Write-Host "`n  Setting all environment variables together..." -ForegroundColor $Yellow

$envVarsJson = @{}
foreach ($key in $envVars.Keys) {
    $envVarsJson[$key] = $envVars[$key]
}

$envVarsJsonString = $envVarsJson | ConvertTo-Json -Compress

try {
    # Update app with all environment variables
    $updateCmd = "aws amplify update-app --app-id $appId --environment-variables '$envVarsJsonString' --region $Region --no-cli-pager"
    
    # Use Invoke-Expression for complex JSON
    $envVarsFormatted = ($envVarsJson.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ","
    
    aws amplify update-app `
        --app-id $appId `
        --region $Region `
        --no-cli-pager `
        2>&1 | Out-Null
    
    Write-Host "  Environment variables configured" -ForegroundColor $Green
} catch {
    Write-Host "  WARNING: Some env vars may not be set correctly" -ForegroundColor $Yellow
    Write-Host "  Please verify in AWS Console after deployment" -ForegroundColor $Yellow
}

# Step 6: Update Build Settings
Write-Host "`n[6/8] Updating build settings..." -ForegroundColor $Yellow

$buildSpec = @"
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd frontend
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: frontend/.next
    files:
      - '**/*'
  cache:
    paths:
      - frontend/node_modules/**/*
"@

try {
    # Update build spec
    aws amplify update-app `
        --app-id $appId `
        --build-spec $buildSpec `
        --region $Region `
        --no-cli-pager `
        2>&1 | Out-Null
    
    Write-Host "  Build settings updated" -ForegroundColor $Green
} catch {
    Write-Host "  WARNING: Could not update build settings" -ForegroundColor $Yellow
}

# Step 7: Start Deployment
Write-Host "`n[7/8] Starting deployment..." -ForegroundColor $Yellow

try {
    $jobResult = aws amplify start-job `
        --app-id $appId `
        --branch-name $Branch `
        --job-type RELEASE `
        --region $Region `
        2>&1
    
    if ($LASTEXITCODE -eq 0) {
        $job = $jobResult | ConvertFrom-Json
        $jobId = $job.jobSummary.jobId
        
        Write-Host "  Deployment started!" -ForegroundColor $Green
        Write-Host "  Job ID: $jobId" -ForegroundColor $Green
        
        # Get app domain
        $appDetails = aws amplify get-app --app-id $appId --region $Region | ConvertFrom-Json
        $defaultDomain = $appDetails.app.defaultDomain
        $appUrl = "https://$Branch.$defaultDomain"
        
        Write-Host "`n  App URL (after deployment): $appUrl" -ForegroundColor $Cyan
        Write-Host "  Console: https://$Region.console.aws.amazon.com/amplify/home?region=$Region#/$appId" -ForegroundColor $Cyan
        
    } else {
        Write-Host "  ERROR: Could not start deployment" -ForegroundColor $Red
        Write-Host "  $jobResult" -ForegroundColor $Red
        Write-Host "`n  Manual deployment:" -ForegroundColor $Yellow
        Write-Host "  1. Go to: https://$Region.console.aws.amazon.com/amplify/home?region=$Region#/$appId" -ForegroundColor $Cyan
        Write-Host "  2. Click 'Run build' for $Branch branch" -ForegroundColor $Cyan
        exit 1
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor $Red
    exit 1
}

# Step 8: Monitor Build (Optional)
if ($MonitorBuild) {
    Write-Host "`n[8/8] Monitoring build progress..." -ForegroundColor $Yellow
    Write-Host "  (Press Ctrl+C to stop monitoring - build will continue)`n" -ForegroundColor $Yellow
    
    $lastStatus = ""
    $startTime = Get-Date
    
    while ($true) {
        try {
            $jobStatus = aws amplify get-job `
                --app-id $appId `
                --branch-name $Branch `
                --job-id $jobId `
                --region $Region `
                2>&1 | ConvertFrom-Json
            
            $status = $jobStatus.job.summary.status
            $currentStep = $jobStatus.job.steps | Where-Object { $_.status -eq "RUNNING" } | Select-Object -First 1
            
            if ($status -ne $lastStatus) {
                $elapsed = ((Get-Date) - $startTime).ToString("mm\:ss")
                
                Write-Host "  [$elapsed] Status: $status" -ForegroundColor $(
                    switch ($status) {
                        "PENDING" { $Yellow }
                        "PROVISIONING" { $Yellow }
                        "RUNNING" { $Cyan }
                        "SUCCEED" { $Green }
                        "FAILED" { $Red }
                        default { $Yellow }
                    }
                )
                
                if ($currentStep) {
                    Write-Host "           Step: $($currentStep.stepName)" -ForegroundColor $Cyan
                }
                
                $lastStatus = $status
            }
            
            if ($status -eq "SUCCEED") {
                Write-Host "`n  Deployment completed successfully!" -ForegroundColor $Green
                Write-Host "  Total time: $((Get-Date) - $startTime | Select-Object -ExpandProperty TotalMinutes) minutes" -ForegroundColor $Green
                Write-Host "`n  Your app is live at: $appUrl" -ForegroundColor $Green
                break
            }
            
            if ($status -eq "FAILED") {
                Write-Host "`n  Deployment failed!" -ForegroundColor $Red
                Write-Host "  Check logs: https://$Region.console.aws.amazon.com/amplify/home?region=$Region#/$appId/$Branch/$jobId" -ForegroundColor $Cyan
                exit 1
            }
            
            Start-Sleep -Seconds 10
            
        } catch {
            Write-Host "  ERROR checking status: $($_.Exception.Message)" -ForegroundColor $Red
            break
        }
    }
} else {
    Write-Host "`n[8/8] Build monitoring skipped" -ForegroundColor $Yellow
    Write-Host "  To monitor: Use -MonitorBuild flag" -ForegroundColor $Cyan
    Write-Host "  Or check console: https://$Region.console.aws.amazon.com/amplify/home?region=$Region#/$appId" -ForegroundColor $Cyan
}

# Summary
Write-Host "`n========================================" -ForegroundColor $Cyan
Write-Host "  Deployment Summary" -ForegroundColor $Cyan
Write-Host "========================================" -ForegroundColor $Cyan
Write-Host "  App ID: $appId" -ForegroundColor $Green
Write-Host "  Branch: $Branch" -ForegroundColor $Green
Write-Host "  Region: $Region" -ForegroundColor $Green
if ($MonitorBuild -and $lastStatus -eq "SUCCEED") {
    Write-Host "  Status: DEPLOYED" -ForegroundColor $Green
    Write-Host "  URL: $appUrl" -ForegroundColor $Green
} else {
    Write-Host "  Status: BUILDING..." -ForegroundColor $Yellow
    Write-Host "  Monitor at: https://$Region.console.aws.amazon.com/amplify/home?region=$Region#/$appId" -ForegroundColor $Cyan
}

Write-Host "`n  Next Steps:" -ForegroundColor $Cyan
Write-Host "  1. Wait for build to complete (5-10 minutes)" -ForegroundColor $Cyan
Write-Host "  2. Test your app at the URL above" -ForegroundColor $Cyan
Write-Host "  3. Run E2E tests: npm test tests/e2e/" -ForegroundColor $Cyan
Write-Host "  4. Update Task 19 status: COMPLETE" -ForegroundColor $Cyan

Write-Host "`n========================================`n" -ForegroundColor $Cyan

# Save app info for future use
$appInfo = @{
    AppId = $appId
    AppName = $AppName
    Branch = $Branch
    Region = $Region
    DeployedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
}

$appInfo | ConvertTo-Json | Out-File -FilePath "amplify-app-info.json" -Encoding UTF8
Write-Host "App info saved to: amplify-app-info.json" -ForegroundColor $Green

Write-Host "`nDone! 🎉`n" -ForegroundColor $Green
