# 🏗️ Smart Cooking - AWS CDK Infrastructure

> **Infrastructure as Code** cho Smart Cooking App - Nền tảng nấu ăn thông minh với AI

Thư mục này chứa toàn bộ **AWS CDK infrastructure** được viết bằng TypeScript để triển khai Smart Cooking lên AWS Cloud. CDK giúp định nghĩa infrastructure dưới dạng code, tự động hóa deployment, và quản lý tài nguyên AWS một cách nhất quán.

---

## 📋 Tổng Quan Kiến Trúc

Smart Cooking sử dụng **kiến trúc serverless** để tối ưu chi phí và khả năng mở rộng:

```
┌─────────────────────────────────────────────────────────────────┐
│                        USERS (Web/Mobile)                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  CloudFront CDN + S3 (Static Website - Next.js)                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  API Gateway (REST API) + Cognito Auth                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Lambda Functions (Node.js 18) - Business Logic                 │
│  ├── User Profile Management                                     │
│  ├── AI Recipe Suggestions (Bedrock)                            │
│  ├── Ingredient Validation & Search                             │
│  ├── Recipe & Rating Management                                 │
│  └── Abuse Tracking & Auto-Suspension                           │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  DynamoDB (Single-Table Design) + DynamoDB Streams              │
│  └── GSI1, GSI2, GSI3, GSI4 + TTL for auto-cleanup              │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  CloudWatch (Monitoring) + SNS (Alerts) + EventBridge           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧱 CDK Stacks (Infrastructure Components)

Infrastructure được chia thành **11 stacks độc lập**, mỗi stack quản lý một phần cụ thể:

### 1. **SimpleStack** (`simple-stack.ts`)
**Main orchestration stack** - Tổng hợp tất cả các stack con lại

**Chức năng:**
- Khởi tạo và kết nối tất cả các stack con
- Quản lý dependencies giữa các stack
- Export outputs (API URL, User Pool ID, CloudFront domain, etc.)

**Sử dụng khi nào:** Deploy toàn bộ hệ thống với 1 lệnh

---

### 2. **DatabaseStack** (`database-stack.ts`)
**DynamoDB single-table design** với 4 GSI indexes

**Resources:**
- **DynamoDB Table**: `smart-cooking-data-{env}`
  - Partition Key: `PK` (String)
  - Sort Key: `SK` (String)
  - Billing: Pay-per-request (on-demand)
  - **TTL enabled**: Field `ttl` để tự động xóa ACTIVE_SUSPENSION records
  - **Streams enabled**: `NEW_AND_OLD_IMAGES` để trigger Lambda auto-unsuspend

**Global Secondary Indexes:**
- **GSI1**: User search, ingredient lookup
- **GSI2**: Recipe by category, trending recipes
- **GSI3**: Time-based queries (recent activities)
- **GSI4**: Reverse friendship, sparse notification index

**Tính năng:**
- Point-in-time recovery (prod only)
- Auto-scaling (nếu cần)
- CloudWatch Contributor Insights

---

### 3. **AuthStack** (`auth-stack.ts`)
**Cognito User Pool** cho authentication & authorization

**Resources:**
- **User Pool**: Email-based sign-up
  - Password policy: min 8 chars, uppercase, lowercase, digits
  - Email verification required
  - MFA optional (TOTP)
- **User Pool Client**: Frontend app client
- **Lambda Trigger**: Post-authentication để tạo user profile
- **User Pool Groups**: `admin`, `moderator` (role-based access)

**Attributes:**
- Standard: email, name
- Custom: `custom:role`, `custom:account_status`

---

### 4. **LambdaStack** (`lambda-stack.ts`)
**12+ Lambda functions** xử lý business logic

**Functions (Production):**

| Function | Runtime | Memory | Timeout | Mô tả |
|----------|---------|--------|---------|-------|
| `auth-handler` | Node 18 | 256MB | 10s | Post-auth user setup |
| `user-profile` | Node 18 | 512MB | 30s | CRUD user profiles |
| `ingredient-validator` | Node 18 | 512MB | 30s | Fuzzy matching ingredients |
| `ai-suggestion` | Node 18 | 1024MB | 60s | AI recipe suggestions (Bedrock) |
| `cooking-session` | Node 18 | 256MB | 30s | Track cooking sessions |
| `rating` | Node 18 | 256MB | 15s | Recipe rating & auto-approval |
| `recipe` | Node 18 | 512MB | 30s | Recipe CRUD & search |
| `suspension-stream-processor` | Node 18 | 256MB | 10s | Auto-unsuspend via Streams |

**IAM Permissions:**
- DynamoDB: Read/Write với least privilege
- Bedrock: InvokeModel cho AI functions
- SES: SendEmail cho notifications
- CloudWatch: Logs & Metrics

**Lambda Layers:**
- Shared utilities (DynamoDB helpers, validation, etc.)
- AWS SDK v3 optimized

---

### 5. **ApiStack** (`api-stack.ts`)
**API Gateway REST API** với Cognito authorizer

**Endpoints:**
```
POST   /auth/profile          - Create user profile
GET    /auth/profile          - Get user profile
PUT    /auth/profile          - Update profile
DELETE /auth/profile          - Soft delete

