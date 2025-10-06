# AWS App Runner Deployment Guide

## Architecture

```
┌─────────────────────────────────────┐
│   AWS App Runner (Frontend)         │
│   - Next.js 15 SSR                  │
│   - Docker Container                │
│   - Auto-scaling                    │
│   - HTTPS enabled                   │
└─────────────────────────────────────┘
              ▼
┌─────────────────────────────────────┐
│   API Gateway + Lambda (Backend)    │
│   - 12 Lambda functions             │
│   - DynamoDB tables                 │
│   - Cognito authentication          │
└─────────────────────────────────────┘
```

## Prerequisites

1. ✅ Docker Desktop installed and running
2. ✅ AWS CLI configured
3. ✅ Git repository pushed to GitHub

## Deployment Options

### Option A: Deploy with Local Docker

**Step 1: Install Docker Desktop**
- Download: https://www.docker.com/products/docker-desktop/
- Install and restart computer
- Start Docker Desktop

**Step 2: Run deployment script**
```powershell
cd C:\Users\nvtru\Documents\smart-cooking
.\scripts\deploy-app-runner.ps1
```

This script will:
1. Create ECR repository
2. Build Docker image (3-5 minutes)
3. Push to ECR
4. Create App Runner service
5. Configure environment variables

**Step 3: Wait for service to be ready (3-5 minutes)**

**Step 4: Get your app URL**
```powershell
aws apprunner list-services --region ap-southeast-1
```

---

### Option B: Deploy with CodeBuild (No local Docker needed)

**Step 1: Push code to GitHub**
```powershell
cd C:\Users\nvtru\Documents\smart-cooking
git add .
git commit -m "feat: Add Docker deployment for App Runner"
git push origin main
```

**Step 2: Run CodeBuild deployment**
```powershell
.\scripts\deploy-codebuild.ps1
```

This script will:
1. Create ECR repository
2. Create CodeBuild project
3. Build Docker image on AWS (3-5 minutes)
4. Push to ECR

**Step 3: Create App Runner service**
```powershell
.\scripts\create-app-runner-service.ps1
```

---

## Environment Variables

The following environment variables are automatically configured:

```
NEXT_PUBLIC_API_URL=https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/
NEXT_PUBLIC_USER_POOL_ID=ap-southeast-1_Vnu4kcJin
NEXT_PUBLIC_USER_POOL_CLIENT_ID=7h6n8dal12qpuh3242kg4gg4t3
NEXT_PUBLIC_AWS_REGION=ap-southeast-1
NEXT_PUBLIC_ENVIRONMENT=production
NODE_ENV=production
```

## Testing Local Docker Build

Before deploying to AWS, test locally:

```powershell
# Build image
cd frontend
docker build -t smart-cooking-nextjs .

# Run container
docker run -p 3000:3000 `
  -e NEXT_PUBLIC_API_URL=https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/ `
  -e NEXT_PUBLIC_USER_POOL_ID=ap-southeast-1_Vnu4kcJin `
  -e NEXT_PUBLIC_USER_POOL_CLIENT_ID=7h6n8dal12qpuh3242kg4gg4t3 `
  -e NEXT_PUBLIC_AWS_REGION=ap-southeast-1 `
  smart-cooking-nextjs

# Test in browser
Start-Process http://localhost:3000
```

## Costs

**App Runner Pricing (ap-southeast-1):**
- 1 vCPU, 2 GB RAM: ~$0.007/hour = ~$5/month
- Additional request charges: $0.001 per 1000 requests
- Free tier: 2,000 build minutes/month

**ECR Storage:**
- $0.10 per GB/month
- Estimated: <1 GB = ~$0.10/month

**Total estimated cost: ~$5-10/month**

## Troubleshooting

### Build fails with "npm ci" error
```powershell
# Update package-lock.json
cd frontend
npm install
git add package-lock.json
git commit -m "fix: Update package-lock.json"
git push
```

### Docker build fails
```powershell
# Check Docker is running
docker ps

# Check logs
docker logs <container_id>
```

### App Runner service fails to start
```powershell
# Check service logs
aws apprunner describe-service --service-arn <ARN> --region ap-southeast-1

# Check health check
# Default: GET / should return 200
```

## Next Steps After Deployment

1. ✅ Test authentication flow
2. ✅ Test all API endpoints
3. ✅ Setup custom domain (optional)
4. ✅ Configure CloudWatch alarms
5. ✅ Run E2E tests

## Custom Domain Setup (Optional)

```powershell
# Associate custom domain
aws apprunner associate-custom-domain `
  --service-arn <SERVICE_ARN> `
  --domain-name app.smartcooking.com `
  --region ap-southeast-1

# Add DNS records (from output)
# CNAME: app -> <apprunner-domain>
```
