# Simple Local Test Script for Smart Cooking App
# Tests the Docker container and basic functionality

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SMART COOKING - LOCAL TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker container is running
Write-Host "1. Checking Docker container..." -ForegroundColor Yellow
$container = docker ps --filter "name=smart-cooking-test" --format "{{.Names}}"

if ($container -eq "smart-cooking-test") {
    Write-Host "   [OK] Container is running" -ForegroundColor Green
    
    # Get container status
    $status = docker inspect smart-cooking-test --format "{{.State.Status}}"
    Write-Host "   Status: $status" -ForegroundColor Gray
    
    # Get port mapping
    $port = docker port smart-cooking-test
    Write-Host "   Port: $port" -ForegroundColor Gray
} else {
    Write-Host "   [ERROR] Container is not running" -ForegroundColor Red
    Write-Host "   Run: docker run -d -p 3000:3000 --name smart-cooking-test smart-cooking-nextjs" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Check application logs
Write-Host "2. Checking application logs..." -ForegroundColor Yellow
$logs = docker logs smart-cooking-test --tail 5
Write-Host $logs -ForegroundColor Gray

Write-Host ""

# Test HTTP endpoint
Write-Host "3. Testing HTTP endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "   [OK] App is responding (Status: 200)" -ForegroundColor Green
        Write-Host "   Content length: $($response.Content.Length) bytes" -ForegroundColor Gray
    }
} catch {
    Write-Host "   [ERROR] App is not responding" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Display access URLs
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   ACCESS POINTS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend:  http://localhost:3000" -ForegroundColor Green
Write-Host "Backend:   https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/" -ForegroundColor Green
Write-Host ""

# Test checklist
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   MANUAL TEST CHECKLIST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[ ] 1. Homepage loads correctly" -ForegroundColor Yellow
Write-Host "[ ] 2. User can register/login" -ForegroundColor Yellow
Write-Host "[ ] 3. Recipe list displays" -ForegroundColor Yellow
Write-Host "[ ] 4. Recipe details page works" -ForegroundColor Yellow
Write-Host "[ ] 5. AI suggestion works (test with: ca ro, hanh la)" -ForegroundColor Yellow
Write-Host "[ ] 6. Create new recipe works" -ForegroundColor Yellow
Write-Host "[ ] 7. Profile page displays" -ForegroundColor Yellow
Write-Host ""

# Open browser
Write-Host "Press any key to open browser..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "Test completed!" -ForegroundColor Green
Write-Host ""