POST   /ingredients/validate  - Validate & normalize ingredients
GET    /ingredients/search    - Search master ingredients

POST   /ai/suggestions        - Get AI recipe suggestions
POST   /ai/chat              - Conversational AI

POST   /recipes               - Create recipe
GET    /recipes/{id}         - Get recipe
PUT    /recipes/{id}         - Update recipe
DELETE /recipes/{id}         - Delete recipe
GET    /recipes/search       - Search recipes

POST   /sessions             - Start cooking session
PUT    /sessions/{id}        - Update session
POST   /sessions/{id}/rate   - Rate recipe

GET    /admin/users          - List all users (admin only)
PUT    /admin/users/{id}/suspend - Suspend user
PUT    /admin/users/{id}/unsuspend - Unsuspend user
```

**Security:**
- Cognito JWT authorizer
- API Gateway Usage Plans & API Keys (optional)
- CORS configuration
- Request validation
- Rate limiting: 1000 req/s burst, 500 req/s steady

---

### 6. **FrontendStack** (`frontend-stack.ts`)
**S3 + CloudFront** cho Next.js static site

**Resources:**
- **S3 Bucket**: Static website hosting
  - Block public access (CloudFront only)
  - Versioning enabled (prod)
  - Lifecycle policies
- **CloudFront Distribution**:
  - HTTPS only
  - Custom domain (Route 53)
  - ACM SSL certificate (auto-provisioned)
  - Cache behaviors (TTL optimization)
  - Error pages (404, 403)

**Deployment:**
- Next.js `out/` folder được sync lên S3
- CloudFront invalidation tự động

---

### 7. **MonitoringStack** (`monitoring-stack.ts`)
**CloudWatch Dashboards & Alarms**

**Dashboards:**
- **API Dashboard**: Request count, latency, errors
- **Lambda Dashboard**: Invocations, duration, errors, throttles
- **DynamoDB Dashboard**: Read/write capacity, throttles
- **Cost Dashboard**: Estimated daily costs

**Alarms:**
- API 5xx errors > 10 in 5 mins → SNS alert
- Lambda errors > 5% → SNS alert
- DynamoDB throttles > 0 → SNS alert
- Daily cost > $50 (dev) / $200 (prod) → Email alert

**SNS Topic:**
- Email subscriptions cho admin
- Slack integration (optional)

---

### 8. **AbuseTrackingStack** (`abuse-tracking-stack.ts`) 🆕
**3-tier violation tracking & auto-suspension system**

**Chức năng:**
- Track vi phạm người dùng (spam, abuse, invalid data)
- **3-tier progressive penalties:**
  - **Tier 1**: 5 violations trong 1 giờ → suspend 1 giờ
  - **Tier 2**: 15 violations trong 1 ngày → suspend 1 ngày
  - **Tier 3**: 30 violations trong 30 ngày → suspend 30 ngày
- **Auto-unsuspend** qua DynamoDB TTL + Streams
- Admin override & manual unsuspend

**Resources:**
- `suspension-stream-processor` Lambda
- CloudWatch abuse metrics & dashboard
- Alarms cho high violation rates

**Flow:**
1. Vi phạm được ghi vào `VIOLATION` records
2. Check thresholds (rolling windows)
3. Tạo `ACTIVE_SUSPENSION` với `ttl` = unsuspend time
4. TTL tự động xóa record → trigger DynamoDB Stream
5. Stream processor Lambda unsuspend user & send email

---

### 9. **StorageStack** (`storage-stack.ts`)
**S3 buckets** cho user-generated content

**Buckets:**
- **User Content Bucket**: Recipe images, avatars
  - Public read (CloudFront only)
  - Pre-signed URLs cho upload
  - Image optimization (Lambda@Edge)
  - Lifecycle: Delete after 90 days (unclaimed)

---

### 10. **CostOptimization** (`cost-optimization.ts`)
**Budget alerts & cost controls**

**Features:**
- AWS Budgets: $50 (dev), $200 (prod)
- Alerts at 80%, 100%, 120%
- Lambda log retention policies (7 days dev, 30 days prod)
- DynamoDB on-demand billing
- S3 lifecycle policies

---

### 11. **MainStack** (`main-stack.ts`)
**Legacy orchestration** (đang migrate sang SimpleStack)

---

## 🎯 Deployment Modes

CDK hỗ trợ 2 môi trường: `dev` và `prod` với config khác nhau


### 📊 Environment Comparison

| Feature | Development (`dev`) | Production (`prod`) |
|---------|-------------------|-------------------|
| **Domain** | `dev.smartcooking.local` | `smartcooking.com` |
| **Budget** | $50/month | $200/month |
| **DynamoDB PITR** | ❌ Disabled | ✅ Enabled |
| **Log Retention** | 7 days | 30 days |
| **S3 Versioning** | ❌ Disabled | ✅ Enabled |
| **WAF** | ❌ Disabled | ✅ Enabled (optional) |
| **Deletion Policy** | DESTROY | RETAIN |
| **Cognito MFA** | Optional | Recommended |
| **CloudWatch Alarms** | Basic | Comprehensive |

---

## 🚀 Quick Start

### Bước 1: Prerequisites (Yêu cầu)

Cài đặt các công cụ sau:

```bash
# Node.js 18+ (khuyến nghị dùng nvm)
node --version  # v18.x hoặc v20.x

