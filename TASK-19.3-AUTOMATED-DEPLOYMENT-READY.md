# 🚀 Task 19.3 - Automated Amplify Deployment Ready

**Date**: October 7, 2025  
**Status**: ✅ READY TO EXECUTE  
**Method**: Automated via PowerShell Script

---

## 📦 What's Been Created

### 1. Automated Deployment Script
**File**: `scripts/deploy-amplify.ps1`  
**Size**: ~450 lines  
**Features**:
- ✅ Automatic app creation
- ✅ GitHub repository connection
- ✅ Environment variables configuration
- ✅ Build settings setup
- ✅ Deployment trigger
- ✅ Real-time build monitoring
- ✅ Error handling and recovery
- ✅ Multiple AWS profile support

**Capabilities**:
```powershell
# Full automation
.\scripts\deploy-amplify.ps1 -MonitorBuild

# Custom configuration
.\scripts\deploy-amplify.ps1 -AppName "custom" -Branch "staging" -Profile "prod"

# Update existing app
.\scripts\deploy-amplify.ps1 -SkipCreate -MonitorBuild
```

---

### 2. Documentation

| File | Purpose | Size |
|------|---------|------|
| `docs/AMPLIFY-CLI-DEPLOYMENT.md` | Complete deployment guide | ~500 lines |
| `docs/GITHUB-TOKEN-SETUP.md` | GitHub token creation guide | ~300 lines |
| `AMPLIFY-QUICKSTART.md` | Manual deployment (15 min) | ~400 lines |

---

## ⚡ Quick Start (Total: 15-20 minutes)

### Step 1: Create GitHub Token (3 minutes)

```powershell
# Open browser
Start-Process "https://github.com/settings/tokens/new"

# Create token with scopes:
# ✅ repo
# ✅ admin:repo_hook

# Copy token (format: ghp_xxxxxxxxxxxx)
```

### Step 2: Set Token in PowerShell (30 seconds)

```powershell
# Set environment variable
$env:GITHUB_TOKEN = "ghp_YOUR_TOKEN_HERE"

# Verify
echo $env:GITHUB_TOKEN
```

### Step 3: Run Deployment Script (2 minutes + 10 min AWS build)

```powershell
# Navigate to project
cd C:\Users\nvtru\Documents\smart-cooking

# Run automated deployment
.\scripts\deploy-amplify.ps1 -MonitorBuild
```

### Step 4: Wait and Monitor (10 minutes)

**Script output:**
```
========================================
  AWS Amplify Automated Deployment
========================================

[1/8] Validating prerequisites... ✅
[2/8] Checking existing Amplify apps... ✅
[3/8] Creating Amplify app... ✅
[4/8] Setting up branch: main... ✅
[5/8] Setting environment variables... ✅
[6/8] Updating build settings... ✅
[7/8] Starting deployment... ✅
[8/8] Monitoring build progress...
  [00:30] Status: PROVISIONING
  [02:15] Status: RUNNING - Step: build
  [08:45] Status: SUCCEED ✅

Deployment completed successfully!
Your app is live at: https://main.d123456.amplifyapp.com

Done! 🎉
```

---

## 🎯 Expected Results

### Infrastructure Created

**AWS Amplify App:**
- Name: `smart-cooking-prod`
- Region: `ap-southeast-1`
- Platform: `Next.js (SSR)`
- Branch: `main`
- Auto-deploy: Enabled

**Configuration Applied:**
```yaml
Environment Variables (6):
  - NEXT_PUBLIC_API_URL
  - NEXT_PUBLIC_USER_POOL_ID  
  - NEXT_PUBLIC_USER_POOL_CLIENT_ID
  - NEXT_PUBLIC_AWS_REGION
  - NEXT_PUBLIC_ENVIRONMENT
  - NODE_ENV

Build Settings:
  appRoot: frontend
  buildCommand: npm run build
  outputDirectory: .next
  
Auto-deploy: ON (triggers on git push)
```

**URL Format:**
```
https://main.<app-id>.amplifyapp.com

Example:
https://main.d1a2b3c4d5e6f7.amplifyapp.com
```

---

## 📊 Deployment Timeline

| Phase | Duration | What Happens |
|-------|----------|--------------|
| **Provision** | 1-2 min | Create build container, setup environment |
| **Build** | 5-8 min | `npm ci` + `npm run build` |
| **Deploy** | 1-2 min | Upload to S3, configure CloudFront |
| **Verify** | 30 sec | Health checks, SSL validation |
| **Total** | **8-12 min** | Complete deployment |

---

