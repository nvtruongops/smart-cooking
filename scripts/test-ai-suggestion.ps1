# Test AI Suggestion với Fuzzy Matching
# Test với nguyên liệu: ca ro, hanh la, rau mui

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   TEST AI SUGGESTION - FUZZY MATCHING" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$API_URL = "https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod"

# Test 1: Tìm nguyên liệu "ca ro"
Write-Host "Test 1: Tim nguyen lieu 'ca ro'" -ForegroundColor Yellow
$response1 = Invoke-RestMethod -Uri "$API_URL/ingredients/search?query=ca ro" -Method GET
if ($response1.Count -gt 0) {
    Write-Host "  [OK] Found:" -ForegroundColor Green
    $response1 | ForEach-Object { Write-Host "    - $($_.ingredient_name)" -ForegroundColor White }
} else {
    Write-Host "  [FAIL] Not found" -ForegroundColor Red
}
Write-Host ""

# Test 2: Tìm nguyên liệu "hanh la"  
Write-Host "Test 2: Tim nguyen lieu 'hanh la'" -ForegroundColor Yellow
$response2 = Invoke-RestMethod -Uri "$API_URL/ingredients/search?query=hanh la" -Method GET
if ($response2.Count -gt 0) {
    Write-Host "  [OK] Found:" -ForegroundColor Green
    $response2 | ForEach-Object { Write-Host "    - $($_.ingredient_name)" -ForegroundColor White }
} else {
    Write-Host "  [FAIL] Not found" -ForegroundColor Red
}
Write-Host ""

# Test 3: Tìm nguyên liệu "rau mui"
Write-Host "Test 3: Tim nguyen lieu 'rau mui'" -ForegroundColor Yellow
$response3 = Invoke-RestMethod -Uri "$API_URL/ingredients/search?query=rau mui" -Method GET
if ($response3.Count -gt 0) {
    Write-Host "  [OK] Found:" -ForegroundColor Green
    $response3 | ForEach-Object { Write-Host "    - $($_.ingredient_name)" -ForegroundColor White }
} else {
    Write-Host "  [FAIL] Not found" -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Ket qua: Neu 3 test deu [OK] thi database da san sang!" -ForegroundColor Green
Write-Host "Refresh trang web va test lai!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
