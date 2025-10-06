# Smart Cooking MVP - ap-southeast-1 Deployment Checklist

## Tổng Quan Vấn Đề

Khi deploy Smart Cooking MVP từ us-east-1 sang ap-southeast-1, có một số vấn đề quan trọng cần xử lý:

### ✅ Đã Sửa

1. **Hardcoded Bedrock Region** - ✅ FIXED
   - File: `cdk/lib/lambda-stack.ts`
   - Thay đổi: `BEDROCK_REGION: 'us-east-1'` → `BEDROCK_REGION: process.env.BEDROCK_REGION || 'us-east-1'`

2. **Hardcoded IAM ARN** - ✅ FIXED
   - File: `cdk/lib/lambda-stack.ts`
   - Thay đổi: Dynamic ARN construction với `${process.env.BEDROCK_REGION || 'us-east-1'}`

3. **S3 URL Hardcode** - ✅ FIXED
   - File: `lambda/shared/avatar-service.ts`
   - Thay đổi: Dynamic region trong S3 URL construction

4. **Deployment Scripts** - ✅ CREATED
   - `scripts/deploy-ap-southeast-1.sh` (Linux/Mac)
   - `scripts/Deploy-ApSoutheast1.ps1` (Windows)
   - `config/ap-southeast-1.env` (Environment config)

### ⚠️ Cần Lưu Ý

1. **Amazon Bedrock Availability**
   - ✅ ap-southeast-1 ĐÃ hỗ trợ Bedrock với Cross-region inference
   - ✅ Models available: Claude 3 Sonnet, Claude 3 Haiku, Claude 3.5 Sonnet
   - ✅ Model access đã được granted
   - 📊 Có thể deploy trực tiếp mà không cần cross-region calls
   - 🚀 Performance: Giảm latency xuống còn ~50-100ms so với trước (+180-250ms)

2. **SSL Certificate cho CloudFront**
   - ⚠️ Certificate PHẢI ở us-east-1 (bất kể deploy region)
   - ✅ Đã cấu hình: `CERTIFICATE_REGION=us-east-1`

3. **Performance Impact**
   - 🚀 AI generation: 2-3s (giống us-east-1 nhờ Bedrock local)
   - 💰 Cost: Không tăng chi phí cross-region
   - ✅ Không cần tăng timeout cho Lambda functions

## Pre-Deployment Checklist

### 🔧 Environment Setup

- [ ] Set AWS credentials cho ap-southeast-1
- [ ] Install AWS CLI và CDK CLI
- [ ] Bootstrap CDK cho ap-southeast-1
- [ ] Bootstrap CDK cho us-east-1 (cho cross-region resources)
- [ ] Set environment variables:
  ```bash
  export AWS_REGION=ap-southeast-1
  export BEDROCK_REGION=ap-southeast-1  # Bedrock đã có tại region này
  export CERTIFICATE_REGION=us-east-1
  ```

### 🧪 Pre-Deployment Tests

- [ ] Test Bedrock access từ ap-southeast-1:
  ```bash
  aws bedrock list-foundation-models --region ap-southeast-1
  ```
- [ ] Verify Model access cho Claude models (Sonnet, Haiku, 3.5 Sonnet)
- [ ] Verify AWS permissions cho cross-region access
- [ ] Test CDK synthesis:
  ```bash
  cd cdk && cdk synth --all
  ```

### 📋 Code Changes Verification

- [ ] Verify `cdk/lib/lambda-stack.ts` có dynamic Bedrock region
- [ ] Verify `lambda/shared/avatar-service.ts` có dynamic S3 URLs
- [ ] Check không còn hardcode `us-east-1` trong code
- [ ] Verify IAM policies có correct regions

## Deployment Process

### 🚀 Option 1: PowerShell Script (Windows)

```powershell
# Run from project root
.\scripts\Deploy-ApSoutheast1.ps1 -Environment prod
```

### 🚀 Option 2: Bash Script (Linux/Mac)

```bash
# Run from project root
chmod +x scripts/deploy-ap-southeast-1.sh
./scripts/deploy-ap-southeast-1.sh
```

### 🚀 Option 3: Manual Deployment

```bash
# Set environment
source config/ap-southeast-1.env

# Deploy
cd cdk
cdk deploy --all --context environment=prod
```

## Post-Deployment Verification

### ✅ Infrastructure Checks

- [ ] Verify DynamoDB table tạo ở ap-southeast-1
- [ ] Verify Cognito User Pool ở ap-southeast-1
- [ ] Verify Lambda functions ở ap-southeast-1
- [ ] Verify API Gateway ở ap-southeast-1
- [ ] Verify S3 bucket ở ap-southeast-1
- [ ] Verify CloudFront distribution (global)

### 🧪 Functionality Tests

- [ ] Test user registration/login
- [ ] Test ingredient validation
- [ ] Test AI suggestions (expect higher latency)
- [ ] Test cooking sessions
- [ ] Test recipe rating
- [ ] Test avatar upload

### 📊 Performance Validation