## 🔧 Script Features Explained

### 1. Smart Validation
```powershell
✅ Checks AWS CLI installed
✅ Validates AWS credentials
✅ Verifies GitHub token (optional)
✅ Detects existing apps
✅ Prevents duplicate deployments
```

### 2. Error Recovery
```powershell
❌ GitHub auth fails → Provides manual steps
❌ App exists → Offers update/delete options
❌ Build fails → Shows logs URL
❌ Env vars fail → Lists manual workaround
```

### 3. Monitoring
```powershell
⏱️ Real-time status updates
📊 Build phase tracking
⏰ Time elapsed display
🎯 Success/failure notifications
```

### 4. Output Artifacts
```powershell
📄 amplify-app-info.json - App details for future use
📝 Console URLs for manual verification
🔗 Live app URL after success
```

---

## 🆚 Comparison: Automated vs Manual

| Aspect | Automated Script | Manual (AWS Console) |
|--------|-----------------|----------------------|
| **Time** | 2 min + 10 min build | 5 min + 10 min build |
| **Steps** | 3 (token, set env, run) | 15+ clicks |
| **Errors** | Auto-detected + recovery | Manual troubleshooting |
| **Monitoring** | Built-in (-MonitorBuild) | Manual refresh |
| **Repeatability** | 100% (same every time) | Variable |
| **Multi-env** | Easy (-Profile, -Branch) | Tedious |

**Recommendation**: Use script for speed and consistency.

---

## 🚨 Common Issues & Solutions

### Issue 1: No GitHub Token

**Error:**
```
WARNING: GITHUB_TOKEN environment variable not set
```

**Solution A - Quick (Continue without token):**
```powershell
# Press 'y' when script asks
# Follow manual authorization steps
# Re-run with -SkipCreate
```

**Solution B - Proper (Create token):**
```powershell
# See: docs/GITHUB-TOKEN-SETUP.md
# Takes 3 minutes
```

---

### Issue 2: App Already Exists

**What script shows:**
```
Found existing app: smart-cooking-prod (ID: d123456)

Options:
  1. Delete and recreate (clean slate)
  2. Update existing app
  3. Cancel
```

**Recommendation:**
- Choose **2** if you want to keep history
- Choose **1** if deployment is broken
- Choose **3** to investigate first

---

### Issue 3: Build Timeout

**Error:**
```
Status: FAILED
Reason: Build exceeded time limit
```

**Solution:**
```powershell
# Increase build timeout in AWS Console
# Or optimize frontend build:
cd frontend
npm run build  # Test locally first

# Check build time:
# Should be < 5 minutes locally
```

---

### Issue 4: Environment Variables Missing

**Check after deployment:**
```powershell
# Get app ID from output
$appId = "d123456"

# List environment variables
aws amplify get-app --app-id $appId --region ap-southeast-1 `
  | ConvertFrom-Json `
  | Select-Object -ExpandProperty app `
  | Select-Object -ExpandProperty environmentVariables
```

**If missing, add manually:**
```powershell
# Via AWS Console:
# Amplify → App → Environment variables → Manage

# Or via script (re-run Step 5)
```

---

## ✅ Post-Deployment Checklist

After script completes successfully:

### 1. Verify App URL
```powershell
# Get URL from script output
$url = "https://main.d123456.amplifyapp.com"

# Open in browser
Start-Process $url

# Check:
☑️ Homepage loads (no errors)
☑️ Navigation works
☑️ Can see login/signup forms
```

### 2. Test Authentication Flow
```
☑️ Register new user
☑️ Check email for verification
☑️ Verify email
☑️ Login successfully
☑️ Redirect to dashboard
```

### 3. Verify API Connectivity
```
☑️ Open DevTools → Network tab
☑️ Login or fetch data
☑️ See API calls to: h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com
☑️ Status codes: 200/401/403 (not 500/timeout)
```

### 4. Check CloudWatch Logs
```powershell
# API Gateway logs
aws logs tail /aws/apigateway/smart-cooking-prod --follow

# Lambda logs (if issues)
aws logs tail /aws/lambda/smart-cooking-auth-handler-prod --follow
```

### 5. Update Documentation
```powershell
# Update these files with live URL:
# - CURRENT-STATUS.md
# - TASK-19-STATUS-CHECK.md
# - README.md

