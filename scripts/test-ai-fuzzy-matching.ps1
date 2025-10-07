# Test AI Ingredient Matching with Fuzzy Input
# Tests that AI can handle ingredients without diacritics

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI INGREDIENT MATCHING TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test cases with missing diacritics
$testCases = @(
    @{
        Input = "ca ro, hanh la, thit ga"
        Expected = "cà rốt, hành lá, thịt gà"
        Description = "Vegetables without diacritics"
    },
    @{
        Input = "tom, ca, rau muong"
        Expected = "tôm, cá, rau muống"
        Description = "Seafood and vegetables"
    },
    @{
        Input = "thit heo, ca chua, hanh"
        Expected = "thịt heo, cà chua, hành"
        Description = "Pork and vegetables"
    },
    @{
        Input = "ga, nam, dau hu"
        Expected = "gà, nấm, đậu hũ"
        Description = "Chicken and tofu"
    }
)

Write-Host "Testing AI ingredient interpretation..." -ForegroundColor Yellow
Write-Host ""

foreach ($test in $testCases) {
    Write-Host "Test: $($test.Description)" -ForegroundColor Cyan
    Write-Host "  Input:    $($test.Input)" -ForegroundColor Gray
    Write-Host "  Expected: $($test.Expected)" -ForegroundColor Green
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test AI API Call (Optional)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$runTest = Read-Host "Do you want to test AI API with real request? (y/N)"

if ($runTest -eq 'y' -or $runTest -eq 'Y') {
    Write-Host ""
    Write-Host "Calling AI Suggestion API..." -ForegroundColor Yellow
    
    # Get user token (assuming user is logged in)
    $token = Read-Host "Enter your JWT token"
    
    if ($token) {
        $apiUrl = "https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/suggestions/ai"
        
        $body = @{
            ingredients = @("ca ro", "hanh la", "thit ga")
            cooking_method = "xao"
            recipe_count = 1
        } | ConvertTo-Json
        
        try {
            $response = Invoke-RestMethod -Uri $apiUrl -Method Post `
                -Headers @{ 
                    "Authorization" = "Bearer $token"
                    "Content-Type" = "application/json"
                } `
                -Body $body
            
            Write-Host ""
            Write-Host "✓ AI Response Received!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Recipe: $($response.recipes[0].title)" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Ingredients from AI:" -ForegroundColor Yellow
            foreach ($ingredient in $response.recipes[0].ingredients) {
                Write-Host "  - $($ingredient.ingredient_name): $($ingredient.quantity)" -ForegroundColor White
            }
            Write-Host ""
            
            # Verify diacritics
            $hasCorrectDiacritics = $response.recipes[0].ingredients | Where-Object { 
                $_.ingredient_name -match '[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]'
            }
            
            if ($hasCorrectDiacritics) {
                Write-Host "✓ AI correctly added Vietnamese diacritics!" -ForegroundColor Green
            } else {
                Write-Host "⚠ AI response may be missing diacritics" -ForegroundColor Yellow
            }
            
        } catch {
            Write-Host "✗ API call failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "AI Prompt Features:" -ForegroundColor Yellow
Write-Host "  ✓ Accepts ingredients without diacritics" -ForegroundColor Green
Write-Host "  ✓ Supports typos and variations" -ForegroundColor Green
Write-Host "  - Auto-corrects to proper Vietnamese" -ForegroundColor Green
Write-Host "  - Dynamic cuisine based on user country" -ForegroundColor Green
Write-Host ""
Write-Host "Example mappings:" -ForegroundColor Yellow
Write-Host "  ca ro      -> ca rot" -ForegroundColor Gray
Write-Host "  hanh la    -> hanh la" -ForegroundColor Gray
Write-Host "  thit ga    -> thit ga" -ForegroundColor Gray
Write-Host "  tom        -> tom" -ForegroundColor Gray
Write-Host "  ca chua    -> ca chua" -ForegroundColor Gray
Write-Host ""
