# Smart Cooking MVP - Region Migration Guide

## Overview

Hướng dẫn này giúp bạn deploy Smart Cooking MVP ở region ap-southeast-1 (Singapore) thay vì us-east-1 (N. Virginia).

## Các Vấn Đề Cần Lưu Ý

### 1. Amazon Bedrock Availability

**⚠️ QUAN TRỌNG:** Amazon Bedrock chưa có sẵn ở tất cả AWS regions.

**Regions hỗ trợ Bedrock (tính đến 2024):**
- ✅ us-east-1 (N. Virginia)
- ✅ us-west-2 (Oregon) 
- ✅ eu-west-1 (Ireland)
- ❌ ap-southeast-1 (Singapore) - **CHƯA HỖ TRỢ**

**Giải pháp:** Sử dụng cross-region call để gọi Bedrock từ us-east-1 ngay cả khi deploy ở ap-southeast-1.

### 2. SSL Certificate cho CloudFront

CloudFront yêu cầu SSL certificate phải ở region us-east-1, bất kể bạn deploy ở region nào.

### 3. S3 URL Format

S3 URL cần được tạo dynamic theo region thay vì hardcode us-east-1.

## Các File Cần Sửa

### 1. CDK Lambda Stack

**File:** `cdk/lib/lambda-stack.ts`

```typescript
// Thay đổi từ:
BEDROCK_REGION: 'us-east-1',

// Thành:
BEDROCK_REGION: process.env.BEDROCK_REGION || 'us-east-1',
```

```typescript
// Thay đổi IAM policy từ:
resources: [
  `arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`
]

// Thành:
resources: [
  `arn:aws:bedrock:${process.env.BEDROCK_REGION || 'us-east-1'}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`
]
```

### 2. Avatar Service

**File:** `lambda/shared/avatar-service.ts`

```typescript
// Thay đổi từ:
const avatarUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${avatarKey}`;

// Thành:
const region = process.env.AWS_REGION || 'us-east-1';
const avatarUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${avatarKey}`;
```

### 3. Environment Variables

**File:** `.env` hoặc deployment config

```bash
# Region chính cho deployment
AWS_REGION=ap-southeast-1
CDK_DEFAULT_REGION=ap-southeast-1

# Region cho Bedrock (vẫn giữ us-east-1 vì ap-southeast-1 chưa hỗ trợ)
BEDROCK_REGION=us-east-1

# Certificate region (luôn phải là us-east-1 cho CloudFront)
CERTIFICATE_REGION=us-east-1
```

## Deployment Steps

### 1. Cập nhật CDK Configuration

```bash
# Set environment variables
export AWS_REGION=ap-southeast-1
export CDK_DEFAULT_REGION=ap-southeast-1
export BEDROCK_REGION=us-east-1
```

### 2. Deploy Infrastructure

```bash
cd cdk

# Bootstrap CDK cho region mới (nếu chưa làm)
npx cdk bootstrap aws://ACCOUNT-ID/ap-southeast-1

# Deploy với region mới
npx cdk deploy --all
```

### 3. Verify Deployment

```bash
# Check stack status
npx cdk list

# Verify resources in correct region
aws dynamodb list-tables --region ap-southeast-1
aws cognito-idp list-user-pools --max-results 10 --region ap-southeast-1
```

## Testing Cross-Region Bedrock

### Test Script

```javascript
// test-bedrock-cross-region.js
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

async function testBedrockCrossRegion() {
  // Client ở ap-southeast-1 nhưng gọi Bedrock ở us-east-1
  const client = new BedrockRuntimeClient({ 
    region: 'us-east-1' // Bedrock region
  });

  const input = {
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: 'Test message from ap-southeast-1'
      }]
    })
  };

  try {
    const response = await client.send(new InvokeModelCommand(input));
    console.log('✅ Bedrock cross-region call successful');
    return true;
  } catch (error) {
    console.error('❌ Bedrock cross-region call failed:', error);
    return false;
  }
}

testBedrockCrossRegion();
```

## Performance Considerations

### 1. Latency Impact

**Cross-region Bedrock calls:**
- ap-southeast-1 → us-east-1: ~180-250ms additional latency
- Tổng thời gian AI generation: 3-5 seconds (thay vì 2-3 seconds)

**Mitigation strategies:**
- Tăng timeout cho AI Lambda function
- Implement caching cho frequent requests
- Optimize prompt để giảm response time

### 2. Cost Impact

**Cross-region data transfer:**
- Bedrock requests: ~$0.02/GB outbound từ us-east-1
- Typical AI request: ~1-2KB → negligible cost
- Monthly impact: < $1 cho 10,000 requests

## Monitoring Adjustments

### CloudWatch Metrics

Update monitoring để track cross-region performance:

```typescript
// Add custom metrics for cross-region latency
const crossRegionLatencyMetric = new cloudwatch.Metric({
  namespace: 'SmartCooking/CrossRegion',
  metricName: 'BedrockLatency',
  dimensionsMap: {
    SourceRegion: 'ap-southeast-1',
    TargetRegion: 'us-east-1'
  }
});
```

### Alarms

Adjust alarm thresholds cho cross-region latency:

```typescript
// Increase timeout thresholds
const aiDurationAlarm = new cloudwatch.Alarm(this, 'AIDurationAlarm', {
  threshold: 8000, // Tăng từ 5000ms lên 8000ms
  // ... other config
});
```

## Rollback Plan

Nếu cần rollback về us-east-1:

### 1. Data Migration

```bash
# Export DynamoDB data
aws dynamodb scan --table-name smart-cooking-data-prod --region ap-southeast-1 > backup.json

# Import to us-east-1
aws dynamodb batch-write-item --request-items file://backup.json --region us-east-1
```

### 2. DNS Update

```bash
# Update Route 53 records to point to us-east-1 resources
aws route53 change-resource-record-sets --hosted-zone-id Z123456789 --change-batch file://dns-change.json
```

## Checklist

### Pre-Deployment
- [ ] Verify Bedrock availability in target region
- [ ] Update all hardcoded regions in code
- [ ] Set environment variables correctly
- [ ] Test cross-region Bedrock calls
- [ ] Update monitoring thresholds

### Post-Deployment
- [ ] Verify all resources in correct region
- [ ] Test complete user journey
- [ ] Monitor cross-region latency
- [ ] Check cost impact
- [ ] Update documentation

### Performance Validation
- [ ] AI suggestions < 8 seconds
- [ ] Database operations < 3 seconds
- [ ] API responses < 30 seconds
- [ ] Cross-region metrics available

## Troubleshooting

### Common Issues

1. **Bedrock Access Denied**
   ```
   Error: AccessDeniedException: User is not authorized to perform: bedrock:InvokeModel
   ```
   **Solution:** Ensure IAM role has permissions for us-east-1 Bedrock resources

2. **S3 URL 404 Errors**
   ```
   Error: 404 Not Found for avatar URL
   ```
   **Solution:** Update S3 URL format to use correct region

3. **Certificate Issues**
   ```
   Error: Certificate must be in us-east-1 for CloudFront
   ```
   **Solution:** Create/import certificate in us-east-1 regardless of deployment region

4. **High Latency**
   ```
   Warning: AI generation taking > 10 seconds
   ```
   **Solution:** Normal for cross-region calls, adjust timeouts accordingly

## Support

Nếu gặp vấn đề khi migrate region:

1. Check AWS service availability: https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/
2. Review AWS documentation for cross-region best practices
3. Monitor CloudWatch logs for specific error messages
4. Test individual components before full deployment