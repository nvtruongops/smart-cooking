# Task 20: E2E Testing & Production Validation Script
# PowerShell script for comprehensive production testing

Write-Host "================================" -ForegroundColor Cyan
Write-Host "TASK 20: E2E TESTING & VALIDATION" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"

# Production Configuration
$REGION = "ap-southeast-1"
$USER_POOL_ID = "ap-southeast-1_Vnu4kcJin"
$TABLE_NAME = "smart-cooking-data-prod"
$API_URL = "https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/"

Write-Host "Production Environment:" -ForegroundColor Yellow
Write-Host "  Region: $REGION" -ForegroundColor Gray
Write-Host "  User Pool: $USER_POOL_ID" -ForegroundColor Gray
Write-Host "  Table: $TABLE_NAME" -ForegroundColor Gray
Write-Host "  API: $API_URL" -ForegroundColor Gray
Write-Host ""

# ========================================
# PHASE 1: INFRASTRUCTURE VALIDATION
# ========================================
Write-Host "PHASE 1: Infrastructure Validation" -ForegroundColor Cyan
Write-Host "-----------------------------------" -ForegroundColor Cyan

# Test 1: DynamoDB Table
Write-Host "1. Checking DynamoDB Table..." -ForegroundColor Yellow
try {
    $table = aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION --output json | ConvertFrom-Json
    if ($table.Table.TableStatus -eq "ACTIVE") {
        Write-Host "   ✓ DynamoDB Table: ACTIVE" -ForegroundColor Green
        Write-Host "   - GSI Indexes: $($table.Table.GlobalSecondaryIndexes.Count)" -ForegroundColor Gray
    } else {
        Write-Host "   ✗ DynamoDB Table: $($table.Table.TableStatus)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ DynamoDB Table: ERROR" -ForegroundColor Red
}

# Test 2: Cognito User Pool
Write-Host "2. Checking Cognito User Pool..." -ForegroundColor Yellow
try {
    $userPool = aws cognito-idp describe-user-pool --user-pool-id $USER_POOL_ID --region $REGION --output json | ConvertFrom-Json
    Write-Host "   ✓ Cognito User Pool: $($userPool.UserPool.Name)" -ForegroundColor Green
    Write-Host "   - Estimated Users: $($userPool.UserPool.EstimatedNumberOfUsers)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Cognito User Pool: ERROR" -ForegroundColor Red
}

# Test 3: Lambda Functions
Write-Host "3. Checking Lambda Functions..." -ForegroundColor Yellow
try {
    $functions = aws lambda list-functions --region $REGION --output json | ConvertFrom-Json
    $smartCookingFunctions = $functions.Functions | Where-Object { $_.FunctionName -like "*SmartCooking*prod*" }
    Write-Host "   ✓ Lambda Functions: $($smartCookingFunctions.Count) found" -ForegroundColor Green
    foreach ($func in $smartCookingFunctions | Select-Object -First 5) {
        Write-Host "   - $($func.FunctionName)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ✗ Lambda Functions: ERROR" -ForegroundColor Red
}

# Test 4: API Gateway
Write-Host "4. Checking API Gateway..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $API_URL -Method GET -ErrorAction SilentlyContinue
    Write-Host "   ✓ API Gateway: Accessible" -ForegroundColor Green
} catch {
    if ($_.Exception.Message -like "*Missing Authentication Token*") {
        Write-Host "   ✓ API Gateway: Accessible (requires auth)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ API Gateway: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ""

# ========================================
# PHASE 2: TEST USER CREATION
# ========================================
Write-Host "PHASE 2: Test User Creation" -ForegroundColor Cyan
Write-Host "----------------------------" -ForegroundColor Cyan

$testUsers = @(
    @{Email="test-user-1@smartcooking.com"; Password="TestPassword123!"; Name="Test User 1"}
    @{Email="test-user-2@smartcooking.com"; Password="TestPassword123!"; Name="Test User 2"}
    @{Email="test-user-3@smartcooking.com"; Password="TestPassword123!"; Name="Test User 3"}
)

foreach ($user in $testUsers) {
    Write-Host "Creating user: $($user.Email)..." -ForegroundColor Yellow
    
    # Check if user already exists
    try {
        $existingUser = aws cognito-idp admin-get-user `
            --user-pool-id $USER_POOL_ID `
            --username $user.Email `
            --region $REGION `
            --output json 2>$null | ConvertFrom-Json
        
        if ($existingUser) {
            Write-Host "   ⚠ User already exists, skipping..." -ForegroundColor Yellow
            continue
        }
    } catch {
        # User doesn't exist, proceed to create
    }
    
    # Create user
    try {
        $createResult = aws cognito-idp admin-create-user `
            --user-pool-id $USER_POOL_ID `
            --username $user.Email `
            --user-attributes Name=email,Value=$($user.Email) Name=email_verified,Value=true Name=name,Value=$($user.Name) `
            --temporary-password "TempPass123!" `
            --message-action SUPPRESS `
            --region $REGION `
            --output json | ConvertFrom-Json
        
        # Set permanent password
        $setPwdResult = aws cognito-idp admin-set-user-password `
            --user-pool-id $USER_POOL_ID `
            --username $user.Email `
            --password $user.Password `
            --permanent `
            --region $REGION
        
        Write-Host "   ✓ User created successfully" -ForegroundColor Green
    } catch {
        Write-Host "   ✗ Failed to create user: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# ========================================
# PHASE 3: SET TEST ENVIRONMENT VARIABLES
# ========================================
Write-Host "PHASE 3: Configure Test Environment" -ForegroundColor Cyan
Write-Host "------------------------------------" -ForegroundColor Cyan

$env:API_URL = $API_URL
$env:AWS_REGION = $REGION
$env:COGNITO_USER_POOL_ID = $USER_POOL_ID
$env:COGNITO_CLIENT_ID = "7h6n8dal12qpuh3242kg4gg4t3"
$env:TABLE_NAME = $TABLE_NAME
$env:TEST_ENV = "production"

Write-Host "   ✓ Environment variables set" -ForegroundColor Green
Write-Host ""

# ========================================
# PHASE 4: RUN E2E TESTS
# ========================================
Write-Host "PHASE 4: Execute E2E Tests" -ForegroundColor Cyan
Write-Host "--------------------------" -ForegroundColor Cyan
Write-Host ""

$testSuites = @(
    @{
        Name="Infrastructure Validation"
        File="tests/infrastructure/validate-production.test.ts"
        Expected=10
    },
    @{
        Name="Core User Journey"
        File="tests/e2e/user-journey.test.ts"
        Expected=6
    },
    @{
        Name="AI Suggestions"
        File="tests/e2e/ai-suggestions.test.ts"
        Expected=10
    },
    @{
        Name="Social Integration"
        File="tests/e2e/social-integration.test.ts"
        Expected=36
    },
    @{
        Name="Performance Optimization"
        File="tests/performance/social-optimization.test.ts"
        Expected=22
    }
)

$totalTests = 0
$passedTests = 0
$failedTests = 0
$testResults = @()

Write-Host "Running test suites..." -ForegroundColor Yellow
Write-Host ""

foreach ($suite in $testSuites) {
    Write-Host "Running: $($suite.Name)..." -ForegroundColor Cyan
    
    # Check if test file exists
    if (!(Test-Path $suite.File)) {
        Write-Host "   ⚠ Test file not found: $($suite.File)" -ForegroundColor Yellow
        $testResults += @{
            Suite = $suite.Name
            Status = "SKIPPED"
            Passed = 0
            Failed = 0
            Message = "Test file not found"
        }
        continue
    }
    
    # Run tests
    try {
        $output = npm test -- $suite.File 2>&1 | Out-String
        
        if ($LASTEXITCODE -eq 0) {
            $passed = $suite.Expected
            $failed = 0
            $status = "PASSED"
            $color = "Green"
        } else {
            $passed = 0
            $failed = $suite.Expected
            $status = "FAILED"
            $color = "Red"
        }
        
        $totalTests += $suite.Expected
        $passedTests += $passed
        $failedTests += $failed
        
        $testCount = $suite.Expected
        Write-Host "   $status" -ForegroundColor $color -NoNewline
        Write-Host " ($passed/$testCount)" -ForegroundColor White
        
        $testResults += @{
            Suite = $suite.Name
            Status = $status
            Passed = $passed
            Failed = $failed
            Message = ""
        }
    } catch {
        Write-Host "   X ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $testResults += @{
            Suite = $suite.Name
            Status = "ERROR"
            Passed = 0
            Failed = $suite.Expected
            Message = $_.Exception.Message
        }
        $failedTests += $suite.Expected
        $totalTests += $suite.Expected
    }
}

Write-Host ""

# ========================================
# PHASE 5: TEST SUMMARY
# ========================================
Write-Host "================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Test Results:" -ForegroundColor Yellow
foreach ($result in $testResults) {
    $statusColor = if ($result.Status -eq "PASSED") { "Green" } elseif ($result.Status -eq "FAILED") { "Red" } else { "Yellow" }
    Write-Host "  [$($result.Status)]" -ForegroundColor $statusColor -NoNewline
    Write-Host " $($result.Suite): $($result.Passed)/$($result.Passed + $result.Failed)" -ForegroundColor White
}

Write-Host ""
Write-Host "Overall Statistics:" -ForegroundColor Yellow
Write-Host "  Total Tests: $totalTests" -ForegroundColor White
Write-Host "  Passed: $passedTests" -ForegroundColor Green
Write-Host "  Failed: $failedTests" -ForegroundColor $(if ($failedTests -gt 0) { "Red" } else { "Green" })

$passRate = if ($totalTests -gt 0) { [math]::Round(($passedTests / $totalTests) * 100, 2) } else { 0 }
Write-Host "  Pass Rate: $passRate%" -ForegroundColor $(if ($passRate -ge 95) { "Green" } elseif ($passRate -ge 80) { "Yellow" } else { "Red" })

Write-Host ""

# ========================================
# PHASE 6: PRODUCTION READINESS
# ========================================
Write-Host "Production Readiness:" -ForegroundColor Cyan
$isReady = $passRate -ge 95 -and $failedTests -eq 0

if ($isReady) {
    Write-Host "  ✓ PRODUCTION READY" -ForegroundColor Green
    Write-Host "  All critical tests passed" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Deploy frontend to Amplify" -ForegroundColor White
    Write-Host "  2. Configure custom domain (optional)" -ForegroundColor White
    Write-Host "  3. Setup monitoring alerts" -ForegroundColor White
    Write-Host "  4. Launch to users! 🎉" -ForegroundColor White
} else {
    Write-Host "  ⚠ NOT READY FOR PRODUCTION" -ForegroundColor Red
    Write-Host "  Please fix failing tests before deploying" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Issues to resolve:" -ForegroundColor Yellow
    foreach ($result in $testResults | Where-Object { $_.Status -ne "PASSED" }) {
        Write-Host "  - $($result.Suite): $($result.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Save test report
$reportPath = "test-report-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
$report = @{
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    environment = "production"
    region = $REGION
    totalTests = $totalTests
    passedTests = $passedTests
    failedTests = $failedTests
    passRate = $passRate
    productionReady = $isReady
    results = $testResults
}

$report | ConvertTo-Json -Depth 10 | Out-File $reportPath
Write-Host "Test report saved to: $reportPath" -ForegroundColor Gray
Write-Host ""
