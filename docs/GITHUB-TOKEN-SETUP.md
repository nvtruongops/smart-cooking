# 🔐 GitHub Token Setup - Quick Guide

## Step 1: Create GitHub Personal Access Token (2 minutes)

### Open GitHub Token Creation Page

**Option 1: Direct Link**
```
https://github.com/settings/tokens/new
```

**Option 2: Manual Navigation**
1. GitHub → Click your avatar (top right)
2. Settings
3. Developer settings (bottom left)
4. Personal access tokens → Tokens (classic)
5. Generate new token → Generate new token (classic)

---

## Step 2: Configure Token (1 minute)

**Fill in:**

| Field | Value |
|-------|-------|
| **Note** | `AWS Amplify - Smart Cooking Production` |
| **Expiration** | `90 days` (hoặc `No expiration` nếu bạn muốn) |
| **Scopes** | ☑️ Check these 2 boxes: |

### Required Scopes:

1. ☑️ **`repo`** (Full control of private repositories)
   - Includes: repo:status, repo_deployment, public_repo, repo:invite, security_events

2. ☑️ **`admin:repo_hook`** (Full control of repository hooks)
   - Includes: write:repo_hook, read:repo_hook

**Screenshot guide:**
```
[✅] repo
     [✅] repo:status
     [✅] repo_deployment  
     [✅] public_repo
     [✅] repo:invite
     [✅] security_events

[✅] admin:repo_hook
     [✅] write:repo_hook
     [✅] read:repo_hook
```

---

## Step 3: Generate and Copy Token (30 seconds)

1. Click **"Generate token"** (bottom of page)

2. **COPY THE TOKEN IMMEDIATELY!** 🚨
   - Format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - You'll only see it once
   - If you lose it, you'll need to create a new one

3. **Save it somewhere safe** (temporarily):
   - Notepad
   - Password manager
   - Secure note

---

## Step 4: Set Environment Variable (30 seconds)

### PowerShell (Recommended)

```powershell
# Set for current session (temporary - lost after closing terminal)
$env:GITHUB_TOKEN = "ghp_paste_your_token_here"

# Verify it's set
echo $env:GITHUB_TOKEN
# Should show: ghp_xxxx...

# Test length (should be 40-50 characters)
$env:GITHUB_TOKEN.Length
# Should show: ~40
```

### Set Permanently (Optional)

```powershell
# Windows - Set permanently for your user account
[System.Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'ghp_your_token_here', 'User')

# Verify (may need to restart PowerShell)
$env:GITHUB_TOKEN
```

**Note:** After setting permanently, close and reopen PowerShell to use it.

---

## Step 5: Verify Token Works (1 minute)

Test the token with GitHub API:

```powershell
# Test token validity
$headers = @{
    Authorization = "token $env:GITHUB_TOKEN"
}

$response = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers

# Should show your GitHub username
Write-Host "Token valid for user: $($response.login)" -ForegroundColor Green
```

**Expected output:**
```
Token valid for user: nvtruongops ✅
```

---

## Quick Copy-Paste Commands

After creating token, run these:

```powershell
# 1. Set token (replace with your actual token)
$env:GITHUB_TOKEN = "ghp_YOUR_TOKEN_HERE"

# 2. Verify
if ($env:GITHUB_TOKEN) { 
    Write-Host "✅ Token set successfully!" -ForegroundColor Green 
} else { 
    Write-Host "❌ Token not set" -ForegroundColor Red 
}

# 3. Test token
try {
    $headers = @{ Authorization = "token $env:GITHUB_TOKEN" }
    $user = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers
    Write-Host "✅ Token valid for: $($user.login)" -ForegroundColor Green
} catch {
    Write-Host "❌ Token invalid or expired" -ForegroundColor Red
}
```

---

## Alternative: Deploy Without Token

If you don't want to create a token, you can:

### Option 1: Manual GitHub Authorization (Recommended)

