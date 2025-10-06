# Task 20: Production E2E Testing - Simplified
# Tests production infrastructure and creates test users

param(
    [switch]$SkipUserCreation = $false,
    [Parameter(Mandatory=$false)]
    [string]$Profile
)

$ErrorActionPreference = "Continue"

# Set AWS profile if specified
if ($Profile) {
    Write-Host "Using AWS Profile: $Profile" -ForegroundColor Cyan
    $env:AWS_PROFILE = $Profile
} elseif ($env:AWS_PROFILE) {
    Write-Host "Using AWS Profile: $env:AWS_PROFILE" -ForegroundColor Cyan
}
Write-Host ""

# Colors
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }
function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Warning { param($msg) Write-Host $msg -ForegroundColor Yellow }

Write-Info "========================================"
Write-Info "TASK 20: Production Validation"  
Write-Info "========================================"
Write-Host ""

# Configuration
$REGION = "ap-southeast-1"
$USER_POOL_ID = "ap-southeast-1_Vnu4kcJin"
$CLIENT_ID = "7h6n8dal12qpuh3242kg4gg4t3"
$TABLE_NAME = "smart-cooking-data-prod"
$API_URL = "https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/"

Write-Info "Environment:"
Write-Host "  Region: $REGION"
Write-Host "  User Pool: $USER_POOL_ID"
Write-Host "  API: $API_URL"
Write-Host ""

# Test counters
$total = 0
$passed = 0
$failed = 0

# ========================================
# PHASE 1: Infrastructure Validation
# ========================================
Write-Info "PHASE 1: Infrastructure Validation"
Write-Host "------------------------------------"
Write-Host ""

# Test 1: DynamoDB
Write-Host "1. Testing DynamoDB Table..."
$total++
try {
    $table = aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION --output json | ConvertFrom-Json
    if ($table.Table.TableStatus -eq "ACTIVE") {
        Write-Success "   [PASS] DynamoDB Table ACTIVE"
        Write-Host "   - Item Count: $($table.Table.ItemCount)"
        Write-Host "   - GSI Count: $($table.Table.GlobalSecondaryIndexes.Count)"
        $passed++
    } else {
        Write-Error "   [FAIL] DynamoDB Status: $($table.Table.TableStatus)"
        $failed++
    }
} catch {
    Write-Error "   [FAIL] DynamoDB Error: $_"
    $failed++
}

# Test 2: Cognito
Write-Host "2. Testing Cognito User Pool..."
$total++
try {
    $pool = aws cognito-idp describe-user-pool --user-pool-id $USER_POOL_ID --region $REGION --output json | ConvertFrom-Json
    if ($pool.UserPool) {
        Write-Success "   [PASS] Cognito User Pool Active"
        Write-Host "   - Name: $($pool.UserPool.Name)"
        Write-Host "   - Users: $($pool.UserPool.EstimatedNumberOfUsers)"
        $passed++
    } else {
        Write-Error "   [FAIL] Cognito pool not found"
        $failed++
    }
} catch {
    Write-Error "   [FAIL] Cognito Error: $_"
    $failed++
}

# Test 3: Lambda Functions
Write-Host "3. Testing Lambda Functions..."
$total++
try {
    $functions = aws lambda list-functions --region $REGION --output json | ConvertFrom-Json
    $prodFunctions = $functions.Functions | Where-Object { $_.FunctionName -like "*prod*" }
    if ($prodFunctions.Count -gt 0) {
        Write-Success "   [PASS] Lambda Functions: $($prodFunctions.Count) found"
        $prodFunctions | Select-Object -First 5 | ForEach-Object { 
            Write-Host "   - $($_.FunctionName)" 
        }
        $passed++
    } else {
        Write-Error "   [FAIL] No Lambda functions found"
        $failed++
    }
} catch {
    Write-Error "   [FAIL] Lambda Error: $_"
    $failed++
}

