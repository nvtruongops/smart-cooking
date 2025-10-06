# 🚀 QUICK START: Deploy to AWS Amplify

**Estimated Time:** 15-20 minutes  
**Prerequisites:** GitHub account, AWS account, code pushed to GitHub

---

## STEP-BY-STEP GUIDE

### 1️⃣ Push Code to GitHub (5 minutes)

```powershell
# Navigate to project root
cd C:\Users\nvtru\Documents\smart-cooking

# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Production deployment - Task 19 complete"

# Add your GitHub remote
git remote add origin https://github.com/nvtruongops/smart-cooking.git

# Push to main branch
git push -u origin main
```

**If you encounter authentication issues:**
```powershell
# Use Personal Access Token (PAT)
# 1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens
# 2. Generate new token with "repo" scope
# 3. Use it as password when pushing
```

---

### 2️⃣ Open AWS Amplify Console (1 minute)

1. **Login to AWS Console**
   - URL: https://console.aws.amazon.com/amplify
   - Region: **ap-southeast-1** (Singapore)

2. **Click "New app"**
   - Select: **"Host web app"**

---

### 3️⃣ Connect GitHub Repository (3 minutes)

1. **Choose GitHub**
   - Click "GitHub" button
   - Click "Authorize AWS Amplify"
   - Login to GitHub and authorize

2. **Select Repository**
   - Repository: `smart-cooking`
   - Branch: `main`
   - Click **"Next"**

---

### 4️⃣ Configure Build Settings (2 minutes)

1. **App name:** `SmartCooking-prod`

2. **Amplify will auto-detect:** Next.js framework ✅

3. **Build settings** (should auto-fill):
   ```yaml
   appRoot: frontend
   buildCommand: npm run build
   startCommand: npm start
   ```

4. **Click "Next"**

---

### 5️⃣ Add Environment Variables (3 minutes)

Click **"Add environment variable"** and add these:

```
NEXT_PUBLIC_API_URL
https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/

NEXT_PUBLIC_API_REGION
ap-southeast-1

NEXT_PUBLIC_COGNITO_USER_POOL_ID
ap-southeast-1_Vnu4kcJin

NEXT_PUBLIC_COGNITO_CLIENT_ID
7h6n8dal12qpuh3242kg4gg4t3

NEXT_PUBLIC_COGNITO_REGION
ap-southeast-1

NEXT_PUBLIC_S3_BUCKET
smart-cooking-frontend-prod-156172784433

NEXT_PUBLIC_S3_REGION
ap-southeast-1

NEXT_PUBLIC_TABLE_NAME
smart-cooking-data-prod

NEXT_PUBLIC_ENVIRONMENT
production

NODE_ENV
production
```

**Tip:** Copy these exactly as shown (no quotes needed)

---

### 6️⃣ Deploy (1 minute setup + 10-15 minute build)

1. **Review settings**
   - Check all environment variables are set
   - Verify branch is `main`

2. **Click "Save and deploy"**

3. **Watch deployment progress:**
   ```
   ⏳ Provision (2 min)
   ⏳ Build (5-8 min)
   ⏳ Deploy (2-3 min)
   ⏳ Verify (1 min)
   ✅ Deployed!
   ```

4. **Get your URL:**
   - Format: `https://main.xxxxxxxxxxxxx.amplifyapp.com`
   - Copy this URL for testing

---

### 7️⃣ Verify Deployment (5 minutes)

**Test homepage:**
```powershell
# Replace with your Amplify URL
$AMPLIFY_URL = "https://main.xxxxx.amplifyapp.com"

# Open in browser
Start-Process $AMPLIFY_URL
```

**Check these pages:**
- ✅ Homepage (`/`)
- ✅ Login (`/login`)
- ✅ Register (`/register`)
- ✅ Dashboard (`/dashboard`)
- ✅ Recipe page (`/recipes/123`) - should work even with invalid ID
- ✅ User profile (`/users/123`) - should work even with invalid ID

**Test functionality:**
1. Register a new user
2. Verify email in Cognito (manual verification via AWS Console)
3. Login with new user
4. Create profile
5. Try ingredient validation
6. Generate AI recipe
7. Check social feed

