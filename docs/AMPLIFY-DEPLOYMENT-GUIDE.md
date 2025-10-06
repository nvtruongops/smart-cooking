# AWS Amplify Deployment Guide - Smart Cooking MVP

**Date:** October 7, 2025  
**Environment:** Production  
**Framework:** Next.js 15.5.4 (SSR)  
**Region:** ap-southeast-1 (Singapore)

---

## 🎯 WHY AWS AMPLIFY?

### Advantages for Next.js
- ✅ **Native SSR/SSG Support** - No configuration needed
- ✅ **Auto-scaling** - Handles traffic spikes automatically
- ✅ **CI/CD Integration** - Auto-deploy from Git push
- ✅ **Custom Domain** - Easy setup with Route 53
- ✅ **SSL/TLS** - Automatic certificate provisioning
- ✅ **Edge Caching** - CloudFront integration built-in
- ✅ **Environment Variables** - Managed through console
- ✅ **Preview Deployments** - Test before production

### Cost Comparison
```
AWS Amplify Hosting:
- Build: $0.01/minute
- Hosting: $0.15/GB stored + $0.15/GB served
- Est. Monthly: $15-30 for MVP traffic

vs S3 + Lambda@Edge (manual SSR):
- Setup complexity: High
- Maintenance: High
- Cost: Similar but harder to manage
```

---

## 🚀 DEPLOYMENT STEPS

### Method 1: Deploy via AWS Console (Recommended for first time)

#### Step 1: Push Code to GitHub (if not already)
```powershell
# Initialize git (if needed)
git init
git add .
git commit -m "Production ready - Task 19 complete"

# Add remote (replace with your repo)
git remote add origin https://github.com/nvtruongops/smart-cooking.git
git branch -M main
git push -u origin main
```

#### Step 2: Access AWS Amplify Console
```
1. Open AWS Console: https://console.aws.amazon.com/amplify
2. Select Region: ap-southeast-1 (Singapore)
3. Click "New app" → "Host web app"
```

#### Step 3: Connect Repository
```
1. Choose: GitHub
2. Authorize AWS Amplify to access your GitHub
3. Select Repository: smart-cooking
4. Select Branch: main
5. Click "Next"
```

#### Step 4: Configure Build Settings
```yaml
# Amplify will auto-detect Next.js and suggest this build spec
# You can customize in amplify.yml (see below)

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
```

#### Step 5: Configure Environment Variables
```
Add in Amplify Console → Environment Variables:

NEXT_PUBLIC_API_URL=https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/
NEXT_PUBLIC_API_REGION=ap-southeast-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-southeast-1_Vnu4kcJin
NEXT_PUBLIC_COGNITO_CLIENT_ID=7h6n8dal12qpuh3242kg4gg4t3
NEXT_PUBLIC_COGNITO_REGION=ap-southeast-1
NEXT_PUBLIC_S3_BUCKET=smart-cooking-frontend-prod-156172784433
NEXT_PUBLIC_S3_REGION=ap-southeast-1
NEXT_PUBLIC_CLOUDFRONT_URL=https://d6grpgvslabt3.cloudfront.net
NEXT_PUBLIC_TABLE_NAME=smart-cooking-data-prod
NEXT_PUBLIC_ENVIRONMENT=production
NODE_ENV=production
```

#### Step 6: Advanced Settings
```
1. Enable SSR: Yes (auto-detected for Next.js)
2. Enable rewrites: Yes (for client-side routing)
3. Build timeout: 15 minutes
4. Root directory: frontend
5. Click "Next" → "Save and deploy"
```

#### Step 7: Wait for Deployment
```
Deployment Process (~10-15 minutes):
├─ Provision: Create resources
├─ Build: npm install + npm run build
├─ Deploy: Upload to hosting
└─ Verify: Health checks

Status: Check in Amplify Console
URL: Will be provided as https://main.XXXXX.amplifyapp.com
```

---

### Method 2: Deploy via Amplify CLI (Advanced)

#### Install Amplify CLI
```powershell
npm install -g @aws-amplify/cli

# Configure Amplify
amplify configure
# Follow prompts to set up IAM user
```

#### Initialize Amplify Project
```powershell
cd frontend
amplify init

# Answer prompts:
? Enter a name for the project: smartcooking
? Enter a name for the environment: prod
? Choose your default editor: Visual Studio Code
? Choose the type of app: javascript
? What javascript framework: react
? Source Directory Path: app
? Distribution Directory Path: .next
? Build Command: npm run build
? Start Command: npm run start
? Do you want to use an AWS profile: Yes
? Please choose the profile: default
```

