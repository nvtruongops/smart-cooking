# AWS Profile Management Guide

## Hướng dẫn quản lý AWS Profiles cho Smart Cooking

---

## 📋 Tổng quan

AWS CLI hỗ trợ **multiple profiles** để quản lý nhiều AWS accounts hoặc IAM users. Guide này hướng dẫn cách:
- Tạo và quản lý profiles
- Chuyển đổi profiles cho deployment
- Validate permissions
- Troubleshoot common issues

---

## 🎯 Tình huống sử dụng

### Khi nào cần multiple profiles?

1. **Nhiều AWS Accounts**
   - Development account
   - Staging account
   - Production account

2. **Nhiều IAM Users**
   - Personal account
   - Team account
   - CI/CD account

3. **Nhiều Regions**
   - Testing trong US East
   - Production trong AP Southeast

4. **Security**
   - Separate credentials for different environments
   - Least privilege access

---

## ⚙️ Cấu hình AWS Profiles

### Bước 1: Tạo profile mới

```powershell
# Tạo profile "production"
aws configure --profile production

# Nhập thông tin:
# AWS Access Key ID: AKIA...
# AWS Secret Access Key: xxx...
# Default region: ap-southeast-1
# Default output format: json
```

### Bước 2: Tạo profile cho nhiều environments

```powershell
# Development profile
aws configure --profile dev
# Region: ap-southeast-1

# Staging profile
aws configure --profile staging
# Region: ap-southeast-1

# Production profile
aws configure --profile production
# Region: ap-southeast-1
```

### Bước 3: Verify profiles

File được lưu tại: `~/.aws/credentials` (Windows: `C:\Users\<username>\.aws\credentials`)

```ini
[default]
aws_access_key_id = AKIA...
aws_secret_access_key = xxx...

[dev]
aws_access_key_id = AKIA...
aws_secret_access_key = xxx...

[production]
aws_access_key_id = AKIA...
aws_secret_access_key = xxx...
```

Config file: `~/.aws/config`

```ini
[default]
region = ap-southeast-1
output = json

[profile dev]
region = ap-southeast-1
output = json

[profile production]
region = ap-southeast-1
output = json
```

---

## 🔧 Sử dụng Scripts của Smart Cooking

### Option 1: Dùng helper script (Recommended)

#### List tất cả profiles
```powershell
.\scripts\set-aws-profile.ps1 -List
```

**Output:**
```
Available AWS Profiles:
  - default
  - dev
  - staging
  - production
```

#### Check profile hiện tại
```powershell
.\scripts\set-aws-profile.ps1 -Current
```

**Output:**
```
Current AWS Profile Configuration:
  Environment Variable: production

Connection successful!
  Account ID: 123456789012
  User ARN:   arn:aws:iam::123456789012:user/deploy-user
  User ID:    AIDA...
```

#### Set profile mới
```powershell
.\scripts\set-aws-profile.ps1 -ProfileName production
```

**Output:**
```
Setting AWS Profile: production
Profile set: production

Connection successful!
  Account ID: 123456789012
  User ARN:   arn:aws:iam::123456789012:user/deploy-user

Next Steps:
  1. Run validation: .\scripts\set-aws-profile.ps1 -ProfileName production -Validate
  2. Deploy infrastructure: .\scripts\deploy-production.ps1
  3. Test production: .\scripts\test-production.ps1
```

#### Validate profile permissions
```powershell
.\scripts\set-aws-profile.ps1 -ProfileName production -Validate
```

**Output:**
```
Validating profile: production

1. Testing credentials...
   [PASS] Credentials valid
   - Account: 123456789012

2. Testing ap-southeast-1 access...
   [PASS] Region accessible

3. Testing service permissions...
   [PASS] DynamoDB
   [PASS] Cognito
   [PASS] Lambda
   [PASS] CloudFormation

Profile validation: PASSED
This profile can deploy Smart Cooking infrastructure
```

---

## 🚀 Deployment với Different Profiles

### Option A: Set profile trước deploy

```powershell
# Set profile
.\scripts\set-aws-profile.ps1 -ProfileName production

# Deploy infrastructure
.\scripts\deploy-production.ps1

# Test infrastructure
.\scripts\test-production.ps1
```

### Option B: Pass profile vào script

```powershell
# Deploy với production profile
.\scripts\deploy-production.ps1 -Profile production

# Test với production profile
.\scripts\test-production.ps1 -Profile production
```

