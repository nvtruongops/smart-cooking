# AWS Profile Configuration Script
# Manage AWS profiles for Smart Cooking deployment

param(
    [Parameter(Mandatory=$false)]
    [string]$ProfileName,
    
    [Parameter(Mandatory=$false)]
    [switch]$List,
    
    [Parameter(Mandatory=$false)]
    [switch]$Current,
    
    [Parameter(Mandatory=$false)]
    [switch]$Validate
)

function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }
function Write-Warning { param($msg) Write-Host $msg -ForegroundColor Yellow }

Write-Info "========================================"
Write-Info "AWS Profile Configuration"
Write-Info "========================================"
Write-Host ""

# List available profiles
if ($List) {
    Write-Info "Available AWS Profiles:"
    Write-Host ""
    
    $awsConfigPath = Join-Path $env:USERPROFILE ".aws\credentials"
    
    if (Test-Path $awsConfigPath) {
        $profiles = Get-Content $awsConfigPath | Select-String "^\[(.+)\]" | ForEach-Object {
            $_.Matches.Groups[1].Value
        }
        
        foreach ($profile in $profiles) {
            Write-Host "  - $profile" -ForegroundColor White
        }
    } else {
        Write-Warning "No AWS credentials file found at: $awsConfigPath"
        Write-Host ""
        Write-Host "To configure AWS CLI, run: aws configure"
    }
    
    Write-Host ""
    exit 0
}