#### Add Hosting
```powershell
amplify add hosting

# Choose:
? Select the plugin module: Hosting with Amplify Console
? Choose a type: Manual deployment
```

#### Configure Environment Variables
```powershell
# Create .env.production (already exists)
# Amplify will automatically use it
```

#### Deploy
```powershell
amplify publish

# This will:
# 1. Build the app
# 2. Upload to Amplify
# 3. Configure hosting
# 4. Provide deployment URL
```

---

## 📝 AMPLIFY CONFIGURATION FILE

Create `amplify.yml` in project root:

```yaml
version: 1
appRoot: frontend
frontend:
  phases:
    preBuild:
      commands:
        # Install dependencies
        - npm ci --cache .npm --prefer-offline
    build:
      commands:
        # Build Next.js app
        - npm run build
        # Create standalone output (for smaller deployments)
        - echo "Build completed successfully"
  artifacts:
    # Output directory for Next.js
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      # Cache node_modules for faster builds
      - node_modules/**/*
      - .next/cache/**/*
  customHeaders:
    - pattern: '**/*'
      headers:
        - key: 'Strict-Transport-Security'
          value: 'max-age=31536000; includeSubDomains'
        - key: 'X-Frame-Options'
          value: 'SAMEORIGIN'
        - key: 'X-Content-Type-Options'
          value: 'nosniff'
        - key: 'X-XSS-Protection'
          value: '1; mode=block'
        - key: 'Referrer-Policy'
          value: 'strict-origin-when-cross-origin'
```

---

## 🔧 NEXT.JS CONFIGURATION FOR AMPLIFY

Update `frontend/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remove 'output: export' for SSR support
  images: {
    unoptimized: true,
    domains: [
      'd6grpgvslabt3.cloudfront.net',
      'smart-cooking-frontend-prod-156172784433.s3.ap-southeast-1.amazonaws.com'
    ],
  },
  trailingSlash: true,
  outputFileTracingRoot: __dirname,
  
  // Amplify-specific optimizations
  experimental: {
    optimizeCss: true,
  },
  
  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
  },
  
  // Rewrites for API proxy (optional)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL + ':path*',
      },
    ];
  },
};

export default nextConfig;
```

---

## 🎯 POST-DEPLOYMENT STEPS

### 1. Verify Deployment
```powershell
# Get Amplify app URL from console
$AMPLIFY_URL = "https://main.xxxxx.amplifyapp.com"

# Test homepage
curl $AMPLIFY_URL

# Test dynamic routes
curl "$AMPLIFY_URL/recipes/123"
curl "$AMPLIFY_URL/users/456"

# Test API connectivity
# (Should work if environment variables are set correctly)
```

### 2. Setup Custom Domain (Optional)
```
In Amplify Console:
1. Go to App Settings → Domain management
2. Add domain: smartcooking.com
3. Configure DNS:
   - Amplify will provide CNAME records
   - Add them to your domain registrar
4. Wait for SSL certificate provisioning (~15 min)
5. Domain will be active: https://smartcooking.com
```

### 3. Configure Branch-based Deployments
```
Amplify supports multiple branches:
- main → Production (smartcooking.com)
- staging → Staging (staging.smartcooking.com)
- develop → Development (dev.smartcooking.com)

Setup:
1. Push new branch to GitHub
2. In Amplify Console → "Connect branch"
3. Select branch → Auto-deploy enabled
```

### 4. Enable Performance Monitoring
```
In Amplify Console:
1. Go to Monitoring
2. Enable CloudWatch metrics
3. View:
   - Request count
   - Error rate
   - Latency (p50, p99)
   - Data transfer
```

---

## 💰 COST ESTIMATION

### Amplify Pricing (ap-southeast-1)

#### Build Minutes
```
Cost: $0.01/minute
Usage: 10 builds/day × 5 min/build × 30 days = 1,500 min/month
Monthly: 1,500 × $0.01 = $15/month
```

#### Hosting
```
Storage: $0.15/GB
- Estimate: 500 MB = $0.075/month

Data Transfer: $0.15/GB served
- Estimate: 10 GB/month = $1.50/month
```

#### Total Estimated Cost
```
Low Traffic (MVP):
- Build: $15/month
- Storage: $0.08/month
- Transfer: $1.50/month
──────────────────────
TOTAL: ~$16.58/month

Medium Traffic (10K users):
- Build: $15/month
- Storage: $0.15/month
- Transfer: $15/month
──────────────────────
TOTAL: ~$30.15/month

High Traffic (100K users):
- Build: $15/month
- Storage: $0.30/month
- Transfer: $150/month
──────────────────────
TOTAL: ~$165.30/month
```