### Option C: Set environment variable manually

```powershell
# PowerShell
$env:AWS_PROFILE = "production"

# Verify
aws sts get-caller-identity

# Deploy
cd cdk
npx cdk deploy --context environment=prod
```

### Option D: Use --profile flag với AWS CLI

```powershell
# All AWS commands
aws dynamodb list-tables --profile production --region ap-southeast-1
aws cognito-idp list-user-pools --max-results 10 --profile production --region ap-southeast-1

# CDK deployment
cd cdk
npx cdk deploy --profile production --context environment=prod
```

---

## 🔐 Required IAM Permissions

Profile cần permissions sau để deploy Smart Cooking:

### Minimum Permissions (Policy)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "dynamodb:*",
        "cognito-idp:*",
        "lambda:*",
        "apigateway:*",
        "s3:*",
        "cloudfront:*",
        "iam:*",
        "logs:*",
        "bedrock:*"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

### Recommended: Use Managed Policies

Attach các managed policies sau:
- `AdministratorAccess` (full access - development)
- `PowerUserAccess` (most services - staging)
- Custom policy (least privilege - production)

---

## 📊 Common Workflows

### Workflow 1: Switch from Default to Production

```powershell
# Check current profile
.\scripts\set-aws-profile.ps1 -Current

# Switch to production
.\scripts\set-aws-profile.ps1 -ProfileName production

# Validate permissions
.\scripts\set-aws-profile.ps1 -Validate

# Deploy
.\scripts\deploy-production.ps1
```

### Workflow 2: Deploy to Multiple Environments

```powershell
# Deploy to dev
.\scripts\set-aws-profile.ps1 -ProfileName dev
cd cdk
npx cdk deploy --context environment=dev

# Deploy to staging
.\scripts\set-aws-profile.ps1 -ProfileName staging
npx cdk deploy --context environment=staging

# Deploy to production
.\scripts\set-aws-profile.ps1 -ProfileName production
npx cdk deploy --context environment=prod
```

### Workflow 3: Validate Before Deploy

```powershell
# Validate profile
.\scripts\set-aws-profile.ps1 -ProfileName production -Validate

# If validation passes, deploy
if ($LASTEXITCODE -eq 0) {
    .\scripts\deploy-production.ps1 -Profile production
}
```

---

## 🐛 Troubleshooting

### Issue 1: "Unable to locate credentials"

**Error:**
```
Unable to locate credentials. You can configure credentials by running "aws configure"
```

**Solution:**
```powershell
# Configure profile
aws configure --profile production

# Or check if file exists
cat ~/.aws/credentials  # Linux/Mac
type $env:USERPROFILE\.aws\credentials  # Windows
```

### Issue 2: "Profile not found"

**Error:**
```
The config profile (production) could not be found
```

**Solution:**
```powershell
# List available profiles
.\scripts\set-aws-profile.ps1 -List

# Create missing profile
aws configure --profile production
```

### Issue 3: "Access Denied" errors

**Error:**
```
An error occurred (AccessDenied) when calling the DescribeTable operation
```

**Solution:**
```powershell
# Validate permissions
.\scripts\set-aws-profile.ps1 -ProfileName production -Validate

# Check IAM policy attached to user
aws iam list-attached-user-policies --user-name <username> --profile production

# Add required permissions via IAM Console
```

### Issue 4: Wrong region deployment

**Error:**
```
Stack is in us-east-1 but should be in ap-southeast-1
```

**Solution:**
```powershell
# Check profile config
aws configure get region --profile production

# Set correct region
aws configure set region ap-southeast-1 --profile production

# Or set environment variable
$env:AWS_REGION = "ap-southeast-1"
```

### Issue 5: Profile not persisting

**Symptom:** Profile resets after closing terminal

**Solution:**
```powershell
# Option A: Set in each session
$env:AWS_PROFILE = "production"

# Option B: Add to PowerShell profile
notepad $PROFILE
# Add line: $env:AWS_PROFILE = "production"

# Option C: Use script before each deployment
.\scripts\set-aws-profile.ps1 -ProfileName production
.\scripts\deploy-production.ps1
```

---

## 🔒 Security Best Practices

### 1. Separate Profiles for Environments

```powershell
# Never use production credentials in dev
[dev]
aws_access_key_id = AKIA_DEV...

[production]
aws_access_key_id = AKIA_PROD...
```

