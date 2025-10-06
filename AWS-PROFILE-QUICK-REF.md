# 🔧 AWS Profile - Quick Reference Card

## Thay đổi AWS Profile cho Smart Cooking

---

## 📋 TL;DR - Quick Commands

```powershell
# 1. Xem profile hiện tại
.\scripts\set-aws-profile.ps1 -Current

# 2. List tất cả profiles
.\scripts\set-aws-profile.ps1 -List

# 3. Đổi sang profile khác
.\scripts\set-aws-profile.ps1 -ProfileName production

# 4. Validate profile
.\scripts\set-aws-profile.ps1 -ProfileName production -Validate

# 5. Deploy với profile
.\scripts\deploy-production.ps1 -Profile production
```

---

## ⚡ Tình huống thường gặp

### Scenario 1: Đổi từ default sang production profile

```powershell
# Step 1: Check current
.\scripts\set-aws-profile.ps1 -Current

# Step 2: Switch
.\scripts\set-aws-profile.ps1 -ProfileName production

# Step 3: Deploy
.\scripts\deploy-production.ps1
```

### Scenario 2: Tạo profile mới cho team member

```powershell
# Step 1: Configure new profile
aws configure --profile teamname

# Nhập:
# - AWS Access Key ID: AKIA...
# - AWS Secret Access Key: xxx...
# - Default region: ap-southeast-1
# - Default output format: json

# Step 2: Validate
.\scripts\set-aws-profile.ps1 -ProfileName teamname -Validate

# Step 3: Use
.\scripts\deploy-production.ps1 -Profile teamname
```

### Scenario 3: Deploy nhiều environments

```powershell
# Dev environment
.\scripts\set-aws-profile.ps1 -ProfileName dev
cd cdk; npx cdk deploy --context environment=dev

# Production environment
.\scripts\set-aws-profile.ps1 -ProfileName production
npx cdk deploy --context environment=prod
```

---

## 🛠️ Scripts đã tạo

| Script | Mục đích |
|--------|----------|
| `set-aws-profile.ps1` | Quản lý AWS profiles |
| `deploy-production.ps1` | Deploy với profile support |
| `test-production.ps1` | Test với profile support |

---

## 📍 File locations

**Windows:**
- Credentials: `C:\Users\<username>\.aws\credentials`
- Config: `C:\Users\<username>\.aws\config`

**Linux/Mac:**
- Credentials: `~/.aws/credentials`
- Config: `~/.aws/config`

---

## ✅ Validation Checklist

Trước khi deploy, check:

```powershell
# 1. Profile exists
.\scripts\set-aws-profile.ps1 -List

# 2. Credentials valid
.\scripts\set-aws-profile.ps1 -Current

# 3. Permissions OK
.\scripts\set-aws-profile.ps1 -Validate

# 4. Correct account
aws sts get-caller-identity
# Account ID: 156172784433 ✅

# 5. Correct region
aws configure get region
# ap-southeast-1 ✅
```

---

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unable to locate credentials" | `aws configure --profile <name>` |
| "Profile not found" | `.\scripts\set-aws-profile.ps1 -List` |
| "Access Denied" | `.\scripts\set-aws-profile.ps1 -Validate` |
| Wrong region | `aws configure set region ap-southeast-1` |

---

## 📚 Full Documentation

Xem chi tiết: `docs/AWS-PROFILE-MANAGEMENT.md`

---

**Your Current Setup:**
- Account ID: 156172784433
- User: TruongOPS
- Region: ap-southeast-1
- Profile: default (or set custom)