---

## 🎯 SUCCESS CHECKLIST

After deployment, verify:

- [ ] Amplify shows "Deployed" status (green)
- [ ] Can access homepage at Amplify URL
- [ ] Dynamic routes work (`/recipes/[id]`, `/users/[userId]`)
- [ ] Can register new user
- [ ] Can login
- [ ] API calls work (check browser console - no errors)
- [ ] Images load properly
- [ ] No 404 errors in console
- [ ] CloudWatch logs show requests

---

## 🐛 TROUBLESHOOTING

### Build Fails
**Check build logs in Amplify Console:**
1. Click on failed deployment
2. View "Build" phase logs
3. Look for error messages
4. Common fixes:
   - Missing dependencies → Check package.json
   - Build timeout → Increase in settings
   - Environment variables → Verify all are set

### Runtime Errors
**Check browser console:**
1. Open DevTools (F12)
2. Look for red errors
3. Common issues:
   - CORS errors → Check API Gateway CORS settings
   - Auth errors → Verify Cognito env vars
   - 404 errors → Check file paths

### API Not Working
**Verify environment variables:**
1. Go to Amplify Console
2. App Settings → Environment variables
3. Ensure all `NEXT_PUBLIC_*` variables are set
4. Redeploy if you added new variables

---

## 📊 WHAT HAPPENS DURING BUILD

```
1. PROVISION (2 min)
   - Create build container
   - Allocate resources
   - Setup environment

2. BUILD (5-8 min)
   Phase: preBuild
   - Install Node.js
   - Run: npm ci
   - Download ~800MB dependencies
   
   Phase: build
   - Run: npm run build
   - Compile TypeScript
   - Generate static pages
   - Bundle JavaScript
   - Optimize images
   
3. DEPLOY (2-3 min)
   - Upload build artifacts to S3
   - Configure CloudFront
   - Update routing rules
   - Deploy to edge locations
   
4. VERIFY (1 min)
   - Health check homepage
   - Verify routing works
   - Check SSL certificate
   - Mark as deployed ✅
```

---

## 💰 COST TRACKING

After deployment, monitor costs:

**In AWS Console:**
1. Go to: https://console.aws.amazon.com/billing
2. Cost Explorer → Daily costs
3. Filter by: Service = Amplify

**Expected costs (first month):**
- Build minutes: ~$15
- Hosting: ~$2
- **Total: ~$17/month** (very low for MVP)

---

## 🔄 FUTURE DEPLOYMENTS

**Auto-deploy on Git push:**
```powershell
# Just push to GitHub
git add .
git commit -m "Update feature X"
git push

# Amplify will automatically:
# 1. Detect new commit
# 2. Start build
# 3. Deploy if successful
# 4. Notify you via email
```

**Branch-based deployments:**
```powershell
# Create staging branch
git checkout -b staging
git push origin staging

# In Amplify Console:
# Connect staging branch → Auto-deploy to staging.smartcooking.com
```

---

## 📞 NEED HELP?

**Detailed guide:** See `docs/AMPLIFY-DEPLOYMENT-GUIDE.md`

**AWS Support:**
- Amplify Documentation: https://docs.aws.amazon.com/amplify/
- AWS Forums: https://forums.aws.amazon.com/forum.jspa?forumID=314

**GitHub Issues:**
- Create issue in repository for team help

---

## ✅ NEXT STEPS AFTER DEPLOYMENT

1. **Setup custom domain** (optional)
   - Follow guide in: `docs/CUSTOM-DOMAIN-SETUP.md`
   - Configure: `smartcooking.com` → Amplify

2. **Run E2E tests**
   ```powershell
   # Update test config with Amplify URL
   $env:API_URL = "https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/"
   $env:FRONTEND_URL = "https://main.xxxxx.amplifyapp.com"
   
   # Run tests
   npm test -- tests/e2e/
   ```

3. **Setup monitoring**
   - CloudWatch dashboards
   - Error alerts
   - Performance tracking

4. **Launch to users! 🎉**

---

**Created:** October 7, 2025  
**Status:** Ready to Deploy  
**Estimated Time:** 15-20 minutes total  
**Start Here:** Step 1 above ⬆️