- [ ] AI suggestions complete trong <8 seconds
- [ ] Database operations <3 seconds
- [ ] API responses <30 seconds
- [ ] Cross-region latency metrics available

### 💰 Cost Monitoring

- [ ] CloudWatch metrics cho cross-region calls
- [ ] Budget alerts configured
- [ ] Cost allocation tags applied
- [ ] Monitor data transfer costs

## Expected Performance Changes

### 🕐 Latency Impact

| Operation | us-east-1 | ap-southeast-1 | Delta |
|-----------|-----------|----------------|-------|
| Database ops | 50-100ms | 50-100ms | No change |
| AI generation | 2-3s | 2-3s | No change (Bedrock local) |
| API calls | 200-500ms | 200-500ms | No change |
| Avatar upload | 1-2s | 1-2s | No change |

### 💸 Cost Impact

| Component | Monthly Cost | Additional Cost |
|-----------|--------------|-----------------|
| Cross-region data | $0 | $0 (không cần nữa) |
| Bedrock calls | $20 | $0 |
| Other services | $120 | $0 |
| **Total** | **$140** | **$0** |

## Troubleshooting

### 🔴 Common Issues

1. **Bedrock Access Denied**
   ```
   Error: User is not authorized to perform: bedrock:InvokeModel
   ```
   **Solution:** Ensure IAM role có permissions cho ap-southeast-1 Bedrock và Model access đã được granted

2. **Certificate Error**
   ```
   Error: Certificate must be in us-east-1 for CloudFront
   ```
   **Solution:** Create certificate ở us-east-1, không phải ap-southeast-1

3. **High Latency**
   ```
   Warning: AI generation taking >10 seconds
   ```
   **Solution:** Kiểm tra lại BEDROCK_REGION có đúng là ap-southeast-1

4. **S3 URL 404**
   ```
   Error: Avatar URL returns 404
   ```
   **Solution:** Check S3 URL format có đúng region

### 🔧 Debug Commands

```bash
# Check deployed resources
aws dynamodb list-tables --region ap-southeast-1
aws cognito-idp list-user-pools --max-results 10 --region ap-southeast-1
aws lambda list-functions --region ap-southeast-1

# Test cross-region Bedrock
aws bedrock list-foundation-models --region ap-southeast-1

# Check CloudFormation stacks
aws cloudformation list-stacks --region ap-southeast-1
```

## Rollback Plan

Nếu cần rollback về us-east-1:

### 📤 Data Export

```bash
# Export DynamoDB
aws dynamodb scan --table-name smart-cooking-data-prod --region ap-southeast-1 > backup.json

# Export Cognito users (if needed)
aws cognito-idp list-users --user-pool-id $USER_POOL_ID --region ap-southeast-1
```

### 🔄 Redeploy to us-east-1

```bash
export AWS_REGION=us-east-1
export CDK_DEFAULT_REGION=us-east-1
export BEDROCK_REGION=us-east-1

cd cdk
cdk deploy --all --context environment=prod
```

### 📥 Data Import

```bash
# Import to us-east-1
aws dynamodb batch-write-item --request-items file://backup.json --region us-east-1
```

## Success Criteria

### ✅ Deployment Success

- [ ] All CloudFormation stacks deployed successfully
- [ ] No errors in Lambda function logs
- [ ] API Gateway returns 200/404 for health checks
- [ ] DynamoDB accessible and functional
- [ ] Cognito authentication working

### ✅ Performance Success

- [ ] AI suggestions complete within 3 seconds
- [ ] Database operations within 3 seconds
- [ ] No timeout errors in CloudWatch logs
- [ ] Bedrock metrics being collected from ap-southeast-1

### ✅ Cost Success

- [ ] Monthly cost không tăng (Bedrock local)
- [ ] Budget alerts configured and working
- [ ] Cost allocation tags applied correctly
- [ ] Không có charges từ cross-region data transfer

## Monitoring Setup

### 📊 CloudWatch Dashboards

- [ ] Bedrock local latency metrics
- [ ] Bedrock call success/failure rates
- [ ] Cost tracking dashboard
- [ ] Performance metrics

### 🚨 Alerts

- [ ] AI timeout rate >10%
- [ ] Bedrock call failures
- [ ] Budget threshold alerts
- [ ] Performance degradation alerts

## Documentation Updates

- [ ] Update API documentation với new endpoints
- [ ] Update deployment guides
- [ ] Update monitoring runbooks
- [ ] Update cost optimization guides

---

## Final Checklist

Trước khi go-live ở ap-southeast-1:

- [ ] ✅ All technical issues resolved
- [ ] ✅ Performance validated
- [ ] ✅ Cost impact acceptable
- [ ] ✅ Monitoring configured
- [ ] ✅ Team trained on new setup
- [ ] ✅ Rollback plan tested
- [ ] ✅ Documentation updated

**Estimated Total Migration Time:** 1-2 hours
**Expected Downtime:** 0 (blue-green deployment)
**Performance Impact:** Không có (Bedrock local)
**Cost Impact:** $0/month additional