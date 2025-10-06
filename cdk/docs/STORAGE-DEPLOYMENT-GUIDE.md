# CDK Deployment Guide - S3 Storage Stack

## 🚀 Quick Start

### Prerequisites

1. **Default avatar file must exist:**
   ```powershell
   # Check if file exists
   Test-Path c:\Users\nvtru\Documents\smart-cooking\assets\default\avatar.png
   ```
   
   If not, add a default avatar image to `assets/default/avatar.png`

2. **AWS credentials configured:**
   ```powershell
   aws configure list
   ```

3. **CDK bootstrapped:**
   ```powershell
   cd c:\Users\nvtru\Documents\smart-cooking\cdk
   cdk bootstrap aws://{ACCOUNT_ID}/{REGION} --profile your-profile
   ```

### Deploy All Stacks

```powershell
cd c:\Users\nvtru\Documents\smart-cooking\cdk

# Install dependencies (if not done)
npm install

# Build TypeScript
npm run build

# Preview changes
cdk diff --all --profile your-profile

# Deploy everything
cdk deploy --all --profile your-profile
```

### Deploy Storage Stack Only

```powershell
# Preview storage stack changes
cdk diff SmartCooking-dev-Storage --profile your-profile

# Deploy storage stack
cdk deploy SmartCooking-dev-Storage --profile your-profile
```

## 📦 What Gets Created

### Storage Stack Resources

1. **S3 Bucket** - `smart-cooking-images-{environment}`
   - Encryption: S3-managed
   - Public access: Blocked
   - CORS: Enabled
   - Lifecycle rules: Intelligent Tiering after 90 days

2. **Default Avatar** - Auto-uploaded to `s3://bucket/default/avatar.png`
   - Source: `assets/default/avatar.png`
   - Deployed automatically during CDK deploy

3. **CloudFront Distribution** - CDN for image delivery
   - HTTPS only
   - Cache: 7-day default, 365-day max
   - Compression: Gzip + Brotli
   - HTTP/2 and HTTP/3 enabled

4. **Origin Access Identity** - Secure CloudFront-to-S3 access

### Lambda Stack Updates

All Lambda functions automatically get:
- Environment variable: `S3_BUCKET_NAME=smart-cooking-images-{env}`
- IAM permissions: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:CopyObject`
- Read/Write access to images bucket

## 🔍 Verify Deployment

### Check CloudFormation Stack

```powershell
aws cloudformation describe-stacks \
  --stack-name SmartCooking-dev-Storage \
  --profile your-profile \
  --query 'Stacks[0].StackStatus'
```

Should return: `CREATE_COMPLETE` or `UPDATE_COMPLETE`

### Check S3 Bucket

```powershell
# List buckets
aws s3 ls --profile your-profile | Select-String "smart-cooking-images"

# Check default avatar uploaded
aws s3 ls s3://smart-cooking-images-dev/default/ --profile your-profile
```

Should show: `avatar.png`

### Check Lambda Environment Variables

```powershell
aws lambda get-function-configuration \
  --function-name smart-cooking-auth-handler-dev \
  --profile your-profile \
  --query 'Environment.Variables.S3_BUCKET_NAME'
```

Should return: `"smart-cooking-images-dev"`

### Check CloudFront Distribution

```powershell
# Get distribution domain
aws cloudformation describe-stacks \
  --stack-name SmartCooking-dev-Storage \
  --profile your-profile \
  --query 'Stacks[0].Outputs[?OutputKey==`ImagesDistributionDomain`].OutputValue' \
  --output text
```

Test access:
```powershell
# Download default avatar via CloudFront
$cdnDomain = "d1234567890.cloudfront.net"  # Replace with actual domain
Invoke-WebRequest "https://$cdnDomain/default/avatar.png" -OutFile test-avatar.png
```

## 🔄 Update Existing Stack

If you already deployed and want to update:

```powershell
cd c:\Users\nvtru\Documents\smart-cooking\cdk

# Rebuild
npm run build

# Preview changes
cdk diff --all --profile your-profile

# Deploy updates
cdk deploy --all --profile your-profile
```

## 🗑️ Destroy Stack (Dev/Test Only)

⚠️ **WARNING:** This will delete the S3 bucket and all images!

```powershell
# Destroy storage stack only
cdk destroy SmartCooking-dev-Storage --profile your-profile