# AWS CLI v2
aws --version

# Configure AWS credentials
aws configure
# Nhập: AWS Access Key ID, Secret Key, Region (ap-southeast-1)

# AWS CDK CLI
npm install -g aws-cdk
cdk --version  # 2.100.0+
```

### Bước 2: Bootstrap CDK (Lần đầu tiên)

CDK cần setup tài nguyên ban đầu trong AWS account:

```bash
cd cdk

# Bootstrap cho region ap-southeast-1
cdk bootstrap aws://ACCOUNT-ID/ap-southeast-1

# Hoặc tự động detect account
cdk bootstrap
```

**Output:** Tạo CloudFormation stack `CDKToolkit` với S3 bucket và ECR repo

### Bước 3: Install Dependencies

```bash
# Cài đặt CDK dependencies
npm install

# Build TypeScript
npm run build
```

### Bước 4: Deploy to Development

```bash
# Synthesize templates (kiểm tra)
npx cdk synth -c env=dev

# Deploy tất cả stacks
npx cdk deploy SmartCooking-dev-Simple -c env=dev

# Hoặc deploy từng stack riêng lẻ
npx cdk deploy SmartCooking-dev-Simple/Monitoring -c env=dev
```

**Thời gian:** ~15-20 phút cho lần deploy đầu tiên

### Bước 5: Verify Deployment

```bash
# List stacks đã deploy
cdk list -c env=dev

# Xem outputs (API URL, User Pool ID, etc.)
npx cdk deploy --outputs-file outputs.json -c env=dev

# Test API endpoint
curl https://YOUR-API-ID.execute-api.ap-southeast-1.amazonaws.com/prod/health
```

---

## 📝 CDK Commands Cheat Sheet

### Build & Synth

```bash
# Compile TypeScript
npm run build

# Watch mode (auto compile khi save)
npm run watch

# Synthesize CloudFormation templates
npx cdk synth -c env=dev

# Synth specific stack
npx cdk synth SmartCooking-dev-Simple -c env=dev
```

### Deploy

```bash
# Deploy all stacks (dev)
npx cdk deploy SmartCooking-dev-Simple -c env=dev

# Deploy với auto-approval (CI/CD)
npx cdk deploy SmartCooking-dev-Simple --require-approval never -c env=dev

