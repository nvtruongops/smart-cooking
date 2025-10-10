# Quick Lambda Deploy Script
Write-Host "`n📦 Building Lambda Package...`n" -ForegroundColor Cyan

# Clean up
if (Test-Path function.zip) { Remove-Item function.zip }
if (Test-Path temp-lambda) { Remove-Item temp-lambda -Recurse -Force }

# Build
Write-Host "Building TypeScript..." -ForegroundColor Yellow
npm run build

# Create package structure
New-Item -ItemType Directory -Path temp-lambda | Out-Null
New-Item -ItemType Directory -Path temp-lambda/shared | Out-Null

# Copy compiled files
Copy-Item dist/user-profile/index.js temp-lambda/
Copy-Item dist/shared/*.js temp-lambda/shared/ -Recurse

# Create zip
Write-Host "Creating ZIP..." -ForegroundColor Yellow
cd temp-lambda
Compress-Archive -Path * -DestinationPath ../function.zip -Force
cd ..

# Cleanup
Remove-Item temp-lambda -Recurse -Force

# Deploy
Write-Host "`n📤 Deploying to AWS Lambda...`n" -ForegroundColor Cyan
aws lambda update-function-code `
  --function-name smart-cooking-user-profile-dev `
  --zip-file fileb://function.zip `
  --region ap-southeast-1 `
  --query "LastModified" `
  --output text

Write-Host "`n⏳ Waiting for deployment..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "✅ Deploy complete!`n" -ForegroundColor Green