# Mark Task 19.3 as COMPLETE ✅
```

---

## 📈 Task 19 Progress Update

### Before Script Creation:
```
Task 19: 60% COMPLETE
✅ 19.1 Infrastructure: 100%
✅ 19.2 Frontend Build: 100%
✅ 19.2.5 Code pushed to GitHub: 100%
⏳ 19.3 Amplify Deployment: 0%
⏳ 19.4 Validation: 0%
```

### After Script Execution (Estimated):
```
Task 19: 90% COMPLETE
✅ 19.1 Infrastructure: 100%
✅ 19.2 Frontend Build: 100%
✅ 19.2.5 Code pushed to GitHub: 100%
✅ 19.3 Amplify Deployment: 100% ⬅️ THIS STEP
⏳ 19.4 Validation: 0% (Task 20)
```

### After Full Validation (Task 20):
```
Task 19: 100% COMPLETE ✅
✅ 19.1 Infrastructure: 100%
✅ 19.2 Frontend Build: 100%
✅ 19.2.5 Code pushed to GitHub: 100%
✅ 19.3 Amplify Deployment: 100%
✅ 19.4 Validation: 100% (Task 20 complete)
```

---

## 🎯 Next Steps After Deployment

### Immediate (Required)
```powershell
# 1. Test live app
Start-Process $url

# 2. Run E2E tests
cd tests/e2e
$env:FRONTEND_URL = $url
npm test

# 3. Mark Task 19.3 as COMPLETE
# Edit: TASK-19-STATUS-CHECK.md
```

### Short-term (Task 20)
```powershell
# Continue Task 20 - E2E Testing
# See: docs/TASK-20-E2E-TESTING-VALIDATION.md

# Phase 2: Functional tests
# Phase 3: Performance tests
# Phase 4: Manual validation
# Phase 5: Test report
```

### Optional (Enhancement)
```powershell
# Setup custom domain
# See: docs/CUSTOM-DOMAIN-SETUP.md

# Example: smartcooking.com → Amplify app
```

---

## 💰 Cost Impact

**Amplify Costs:**
```
Build minutes: $0.01/minute
  - Estimate: 10 min/build × 5 builds/month = $0.50/month

Hosting: $0.15/GB stored + $0.15/GB served
  - Estimate: 1 GB storage + 5 GB transfer = $0.90/month

Total Amplify: ~$2-3/month (very low)

Total Project Cost (with backend):
  - Infrastructure: $33-50/month
  - Amplify: $2-3/month
  - Total: $35-53/month ✅ Under budget
```

---

## 📚 Additional Resources

### Documentation
- **Complete Guide**: `docs/AMPLIFY-CLI-DEPLOYMENT.md`
- **Token Setup**: `docs/GITHUB-TOKEN-SETUP.md`
- **Manual Method**: `AMPLIFY-QUICKSTART.md`
- **Custom Domain**: `docs/CUSTOM-DOMAIN-SETUP.md`

### AWS Resources
- **Amplify Console**: https://ap-southeast-1.console.aws.amazon.com/amplify/
- **Amplify Docs**: https://docs.aws.amazon.com/amplify/
- **Next.js on Amplify**: https://docs.amplify.aws/guides/hosting/nextjs/

### Scripts
```powershell
# Main deployment script
.\scripts\deploy-amplify.ps1

# AWS profile management
.\scripts\set-aws-profile.ps1

# Infrastructure validation
.\scripts\test-production.ps1

# Production deployment (CDK)
.\scripts\deploy-production.ps1
```

---

## 🎉 Ready to Deploy!

### Final Checklist Before Running:

```powershell
# 1. Check prerequisites
☑️ AWS CLI installed
☑️ AWS credentials configured
☑️ GitHub token created (or ready to authorize manually)
☑️ Code pushed to GitHub

# 2. Verify current state
☑️ Infrastructure deployed (Task 19.1) ✅
☑️ Frontend built (Task 19.2) ✅
☑️ Code on GitHub (Task 19.2.5) ✅

# 3. Run deployment
cd C:\Users\nvtru\Documents\smart-cooking
.\scripts\deploy-amplify.ps1 -MonitorBuild

# 4. Wait for success
# ⏱️ Expected: 10-15 minutes total

# 5. Test and celebrate! 🎉
```

---

**Time Investment:**
- Script creation: ✅ DONE (saved you ~2 hours)
- GitHub token: 3 minutes
- Script execution: 2 minutes
- AWS build: 10 minutes
- **Total: ~15 minutes** 🚀

**Status**: Ready to execute when you are!

**Command to run:**
```powershell
.\scripts\deploy-amplify.ps1 -MonitorBuild
```

---

*Created: October 7, 2025*  
*Task: 19.3 - Automated Amplify Deployment*  
*Status: ✅ READY TO EXECUTE*