---

## 🔍 MONITORING & DEBUGGING

### CloudWatch Logs
```
Amplify automatically sends logs to CloudWatch:
- /aws/amplify/[app-id]/build
- /aws/amplify/[app-id]/hosting

View in CloudWatch Console:
https://console.aws.amazon.com/cloudwatch/home?region=ap-southeast-1#logsV2:log-groups
```

### Build Logs
```
In Amplify Console:
1. Click on deployment
2. View "Build logs"
3. See each phase:
   - Provision
   - Build
   - Deploy
   - Verify
```

### Runtime Logs
```
Server-side logs (SSR pages):
- Available in CloudWatch Logs
- Search by request ID
- Filter by error level
```

### Performance Metrics
```
Available in Amplify Console → Monitoring:
- Requests per minute
- Error rate (4xx, 5xx)
- Latency percentiles
- Data transfer
- Cache hit ratio
```

---

## 🐛 TROUBLESHOOTING

### Issue 1: Build Fails
```
Error: "Module not found"
Solution:
1. Check package.json dependencies
2. Clear cache: Delete node_modules
3. Rebuild locally: npm ci && npm run build
4. Push fix to GitHub
```

### Issue 2: Environment Variables Not Working
```
Error: API_URL is undefined
Solution:
1. Go to Amplify Console → Environment variables
2. Add all NEXT_PUBLIC_* variables
3. Redeploy the app
4. Clear browser cache
```

### Issue 3: 404 on Dynamic Routes
```
Error: /recipes/123 returns 404
Solution:
1. Ensure "output: export" is REMOVED from next.config.ts
2. Amplify should detect SSR automatically
3. Check build logs for "Next.js SSR detected"
4. Redeploy if needed
```

### Issue 4: Slow Build Times
```
Problem: Build takes > 10 minutes
Solution:
1. Enable caching in amplify.yml
2. Use npm ci instead of npm install
3. Optimize dependencies (remove unused packages)
4. Consider build machine upgrade (in settings)
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment
- [x] Code pushed to GitHub
- [x] Frontend builds locally without errors
- [x] Environment variables documented
- [x] next.config.ts configured for SSR
- [x] amplify.yml created (optional but recommended)

### During Deployment
- [ ] Amplify app created in AWS Console
- [ ] GitHub repository connected
- [ ] Environment variables added
- [ ] Build settings configured
- [ ] Initial deployment triggered

### Post-Deployment
- [ ] Verify homepage loads
- [ ] Test dynamic routes (/recipes/[id], /users/[userId])
- [ ] Test API connectivity
- [ ] Verify authentication flow
- [ ] Check CloudWatch logs
- [ ] Run E2E tests against Amplify URL
- [ ] Setup custom domain (optional)
- [ ] Configure branch-based deployments
- [ ] Enable monitoring alerts

---

## 📚 ADDITIONAL RESOURCES

### AWS Documentation
- [Amplify Hosting](https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html)
- [Next.js on Amplify](https://docs.aws.amazon.com/amplify/latest/userguide/server-side-rendering-amplify.html)
- [Custom Domains](https://docs.aws.amazon.com/amplify/latest/userguide/custom-domains.html)

### Next.js Documentation
- [Deployment](https://nextjs.org/docs/deployment)
- [Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)

### Amplify CLI
- [Installation](https://docs.amplify.aws/cli/start/install/)
- [Commands](https://docs.amplify.aws/cli/reference/)

---

## 🎯 SUCCESS CRITERIA

### Deployment Successful When:
1. ✅ Amplify app shows "Deployed" status
2. ✅ Homepage accessible at Amplify URL
3. ✅ Dynamic routes working (/recipes/123)
4. ✅ API calls succeeding (authentication, data fetching)
5. ✅ No console errors in browser
6. ✅ CloudWatch logs showing requests
7. ✅ Build time < 10 minutes
8. ✅ All environment variables set correctly

### Quality Metrics
- **Build Success Rate:** > 95%
- **Response Time:** < 2s (p99)
- **Error Rate:** < 1%
- **Cache Hit Ratio:** > 70%

---

## 📞 SUPPORT

### If You Need Help
1. Check Amplify Console build logs
2. View CloudWatch logs for runtime errors
3. Test locally first: `npm run build && npm start`
4. Check AWS Support forums
5. Contact AWS Support (if you have a support plan)

---

**Last Updated:** October 7, 2025  
**Status:** Ready for Deployment  
**Estimated Time:** 15-20 minutes for initial setup  
**Next Step:** Follow "Method 1" above to deploy via AWS Console