# Deploy specific nested stack
npx cdk deploy SmartCooking-dev-Simple/Monitoring -c env=dev

# Deploy to production
npx cdk deploy SmartCooking-prod-Simple -c env=prod

# Deploy with outputs file
npx cdk deploy --outputs-file cdk-outputs.json -c env=dev
```

### Diff & Planning

```bash
# Xem thay đổi trước khi deploy
npx cdk diff -c env=dev

# Xem thay đổi của specific stack
npx cdk diff SmartCooking-dev-Simple -c env=dev
```

### Destroy

```bash
# Xóa tất cả resources (CẢNH BÁO!)
npx cdk destroy SmartCooking-dev-Simple -c env=dev

# Xóa với force (không hỏi confirmation)
npx cdk destroy SmartCooking-dev-Simple -c env=dev --force
```

### Utilities

```bash
# List all stacks
npx cdk list -c env=dev

# Show metadata
npx cdk metadata SmartCooking-dev-Simple -c env=dev

# Show context values
npx cdk context

# Clear context cache
npx cdk context --clear
```

---

## 🔧 Configuration & Customization

### Environment Variables

CDK sử dụng context values (`-c env=dev`) để switch giữa dev/prod.

**Config location:** `cdk/bin/app.ts`

```typescript
const envConfig = {
  dev: {
    environment: 'dev',
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-southeast-1',
    alertEmail: 'alerts@smartcooking.local',
    budget: 50, // USD
  },
  prod: {
    environment: 'prod',
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-southeast-1',
    alertEmail: 'alerts@smartcooking.com',
    budget: 200,
    domainName: 'smartcooking.com', // Update với domain thật
  }
};
```

### Custom Domain Setup (Production)

**Bước 1:** Mua domain và tạo Route 53 Hosted Zone

```bash
# Tạo hosted zone (qua Console hoặc CLI)
aws route53 create-hosted-zone --name smartcooking.com
```

**Bước 2:** Update `bin/app.ts`

```typescript
prod: {
  domainName: 'smartcooking.com',  // Domain của bạn
  hostedZoneId: 'Z1234567890ABC',  // Từ Route 53
}
```

**Bước 3:** Deploy (CDK tự tạo SSL certificate)

```bash
npx cdk deploy SmartCooking-prod-Simple -c env=prod
```

**Bước 4:** Validate certificate qua email hoặc DNS

CDK sẽ tạo ACM certificate và đợi validation. Check email hoặc thêm CNAME record.

### Lambda Function Configuration

**Update memory/timeout:** `cdk/lib/lambda-stack.ts`

```typescript
const aiSuggestionFn = new lambda.Function(this, 'AISuggestion', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('../lambda/ai-suggestion'),
  memorySize: 1024,  // Tăng lên 2048 nếu AI chậm
  timeout: Duration.seconds(60),  // Tăng lên 120s nếu cần
});
```

### DynamoDB Capacity Mode

**Chuyển từ On-Demand sang Provisioned:**

`cdk/lib/database-stack.ts`

```typescript
this.table = new dynamodb.Table(this, 'SmartCookingTable', {
  billingMode: dynamodb.BillingMode.PROVISIONED,
  readCapacity: 5,   // RCU
  writeCapacity: 5,  // WCU
});
```

**Auto-scaling:**

```typescript
const readScaling = this.table.autoScaleReadCapacity({
  minCapacity: 5,
  maxCapacity: 100,
});

readScaling.scaleOnUtilization({
  targetUtilizationPercent: 70,
});
```

### Monitoring Alerts

**Thay đổi email nhận alerts:** `cdk/lib/monitoring-stack.ts`

```typescript
const alertTopic = new sns.Topic(this, 'AlertTopic');
alertTopic.addSubscription(
  new subscriptions.EmailSubscription('your-email@example.com')
);
```

---

## 🎯 Deployment Strategies

### Development Workflow

```bash
# 1. Code thay đổi ở lambda/
# 2. Build lambda
cd lambda/ai-suggestion
npm run build

# 3. Quay về CDK
cd ../../cdk

# 4. Xem thay đổi
npx cdk diff -c env=dev

# 5. Deploy
npx cdk deploy SmartCooking-dev-Simple -c env=dev
```

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy-dev.yml
name: Deploy to Dev
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install CDK
        run: npm install -g aws-cdk
      
      - name: CDK Deploy
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          cd cdk
          npm install
          npm run build
          cdk deploy SmartCooking-dev-Simple --require-approval never -c env=dev
```

