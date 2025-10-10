# Run Frontend Locally with Production API
# No Docker needed - Fast reload and debugging

Write-Host "`n" -NoNewline
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "🚀 LOCAL DEVELOPMENT MODE" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

Write-Host "📦 Starting Next.js development server..." -ForegroundColor Yellow
Write-Host "   Mode: Development (Hot Reload)" -ForegroundColor Gray
Write-Host "   API:  Production AWS Lambda" -ForegroundColor Gray
Write-Host "   Port: 3000" -ForegroundColor Gray
Write-Host ""

Set-Location frontend

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "📥 Installing dependencies..." -ForegroundColor Yellow
    npm install --legacy-peer-deps
    Write-Host ""
}

# Start dev server
Write-Host "✅ Starting application..." -ForegroundColor Green
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🌐 APPLICATION READY" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Local URL:    http://localhost:3000" -ForegroundColor Cyan
Write-Host "   Network URL:  http://YOUR_IP:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "   API Endpoint: Production AWS Lambda ✅" -ForegroundColor Green
Write-Host "   Hot Reload:   Enabled ✅" -ForegroundColor Green
Write-Host "   Source Maps:  Enabled ✅" -ForegroundColor Green
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

npm run dev