# OR destroy all stacks
cdk destroy --all --profile your-profile
```

**Production Note:** In production, bucket has `RETAIN` policy and won't be deleted.

## 🐛 Troubleshooting

### Error: "Default avatar not found"

**Solution:**
```powershell
# Ensure file exists
New-Item -Path "c:\Users\nvtru\Documents\smart-cooking\assets\default" -ItemType Directory -Force
# Add your avatar.png file to this directory
```

### Error: "Bucket already exists"

**Cause:** Bucket names are globally unique in S3

**Solution:**
```powershell
# Option 1: Delete old bucket
aws s3 rb s3://smart-cooking-images-dev --force --profile your-profile

# Option 2: Change bucket name in storage-stack.ts
# bucketName: `smart-cooking-images-${environment}-${accountId}`
```

### Error: "Access Denied" during asset deployment

**Cause:** CDK can't upload default avatar

**Solution:**
```powershell
# Check AWS credentials
aws sts get-caller-identity --profile your-profile

# Ensure CDK bootstrap is complete
cdk bootstrap --profile your-profile
```

### Error: "Lambda has no S3 permissions"

**Cause:** Stack deployment order issue

**Solution:**
```powershell
# Redeploy Lambda stack
cdk deploy SmartCooking-dev-Lambda --profile your-profile
```

### CloudFront distribution not working

**Cause:** Propagation takes 15-20 minutes

**Solution:**
```powershell
# Check distribution status
aws cloudfront list-distributions \
  --query 'DistributionList.Items[?Comment==`Smart Cooking Images CDN (dev)`].Status' \
  --profile your-profile
```

Wait until status is `Deployed`

## 📊 Stack Outputs

After successful deployment:

```
Outputs:
SmartCooking-dev-ImagesBucketName = smart-cooking-images-dev
SmartCooking-dev-ImagesBucketArn = arn:aws:s3:::smart-cooking-images-dev
SmartCooking-dev-ImagesCDN = d1234567890abc.cloudfront.net
SmartCooking-dev-ImagesCDNUrl = https://d1234567890abc.cloudfront.net
SmartCooking-dev-ApiUrl = https://abcdef.execute-api.ap-southeast-1.amazonaws.com/prod
```

## 🔐 Security Best Practices

✅ **Implemented:**
- S3 public access blocked
- CloudFront HTTPS only
- Origin Access Identity
- S3 encryption at rest
- IAM least privilege
- CORS properly configured

⚠️ **TODO for Production:**
- Restrict CORS to actual domain (not `*`)
- Enable S3 access logging
- Enable CloudFront logging
- Set up WAF for CloudFront
- Configure custom domain for CDN

## 💡 Tips

1. **Use CDK Watch for Development:**
   ```powershell
   cdk watch SmartCooking-dev-Storage --profile your-profile
   ```
   Auto-deploys on file changes

2. **Check CDK Diff Before Deploy:**
   ```powershell
   cdk diff --all --profile your-profile
   ```
   See exactly what will change

3. **Use Environment Context:**
   ```powershell
   cdk deploy --all --context environment=prod --profile your-profile
   ```

4. **Export Stack Template:**
   ```powershell
   cdk synth SmartCooking-dev-Storage > storage-stack.yaml
   ```

## 📚 Related Documentation

- `docs/S3-STORAGE-STACK-IMPLEMENTATION.md` - Detailed implementation guide
- `docs/AVATAR-IMPLEMENTATION.md` - Avatar upload features
- `cdk/lib/storage-stack.ts` - Storage stack source code
- `cdk/lib/lambda-stack.ts` - Lambda S3 integration

## ✅ Deployment Checklist

Before deployment:
- [ ] Default avatar exists at `assets/default/avatar.png`
- [ ] AWS credentials configured
- [ ] CDK bootstrapped in target region
- [ ] TypeScript compiled (`npm run build`)
- [ ] Reviewed changes (`cdk diff`)

After deployment:
- [ ] S3 bucket created
- [ ] Default avatar uploaded
- [ ] CloudFront distribution active
- [ ] Lambda env vars set
- [ ] Lambda S3 permissions granted
- [ ] Test avatar upload flow

---

**Last Updated:** October 6, 2025  
**CDK Version:** 2.100.0  
**Region:** ap-southeast-1 (Singapore)