# Show current profile
if ($Current) {
    Write-Info "Current AWS Profile Configuration:"
    Write-Host ""
    
    if ($env:AWS_PROFILE) {
        Write-Host "  Environment Variable: $env:AWS_PROFILE" -ForegroundColor Green
    } else {
        Write-Host "  Environment Variable: (not set - using default)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Testing connection..."
    
    try {
        $identity = aws sts get-caller-identity --output json 2>$null | ConvertFrom-Json
        
        if ($identity) {
            Write-Success "Connection successful!"
            Write-Host ""
            Write-Host "  Account ID: $($identity.Account)" -ForegroundColor White
            Write-Host "  User ARN:   $($identity.Arn)" -ForegroundColor White
            Write-Host "  User ID:    $($identity.UserId)" -ForegroundColor White
        }
    } catch {
        Write-Error "Failed to connect to AWS"
        Write-Host "  Error: $_"
    }
    
    Write-Host ""
    exit 0
}

# Validate profile
if ($Validate) {
    if (!$ProfileName) {
        if ($env:AWS_PROFILE) {
            $ProfileName = $env:AWS_PROFILE
        } else {
            $ProfileName = "default"
        }
    }
    
    Write-Info "Validating profile: $ProfileName"
    Write-Host ""
    
    # Test credentials
    Write-Host "1. Testing credentials..."
    try {
        $identity = aws sts get-caller-identity --profile $ProfileName --output json 2>$null | ConvertFrom-Json
        
        if ($identity) {
            Write-Success "   [PASS] Credentials valid"
            Write-Host "   - Account: $($identity.Account)" -ForegroundColor Gray
        } else {
            Write-Error "   [FAIL] Invalid credentials"
            exit 1
        }
    } catch {
        Write-Error "   [FAIL] Cannot connect to AWS"
        Write-Host "   Error: $_" -ForegroundColor Gray
        exit 1
    }
    
    # Test region access
    Write-Host "2. Testing ap-southeast-1 access..."
    try {
        $regions = aws ec2 describe-regions --profile $ProfileName --region ap-southeast-1 --output json 2>$null | ConvertFrom-Json
        
        if ($regions) {
            Write-Success "   [PASS] Region accessible"
        } else {
            Write-Error "   [FAIL] Cannot access region"
            exit 1
        }
    } catch {
        Write-Error "   [FAIL] Region access error"
        exit 1
    }
    
    # Test required services
    Write-Host "3. Testing service permissions..."
    
    $services = @(
        @{Name="DynamoDB"; Command="aws dynamodb list-tables --profile $ProfileName --region ap-southeast-1 --output json 2>$null"},
        @{Name="Cognito"; Command="aws cognito-idp list-user-pools --max-results 1 --profile $ProfileName --region ap-southeast-1 --output json 2>$null"},
        @{Name="Lambda"; Command="aws lambda list-functions --max-items 1 --profile $ProfileName --region ap-southeast-1 --output json 2>$null"},
        @{Name="CloudFormation"; Command="aws cloudformation list-stacks --profile $ProfileName --region ap-southeast-1 --output json 2>$null"}
    )
    
    $allPass = $true
    foreach ($service in $services) {
        try {
            $result = Invoke-Expression $service.Command
            if ($result) {
                Write-Success "   [PASS] $($service.Name)" -ForegroundColor Green
            } else {
                Write-Error "   [FAIL] $($service.Name)"
                $allPass = $false
            }
        } catch {
            Write-Error "   [FAIL] $($service.Name)"
            $allPass = $false
        }
    }
    
    Write-Host ""
    if ($allPass) {
        Write-Success "Profile validation: PASSED"
        Write-Host ""
        Write-Host "This profile can deploy Smart Cooking infrastructure"
    } else {
        Write-Error "Profile validation: FAILED"
        Write-Host ""
        Write-Host "Please check IAM permissions for failed services"
        exit 1
    }
    
    Write-Host ""
    exit 0
}

# Set profile
if ($ProfileName) {
    Write-Info "Setting AWS Profile: $ProfileName"
    Write-Host ""
    
    # Validate profile exists
    $awsConfigPath = Join-Path $env:USERPROFILE ".aws\credentials"
    
    if (Test-Path $awsConfigPath) {
        $profileExists = Select-String -Path $awsConfigPath -Pattern "^\[$ProfileName\]" -Quiet
        
        if (!$profileExists) {
            Write-Error "Profile '$ProfileName' not found in AWS credentials"
            Write-Host ""
            Write-Host "Available profiles:"
            .\scripts\set-aws-profile.ps1 -List
            exit 1
        }
    } else {
        Write-Error "AWS credentials file not found"
        Write-Host ""
        Write-Host "Run: aws configure --profile $ProfileName"
        exit 1
    }
    
    # Set environment variable
    $env:AWS_PROFILE = $ProfileName
    
    # Set for current PowerShell session
    [Environment]::SetEnvironmentVariable("AWS_PROFILE", $ProfileName, "Process")
    
    Write-Success "Profile set: $ProfileName"
    Write-Host ""
    
    # Test connection
    Write-Host "Testing connection..."
    try {
        $identity = aws sts get-caller-identity --output json 2>$null | ConvertFrom-Json
        
        if ($identity) {
            Write-Success "Connection successful!"
            Write-Host ""
            Write-Host "  Account ID: $($identity.Account)" -ForegroundColor White
            Write-Host "  User ARN:   $($identity.Arn)" -ForegroundColor White
        }
    } catch {
        Write-Error "Failed to connect with profile: $ProfileName"
        Write-Host ""
        Write-Host "Please verify credentials with: aws configure --profile $ProfileName"
        exit 1
    }
    
    Write-Host ""
    Write-Info "Next Steps:"
    Write-Host "  1. Run validation: .\scripts\set-aws-profile.ps1 -ProfileName $ProfileName -Validate" -ForegroundColor White
    Write-Host "  2. Deploy infrastructure: .\scripts\deploy-production.ps1" -ForegroundColor White
    Write-Host "  3. Test production: .\scripts\test-production.ps1" -ForegroundColor White
    Write-Host ""
    Write-Warning "Note: Profile is set for current PowerShell session only"
    Write-Host "To persist, add to your PowerShell profile or set before each deployment"
    Write-Host ""
    
    exit 0
}

# Show help
Write-Info "Usage:"
Write-Host ""
Write-Host "  List available profiles:"
Write-Host "    .\scripts\set-aws-profile.ps1 -List" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Show current profile:"
Write-Host "    .\scripts\set-aws-profile.ps1 -Current" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Set profile:"
Write-Host "    .\scripts\set-aws-profile.ps1 -ProfileName my-profile" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Validate profile:"
Write-Host "    .\scripts\set-aws-profile.ps1 -ProfileName my-profile -Validate" -ForegroundColor Yellow
Write-Host "    .\scripts\set-aws-profile.ps1 -Validate  # validates current/default" -ForegroundColor Yellow
Write-Host ""
Write-Host "Examples:"
Write-Host "  .\scripts\set-aws-profile.ps1 -ProfileName production" -ForegroundColor Gray
Write-Host "  .\scripts\set-aws-profile.ps1 -ProfileName dev -Validate" -ForegroundColor Gray
Write-Host ""