### Blue-Green Deployment

Để deploy production an toàn:

```bash
# 1. Deploy stack mới (green)
npx cdk deploy SmartCooking-prod-Simple-v2 -c env=prod

# 2. Test green environment
curl https://api-v2.smartcooking.com/health

# 3. Switch traffic (update Route 53 hoặc CloudFront)
# 4. Monitor errors
# 5. Rollback nếu cần (switch back)

# 6. Destroy old stack (blue) sau vài ngày
npx cdk destroy SmartCooking-prod-Simple -c env=prod
```

---

## 🔍 Monitoring & Troubleshooting

### CloudWatch Dashboards

CDK tạo sẵn các dashboards:

1. **API Performance Dashboard**
   - Request count, latency (p50, p99), error rate
   - URL: CloudWatch Console → Dashboards → `SmartCooking-dev-API`

2. **Lambda Insights Dashboard**
   - Invocations, duration, concurrent executions
   - Cold starts, throttles, errors

3. **DynamoDB Dashboard**
   - Read/write capacity, throttles
   - GSI metrics

4. **Abuse Tracking Dashboard** 🆕
   - Violation rates, active suspensions
   - Auto-unsuspend metrics

### CloudWatch Logs

```bash
# View logs cho specific Lambda
aws logs tail /aws/lambda/SmartCooking-dev-ai-suggestion --follow

# Search logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/SmartCooking-dev-ai-suggestion \
  --filter-pattern "ERROR"

# Export logs to S3 (archival)
aws logs create-export-task \
  --log-group-name /aws/lambda/SmartCooking-dev-ai-suggestion \
  --from 1609459200000 \
  --to 1612137600000 \
  --destination smart-cooking-logs
```

### Common Issues

#### 1. **Bootstrap Error: "CDKToolkit stack not found"**

```bash
# Solution: Bootstrap lại
cdk bootstrap aws://ACCOUNT-ID/ap-southeast-1
```

#### 2. **Permission Denied: "User is not authorized"**

IAM user cần các permissions:
- CloudFormation: Full access
- S3: CreateBucket, PutObject
- Lambda: CreateFunction, UpdateFunctionCode
- DynamoDB: CreateTable, UpdateTable
- API Gateway: CreateRestApi
- Cognito: CreateUserPool

```bash
# Attach managed policy
aws iam attach-user-policy \
  --user-name cdk-deployer \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

#### 3. **Domain Validation Timeout**

ACM certificate cần validate trong 72 giờ:

```bash
# Check certificate status
aws acm describe-certificate --certificate-arn arn:aws:acm:...

# Nếu DNS validation: Thêm CNAME record vào Route 53
# Nếu Email validation: Check email và click link
```

#### 4. **Lambda Deployment Package Too Large**

```bash
# Error: Unzipped size must be smaller than 262144000 bytes

# Solution 1: Sử dụng Lambda Layers
# Solution 2: Optimize dependencies (remove dev deps)
cd lambda/ai-suggestion
npm prune --production

# Solution 3: Use external dependencies layer
```

#### 5. **DynamoDB Throttling**

```bash
# Check metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --dimensions Name=TableName,Value=smart-cooking-data-dev

# Solution: Switch to on-demand hoặc increase provisioned capacity
```

#### 6. **API Gateway 502 Bad Gateway**

Lambda function timeout hoặc crash:

```bash
# Check Lambda logs
aws logs tail /aws/lambda/FUNCTION-NAME --follow

# Increase Lambda timeout
# Update memory allocation
```

---

## 💰 Cost Estimation

**Development Environment (~$20-30/month):**
- DynamoDB: $5-10 (on-demand)
- Lambda: $2-5 (1M invocations)
- API Gateway: $3-5 (1M requests)
- S3 + CloudFront: $1-3
- Cognito: Free tier (50k MAU)
- CloudWatch: $2-5

**Production Environment (~$100-150/month @ 10k users):**
- DynamoDB: $30-50
- Lambda: $10-20
- API Gateway: $15-25
- S3 + CloudFront: $10-20
- Cognito: $10-15 (beyond free tier)
- CloudWatch: $5-10
- Data Transfer: $10-20

**Cost Optimization Tips:**
- Sử dụng DynamoDB on-demand cho traffic thấp
- Enable CloudFront caching (giảm API calls)
- Optimize Lambda memory (test với Lambda Power Tuning)
- Clean up unused CloudWatch log streams
- Use S3 Intelligent-Tiering

---

## 🔐 Security Best Practices

### 1. IAM Least Privilege

```typescript
// Lambda IAM role - chỉ cho phép read/write items cụ thể
const lambdaRole = new iam.Role(this, 'LambdaRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
});