### 2. Use IAM Roles (EC2/Lambda)

Thay vì credentials, dùng IAM roles:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Service": "ec2.amazonaws.com"
    },
    "Action": "sts:AssumeRole"
  }]
}
```

### 3. Rotate Credentials Regularly

```powershell
# Every 90 days
aws iam create-access-key --user-name deploy-user
# Update ~/.aws/credentials
aws iam delete-access-key --access-key-id OLD_KEY --user-name deploy-user
```

### 4. Enable MFA

```powershell
# For sensitive operations
aws sts get-session-token --serial-number arn:aws:iam::123456789012:mfa/user --token-code 123456
```

### 5. Use AWS Vault (Advanced)

```powershell
# Install aws-vault
choco install aws-vault

# Store credentials securely
aws-vault add production

# Execute with MFA
aws-vault exec production -- aws sts get-caller-identity
```

---

## 📝 Quick Reference

### Environment Variable Priority

1. `AWS_PROFILE` environment variable
2. `--profile` CLI flag
3. `default` profile in credentials file

### Command Examples

```powershell
# List profiles
.\scripts\set-aws-profile.ps1 -List

# Current profile
.\scripts\set-aws-profile.ps1 -Current

# Set profile
.\scripts\set-aws-profile.ps1 -ProfileName production

# Validate profile
.\scripts\set-aws-profile.ps1 -ProfileName production -Validate

# Deploy with profile
.\scripts\deploy-production.ps1 -Profile production

# Test with profile
.\scripts\test-production.ps1 -Profile production

# Manual AWS CLI with profile
aws dynamodb list-tables --profile production --region ap-southeast-1
```

### File Locations

| OS | Credentials | Config |
|----|-------------|--------|
| Windows | `C:\Users\<username>\.aws\credentials` | `C:\Users\<username>\.aws\config` |
| Linux/Mac | `~/.aws/credentials` | `~/.aws/config` |

---

## 🎓 Advanced Topics

### Multi-Account Deployment

```powershell
# Account A (dev): 111111111111
.\scripts\set-aws-profile.ps1 -ProfileName dev-account
npx cdk deploy --context environment=dev

# Account B (prod): 222222222222
.\scripts\set-aws-profile.ps1 -ProfileName prod-account
npx cdk deploy --context environment=prod
```

### Cross-Region Deployment

```powershell
# Deploy to ap-southeast-1
$env:AWS_REGION = "ap-southeast-1"
npx cdk deploy

# Deploy to us-east-1
$env:AWS_REGION = "us-east-1"
npx cdk deploy
```

### SSO Integration

```powershell
# Configure SSO
aws configure sso

# SSO profile in ~/.aws/config
[profile production-sso]
sso_start_url = https://my-sso-portal.awsapps.com/start
sso_region = ap-southeast-1
sso_account_id = 123456789012
sso_role_name = DeploymentRole
region = ap-southeast-1

# Use SSO profile
aws sso login --profile production-sso
.\scripts\deploy-production.ps1 -Profile production-sso
```

---

## ✅ Checklist: Profile Setup

- [ ] Create AWS profile: `aws configure --profile production`
- [ ] Set region: `ap-southeast-1`
- [ ] Validate credentials: `.\scripts\set-aws-profile.ps1 -ProfileName production -Current`
- [ ] Validate permissions: `.\scripts\set-aws-profile.ps1 -ProfileName production -Validate`
- [ ] Test deployment: `.\scripts\deploy-production.ps1 -Profile production`
- [ ] Test infrastructure: `.\scripts\test-production.ps1 -Profile production`
- [ ] Document profile usage in team wiki
- [ ] Setup credential rotation schedule (90 days)

---

## 🆘 Support

### Get Help

```powershell
# Script help
.\scripts\set-aws-profile.ps1  # Shows usage

# AWS CLI help
aws configure help
aws sts help

# CDK help
npx cdk --help
```

### Common Commands

```powershell
# Who am I?
aws sts get-caller-identity

# What region?
aws configure get region

# What profile?
echo $env:AWS_PROFILE

# List all resources in region
aws resourcegroupstaggingapi get-resources --region ap-southeast-1
```

---

**Created**: October 7, 2025  
**Last Updated**: October 7, 2025  
**Version**: 1.0  
**Maintainer**: Smart Cooking DevOps Team

