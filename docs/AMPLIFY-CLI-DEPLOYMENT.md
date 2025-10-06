# 🤖 Automated Amplify Deployment Guide

## Prerequisites Setup (5 minutes)

### 1. Create GitHub Personal Access Token

**Why needed?** AWS Amplify cần quyền truy cập GitHub repository để auto-deploy.

**Steps:**

1. Go to: https://github.com/settings/tokens/new

2. **Token settings:**
   - Note: `AWS Amplify - Smart Cooking`
   - Expiration: `90 days` (hoặc `No expiration`)
   - Scopes (check these boxes):
     - ✅ `repo` (Full control of private repositories)
     - ✅ `admin:repo_hook` (Full control of repository hooks)

3. Click **"Generate token"**

4. **COPY THE TOKEN** (you'll only see it once!)
   - Format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

5. **Set environment variable:**

   ```powershell
   # PowerShell (Windows)
   $env:GITHUB_TOKEN = "ghp_your_token_here"
   
   # Or permanently (requires restart):
   [System.Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'ghp_your_token_here', 'User')
   ```

6. **Verify:**
   ```powershell
   echo $env:GITHUB_TOKEN
   # Should show: ghp_xxxx...
   ```

---

## Quick Start - Automated Deployment

### Option A: Full Automated Deployment (No manual steps)

```powershell
# Navigate to project root
cd C:\Users\nvtru\Documents\smart-cooking

# Run deployment script with monitoring
.\scripts\deploy-amplify.ps1 -MonitorBuild

# Expected output:
# ========================================
#   AWS Amplify Automated Deployment
# ========================================
# 
# [1/8] Validating prerequisites...
#   AWS CLI: aws-cli/2.x.x
#   AWS Account: 156172784433
#   AWS User: TruongOPS
# 
# [2/8] Checking existing Amplify apps...
#   No existing app found - will create new
# 
# [3/8] Creating Amplify app...
#   Created app successfully!
#   App ID: d1234567890abc
# 
# [4/8] Setting up branch: main...
#   Branch created successfully
# 
# [5/8] Setting environment variables...
#   Set NEXT_PUBLIC_API_URL
#   Set NEXT_PUBLIC_USER_POOL_ID
#   ...
# 
# [6/8] Updating build settings...
#   Build settings updated
# 
# [7/8] Starting deployment...
#   Deployment started!
#   Job ID: 1
#   App URL: https://main.d1234567890abc.amplifyapp.com
# 
# [8/8] Monitoring build progress...
#   [00:30] Status: PROVISIONING
#   [02:15] Status: RUNNING
#            Step: build
#   [08:45] Status: SUCCEED
# 
#   Deployment completed successfully!
#   Your app is live at: https://main.d1234567890abc.amplifyapp.com
# 
# Done! 🎉
```

**Time:** 10-15 minutes (mostly waiting for AWS)

---

### Option B: Create App, Then Monitor Separately

```powershell
# Step 1: Create and configure app (fast)
.\scripts\deploy-amplify.ps1

# Step 2: Monitor build later
.\scripts\deploy-amplify.ps1 -SkipCreate -MonitorBuild
```

---

### Option C: Use Different AWS Profile

```powershell
# If you have multiple AWS profiles
.\scripts\deploy-amplify.ps1 -Profile production -MonitorBuild
```

---

## Troubleshooting

### Issue 1: GitHub Token Not Set

**Error:**
```
WARNING: GITHUB_TOKEN environment variable not set
```

**Solution:**
```powershell
# Set token temporarily (this session only)
$env:GITHUB_TOKEN = "ghp_your_token_here"

# Re-run script
.\scripts\deploy-amplify.ps1 -MonitorBuild
```

**Or:** Continue without token and authorize manually:
1. Script will fail at app creation
2. Go to AWS Console: https://ap-southeast-1.console.aws.amazon.com/amplify/
3. Click "New app" → "Host web app" → "GitHub"
4. Authorize AWS Amplify
5. Copy the App ID created
6. Re-run script: `.\scripts\deploy-amplify.ps1 -SkipCreate -MonitorBuild`

---

### Issue 2: AWS Credentials Error

**Error:**
```
ERROR: Cannot authenticate with AWS
```

**Solution:**
```powershell
# Check current credentials
aws sts get-caller-identity

# If wrong account, set profile:
$env:AWS_PROFILE = "your-profile-name"

# Or use profile flag:
.\scripts\deploy-amplify.ps1 -Profile your-profile-name
```

---

### Issue 3: App Already Exists

**Error:**
```
Found existing app: smart-cooking-prod
```

**Options shown in script:**
1. **Delete and recreate** - Clean slate, deletes all history
2. **Update existing** - Keep history, update settings
3. **Cancel** - Exit script

**Recommendation:** Choose option 2 (Update existing) to keep deployment history.

---

### Issue 4: Build Failed

**Check build logs:**

1. **In terminal** (if using -MonitorBuild):
   ```
   Status: FAILED
   Check logs: https://...
   ```

2. **In AWS Console:**
   - Go to provided URL
   - Click on failed build
   - View detailed logs
   - Common issues:
     - Missing dependencies → Check package.json
     - Build timeout → Increase in Amplify settings
     - Out of memory → Upgrade build instance

3. **Fix and retry:**
   ```powershell
   # After fixing issues, trigger new deployment
   aws amplify start-job `
     --app-id <your-app-id> `
     --branch-name main `
     --job-type RELEASE `
     --region ap-southeast-1
   ```

---

### Issue 5: Environment Variables Not Set

**Verify in AWS Console:**

1. Go to: https://ap-southeast-1.console.aws.amazon.com/amplify/
2. Click your app → "Environment variables"
3. Check all variables are set:
   - ✅ NEXT_PUBLIC_API_URL
   - ✅ NEXT_PUBLIC_USER_POOL_ID
   - ✅ NEXT_PUBLIC_USER_POOL_CLIENT_ID
   - ✅ NEXT_PUBLIC_AWS_REGION
   - ✅ NEXT_PUBLIC_ENVIRONMENT
   - ✅ NODE_ENV

**If missing, add manually:**
1. Click "Manage variables"
2. Add missing variables
3. Redeploy: "Run build"

---

## Manual Steps (If Script Fails)

If automation doesn't work, follow these manual steps:

### 1. Create App (AWS Console)
- Go to: https://ap-southeast-1.console.aws.amazon.com/amplify/
- Click "New app" → "Host web app"
- Choose GitHub → Authorize → Select `smart-cooking` → Branch `main`

### 2. Configure Build
- App root: `frontend`
- Build command: `npm run build`
- Start command: `npm start`
- Build settings: (auto-detected)

### 3. Add Environment Variables
```
NEXT_PUBLIC_API_URL=https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/
NEXT_PUBLIC_USER_POOL_ID=ap-southeast-1_Vnu4kcJin
NEXT_PUBLIC_USER_POOL_CLIENT_ID=7h6n8dal12qpuh3242kg4gg4t3
NEXT_PUBLIC_AWS_REGION=ap-southeast-1
NEXT_PUBLIC_ENVIRONMENT=production
NODE_ENV=production
```

### 4. Deploy
- Click "Save and deploy"
- Wait 5-10 minutes
- Test at: `https://main.xxxxxx.amplifyapp.com`

---

## Post-Deployment Verification

After deployment completes:

### 1. Test Homepage
```powershell
# Get app URL from script output or:
$appId = (Get-Content amplify-app-info.json | ConvertFrom-Json).AppId
$url = "https://main.$appId.amplifyapp.com"

# Open in browser
Start-Process $url
```

### 2. Check Functionality
- [ ] Homepage loads
- [ ] Can sign up new user
- [ ] Can login
- [ ] Dashboard accessible
- [ ] API calls work (check Network tab)
- [ ] No console errors

### 3. Run E2E Tests
```powershell
# Set frontend URL
$env:FRONTEND_URL = $url

# Run tests
cd tests/e2e
npm test
```

---

## Script Output Explained

### Success Output
```powershell
========================================
  Deployment Summary
========================================
  App ID: d1234567890abc
  Branch: main
  Region: ap-southeast-1
  Status: DEPLOYED ✅
  URL: https://main.d1234567890abc.amplifyapp.com

  Next Steps:
  1. Wait for build to complete (5-10 minutes)
  2. Test your app at the URL above
  3. Run E2E tests: npm test tests/e2e/
  4. Update Task 19 status: COMPLETE

========================================
```

### Files Created
- `amplify-app-info.json` - App details for future use

---

## Advanced Usage

### Custom App Name
```powershell
.\scripts\deploy-amplify.ps1 -AppName "smart-cooking-staging"
```

### Deploy Different Branch
```powershell
.\scripts\deploy-amplify.ps1 -Branch "staging"
```

### Different Region
```powershell
.\scripts\deploy-amplify.ps1 -Region "us-east-1"
```

### All Together
```powershell
.\scripts\deploy-amplify.ps1 `
  -AppName "smart-cooking-test" `
  -Branch "develop" `
  -Region "us-east-1" `
  -Profile "staging" `
  -MonitorBuild
```

---

## Cost Tracking

After deployment:

```powershell
# Check Amplify costs
aws ce get-cost-and-usage `
  --time-period Start=2025-10-01,End=2025-10-07 `
  --granularity DAILY `
  --metrics UnblendedCost `
  --filter file://cost-filter.json

# Expected first month:
# Build minutes: ~$15
# Hosting: ~$2
# Total: ~$17/month
```

---

## Next Steps After Successful Deployment

1. ✅ **Update Task 19 Status**
   ```powershell
   # Mark 19.3 as complete in TASK-19-STATUS-CHECK.md
   ```

2. ✅ **Run Task 20 E2E Tests**
   ```powershell
   cd tests/e2e
   npm test
   ```

3. ✅ **Setup Custom Domain** (Optional)
   - See: `docs/CUSTOM-DOMAIN-SETUP.md`

4. ✅ **Setup Monitoring**
   - CloudWatch dashboards
   - Error alerts
   - Performance tracking

---

## Quick Reference

```powershell
# Basic deployment
.\scripts\deploy-amplify.ps1 -MonitorBuild

# Update existing app
.\scripts\deploy-amplify.ps1 -SkipCreate -MonitorBuild

# Different profile
.\scripts\deploy-amplify.ps1 -Profile production

# Check status
aws amplify get-app --app-id <app-id> --region ap-southeast-1

# View builds
aws amplify list-jobs --app-id <app-id> --branch-name main --region ap-southeast-1

# Start new build
aws amplify start-job --app-id <app-id> --branch-name main --job-type RELEASE --region ap-southeast-1
```

---

**Total Time:** 
- Setup (GitHub token): 5 minutes
- Script execution: 2 minutes
- AWS build: 5-10 minutes
- **Total: ~15-20 minutes**

**Ready?** Run: `.\scripts\deploy-amplify.ps1 -MonitorBuild` 🚀