```powershell
# Run script without token
.\scripts\deploy-amplify.ps1

# When it asks about GitHub token:
# → Press 'y' to continue
# → Script will give you AWS Console URL
# → Go there and authorize GitHub manually
# → Come back and re-run with -SkipCreate
```

### Option 2: Skip Amplify Creation

```powershell
# Create app manually in AWS Console first
# Then run script with app ID:
.\scripts\deploy-amplify.ps1 -SkipCreate

# When asked, enter your App ID
```

---

## Security Best Practices

### ✅ DO:
- Use token expiration (90 days recommended)
- Store token in environment variable (not in code)
- Use token only for AWS Amplify
- Revoke token after use if no longer needed
- Keep token secret (don't commit to git)

### ❌ DON'T:
- Don't share token publicly
- Don't commit token to repository
- Don't use token with broader permissions than needed
- Don't use same token for multiple services

---

## Troubleshooting

### Token Shows as "Invalid"

**Possible causes:**
1. Token expired
2. Token revoked
3. Wrong scopes selected
4. Copy-paste error (missing characters)

**Solution:**
```powershell
# Check token format
$env:GITHUB_TOKEN
# Should start with: ghp_

# Check length
$env:GITHUB_TOKEN.Length
# Should be: 40-50 characters

# If wrong, create new token
```

### "Rate Limit Exceeded"

**Cause:** Too many API requests without token

**Solution:**
```powershell
# Set token to increase rate limit
$env:GITHUB_TOKEN = "ghp_your_token"

# Authenticated: 5,000 requests/hour
# Unauthenticated: 60 requests/hour
```

### Token Not Persisting

**If token disappears after closing terminal:**

```powershell
# Option 1: Set permanently
[System.Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'ghp_token', 'User')

# Option 2: Add to PowerShell profile
Add-Content -Path $PROFILE -Value '$env:GITHUB_TOKEN = "ghp_token"'

# Option 3: Just set it each session (more secure)
$env:GITHUB_TOKEN = "ghp_token"
```

---

## Token Management

### Check Token Status
```powershell
# See all your tokens
# Go to: https://github.com/settings/tokens

# Check what the token can access
$headers = @{ Authorization = "token $env:GITHUB_TOKEN" }
Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $headers
```

### Revoke Token (After Deployment)
```powershell
# If you want to revoke after deployment:
# 1. Go to: https://github.com/settings/tokens
# 2. Find "AWS Amplify - Smart Cooking Production"
# 3. Click "Delete"

# Note: Amplify will keep working with already-connected repo
```

### Regenerate Token
```powershell
# If token leaked or compromised:
# 1. Go to: https://github.com/settings/tokens
# 2. Click on token name
# 3. Click "Regenerate token"
# 4. Copy new token
# 5. Update environment variable
```

---

## Ready to Deploy?

After setting up token:

```powershell
# 1. Verify token is set
echo $env:GITHUB_TOKEN

# 2. Run deployment script
cd C:\Users\nvtru\Documents\smart-cooking
.\scripts\deploy-amplify.ps1 -MonitorBuild

# 3. Wait for deployment (5-10 minutes)

# 4. Test your app! 🎉
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────┐
│  GitHub Token Quick Reference           │
├─────────────────────────────────────────┤
│ Create: github.com/settings/tokens/new  │
│ Scopes: repo, admin:repo_hook           │
│ Format: ghp_xxxxxxxxxxxxx (40-50 chars) │
│                                         │
│ Set Token:                              │
│ $env:GITHUB_TOKEN = "ghp_xxx"           │
│                                         │
│ Verify:                                 │
│ echo $env:GITHUB_TOKEN                  │
│                                         │
│ Test:                                   │
│ Invoke-RestMethod -Uri                  │
│   "https://api.github.com/user"         │
│   -Headers @{Authorization="token ..."}│
└─────────────────────────────────────────┘
```

---

**Time to complete:** 3-5 minutes total

**Ready?** Create token → Set in PowerShell → Run deployment script! 🚀