# Test 4: API Gateway
Write-Host "4. Testing API Gateway..."
$total++
try {
    $response = Invoke-WebRequest -Uri $API_URL -Method GET -ErrorAction SilentlyContinue
    Write-Success "   [PASS] API Gateway Accessible"
    $passed++
} catch {
    if ($_.Exception.Message -like "*Missing Authentication Token*" -or $_.Exception.Message -like "*403*" -or $_.Exception.Message -like "*401*") {
        Write-Success "   [PASS] API Gateway Accessible (auth required)"
        $passed++
    } else {
        Write-Error "   [FAIL] API Error: $($_.Exception.Message)"
        $failed++
    }
}

Write-Host ""

# ========================================
# PHASE 2: Test User Creation
# ========================================
if (!$SkipUserCreation) {
    Write-Info "PHASE 2: Test User Creation"
    Write-Host "----------------------------"
    Write-Host ""

    $testUsers = @(
        @{Email="test-user-1@smartcooking.com"; Password="TestPassword123!"; Name="Test User 1"},
        @{Email="test-user-2@smartcooking.com"; Password="TestPassword123!"; Name="Test User 2"},
        @{Email="test-user-3@smartcooking.com"; Password="TestPassword123!"; Name="Test User 3"}
    )

    foreach ($user in $testUsers) {
        Write-Host "Creating: $($user.Email)..."
        $total++
        
        # Check if exists
        try {
            $existing = aws cognito-idp admin-get-user `
                --user-pool-id $USER_POOL_ID `
                --username $user.Email `
                --region $REGION `
                --output json 2>$null | ConvertFrom-Json
            
            if ($existing) {
                Write-Warning "   [SKIP] User already exists"
                continue
            }
        } catch {
            # User doesn't exist, continue
        }
        
        # Create user
        try {
            $create = aws cognito-idp admin-create-user `
                --user-pool-id $USER_POOL_ID `
                --username $user.Email `
                --user-attributes Name=email,Value=$($user.Email) Name=email_verified,Value=true Name=name,Value=$($user.Name) `
                --temporary-password "TempPass123!" `
                --message-action SUPPRESS `
                --region $REGION `
                --output json 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                # Set permanent password
                $setPwd = aws cognito-idp admin-set-user-password `
                    --user-pool-id $USER_POOL_ID `
                    --username $user.Email `
                    --password $user.Password `
                    --permanent `
                    --region $REGION 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "   [PASS] User created"
                    $passed++
                } else {
                    Write-Error "   [FAIL] Password set failed"
                    $failed++
                }
            } else {
                Write-Error "   [FAIL] User creation failed"
                Write-Host "   Error: $create"
                $failed++
            }
        } catch {
            Write-Error "   [FAIL] Exception: $_"
            $failed++
        }
    }

    Write-Host ""
}

# ========================================
# PHASE 3: Test Summary
# ========================================
Write-Info "========================================"
Write-Info "TEST SUMMARY"
Write-Info "========================================"
Write-Host ""

Write-Host "Results:"
Write-Host "  Total Tests: $total"
Write-Success "  Passed: $passed"
if ($failed -gt 0) {
    Write-Error "  Failed: $failed"
} else {
    Write-Success "  Failed: $failed"
}

$passRate = if ($total -gt 0) { [math]::Round(($passed / $total) * 100, 1) } else { 0 }
Write-Host "  Pass Rate: $passRate%"
Write-Host ""

if ($passRate -ge 90) {
    Write-Success "Infrastructure Status: READY"
    Write-Host ""
    Write-Host "Next Steps:"
    Write-Host "  1. Run E2E tests: npm test"
    Write-Host "  2. Deploy to Amplify (see AMPLIFY-QUICKSTART.md)"
    Write-Host "  3. Configure custom domain (optional)"
} else {
    Write-Error "Infrastructure Status: NOT READY"
    Write-Host "Please fix failing tests before proceeding"
}

Write-Host ""
Write-Info "========================================"
Write-Host ""

# Set environment variables for testing
$env:API_URL = $API_URL
$env:AWS_REGION = $REGION  
$env:COGNITO_USER_POOL_ID = $USER_POOL_ID
$env:COGNITO_CLIENT_ID = $CLIENT_ID
$env:TABLE_NAME = $TABLE_NAME
$env:TEST_ENV = "production"

Write-Host "Environment variables set for testing" -ForegroundColor Gray
Write-Host ""

# Return exit code
if ($failed -eq 0) { exit 0 } else { exit 1 }