table.grantReadWriteData(lambdaRole);  // ✅ Tốt
// table.grant(lambdaRole, '*');       // ❌ Tránh wildcard
```

### 2. API Gateway Throttling

```typescript
const api = new apigateway.RestApi(this, 'API', {
  deployOptions: {
    throttlingRateLimit: 1000,   // requests/second
    throttlingBurstLimit: 2000,  // burst capacity
  },
});
```

### 3. Cognito Advanced Security

```typescript
const userPool = new cognito.UserPool(this, 'UserPool', {
  advancedSecurityMode: cognito.AdvancedSecurityMode.ENFORCED,  // Detect suspicious activity
  mfa: cognito.Mfa.OPTIONAL,
  mfaSecondFactor: {
    sms: false,
    otp: true,  // TOTP apps (Google Authenticator)
  },
});
```

### 4. S3 Bucket Security

```typescript
const bucket = new s3.Bucket(this, 'Bucket', {
  encryption: s3.BucketEncryption.S3_MANAGED,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  versioning: true,  // Protect against accidental deletion
  lifecycleRules: [{
    noncurrentVersionExpiration: Duration.days(30),
  }],
});
```

### 5. Secrets Management

```bash
# Store API keys trong Secrets Manager
aws secretsmanager create-secret \
  --name smartcooking/bedrock-api-key \
  --secret-string "your-api-key"

# Access trong Lambda
const secret = await secretsManager.getSecretValue({
  SecretId: 'smartcooking/bedrock-api-key'
}).promise();
```

---

## 📚 Additional Resources

### AWS Documentation
- [CDK Developer Guide](https://docs.aws.amazon.com/cdk/latest/guide/home.html)
- [CDK API Reference](https://docs.aws.amazon.com/cdk/api/v2/)
- [Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [DynamoDB Single-Table Design](https://aws.amazon.com/blogs/compute/creating-a-single-table-design-with-amazon-dynamodb/)

### Smart Cooking Docs
- [Project README](../README.md) - Tổng quan project
- [Database Schema](../docs/dynamodb/SCHEMA.md) - DynamoDB schema chi tiết
- [API Documentation](../docs/api-gateway/README.md) - API endpoints
- [Lambda Functions](../docs/lambda/README.md) - Lambda function specs
- [Abuse Tracking](../docs/abuse-tracking/README.md) - Vi phạm & suspension system

### CDK Examples
- [AWS CDK Examples](https://github.com/aws-samples/aws-cdk-examples)
- [CDK Patterns](https://cdkpatterns.com/)

---

## 🤝 Contributing

Để thêm stack hoặc resource mới:

1. **Tạo file stack:** `cdk/lib/new-stack.ts`
2. **Implement construct:**
   ```typescript
   export class NewStack extends Construct {
     constructor(scope: Construct, id: string, props: NewStackProps) {
       super(scope, id);
       // Add resources here
     }
   }
   ```
3. **Add to SimpleStack:** Import và instantiate
4. **Test:** `npx cdk synth` và `npx cdk diff`
5. **Deploy:** `npx cdk deploy`
6. **Update docs:** Document trong README.md

---

## 📄 License

MIT License - see [LICENSE](../LICENSE) file

---

## 💬 Support

**Issues hoặc questions?**

1. **Check CloudWatch Logs:** Lambda errors, API Gateway logs
2. **Review CloudFormation Events:** AWS Console → CloudFormation → Events
3. **CDK Diff:** `npx cdk diff` để xem thay đổi
4. **AWS Support:** Premium support plan (nếu có)
5. **GitHub Issues:** Create issue với logs và error details

---

**📅 Last Updated:** October 8, 2025  
**🏗️ CDK Version:** 2.100.0  
**⚡ Status:** Production Ready (MVP Complete)