# Deploy Smart Cooking MVP với Domain smartcooking.com

**Date:** October 6, 2025  
**Domain:** smartcooking.com  
**Architecture:** 100% ap-southeast-1  
**Status:** READY FOR DEPLOYMENT

---

## 🎯 **Pre-Deployment Checklist**

### ✅ **Domain Requirements**
- [ ] **Own domain `smartcooking.com`** (hoặc domain khác bạn muốn)
- [ ] **Access to domain registrar** (GoDaddy, Namecheap, etc.)
- [ ] **AWS Account** với permissions đầy đủ
- [ ] **AWS CLI configured** với ap-southeast-1

### ✅ **Technical Requirements**
- [ ] **Node.js 18+** installed
- [ ] **AWS CDK** installed (`npm install -g aws-cdk`)
- [ ] **Git repository** up to date
- [ ] **Environment variables** ready

---

## 🚀 **Deployment Steps**

### **Step 1: Verify Environment**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check region
aws configure get region
# Should return: ap-southeast-1

# Check CDK version
cdk --version
```

### **Step 2: Set Domain Configuration**
```bash
# Option A: Use smartcooking.com (default)
export DOMAIN_NAME=smartcooking.com

# Option B: Use your own domain
export DOMAIN_NAME=yourdomain.com

# Create hosted zone (set to false if you already have one)
export CREATE_HOSTED_ZONE=true
```

### **Step 3: Deploy with Custom Domain**

#### **Option A: Using Bash Script (Linux/Mac/WSL)**
```bash
# Make script executable (if needed)
chmod +x scripts/deploy-with-custom-domain.sh

# Deploy with smartcooking.com
./scripts/deploy-with-custom-domain.sh --domain smartcooking.com

# Or deploy with your domain
./scripts/deploy-with-custom-domain.sh --domain yourdomain.com
```

#### **Option B: Using PowerShell Script (Windows)**
```powershell
# Deploy with smartcooking.com
.\scripts\Deploy-WithCustomDomain.ps1 -Domain smartcooking.com

# Or deploy with your domain
.\scripts\Deploy-WithCustomDomain.ps1 -Domain yourdomain.com
```

#### **Option C: Manual CDK Deployment**
```bash
# Set environment variables
export AWS_REGION=ap-southeast-1
export CDK_DEFAULT_REGION=ap-southeast-1
export BEDROCK_REGION=ap-southeast-1
export ENVIRONMENT=prod
export DOMAIN_NAME=smartcooking.com
export CREATE_HOSTED_ZONE=true

# Navigate to CDK directory
cd cdk

# Install dependencies
npm install

# Bootstrap CDK (if not done before)
cdk bootstrap

# Deploy all stacks
cdk deploy --all --require-approval never --context environment=prod
```

---

## 📊 **Expected Deployment Output**

### **CDK Outputs**
```bash
✅ SmartCooking-prod.WebsiteUrl = https://smartcooking.com
✅ SmartCooking-prod.CloudFrontDistributionId = E1234567890ABC
✅ SmartCooking-prod.CertificateArn = arn:aws:acm:ap-southeast-1:123456789012:certificate/12345678-1234-1234-1234-123456789012
✅ SmartCooking-prod.HostedZoneId = Z1234567890ABC
✅ SmartCooking-prod.NameServers = ns-1234.awsdns-12.org, ns-5678.awsdns-34.net, ns-9012.awsdns-56.co.uk, ns-3456.awsdns-78.com
```

### **Resources Created**
- ✅ **Route 53 Hosted Zone** for smartcooking.com
- ✅ **SSL Certificate** at ap-southeast-1 (auto-replicated to us-east-1)
- ✅ **CloudFront Distribution** with custom domain
- ✅ **DynamoDB Table** at ap-southeast-1
- ✅ **Lambda Functions** at ap-southeast-1 (with local Bedrock)
- ✅ **API Gateway** at ap-southeast-1
- ✅ **S3 Buckets** at ap-southeast-1
- ✅ **Cognito User Pool** at ap-southeast-1

---

## 🌐 **Post-Deployment Configuration**

### **Step 1: Update Domain Name Servers**

**QUAN TRỌNG:** Bạn cần update name servers tại domain registrar

1. **Copy name servers** từ CDK output:
   ```
   ns-1234.awsdns-12.org
   ns-5678.awsdns-34.net
   ns-9012.awsdns-56.co.uk
   ns-3456.awsdns-78.com
   ```

2. **Login to domain registrar** (GoDaddy, Namecheap, etc.)

3. **Update DNS settings:**
   - Go to DNS Management
   - Replace existing name servers with AWS name servers
   - Save changes

4. **Wait for propagation:** 24-48 hours (usually faster)

### **Step 2: Verify SSL Certificate**

1. **Check ACM Console** (ap-southeast-1):
   - Go to AWS Certificate Manager
   - Verify certificate status is "Issued"
   - Usually takes 5-10 minutes after DNS propagation

2. **Check CloudFront Distribution:**
   - Go to CloudFront Console
   - Verify distribution status is "Deployed"
   - Check custom domain is configured

### **Step 3: Test Domain Access**

```bash
# Test domain resolution
nslookup smartcooking.com

# Test HTTPS access
curl -I https://smartcooking.com
curl -I https://www.smartcooking.com

# Expected: HTTP 200 OK with CloudFront headers
```

---

## 🧪 **Verification Checklist**

### **Domain & SSL**
- [ ] **https://smartcooking.com** loads successfully
- [ ] **https://www.smartcooking.com** loads successfully
- [ ] **SSL certificate** shows as valid (green lock icon)
- [ ] **Certificate issued by** Amazon

### **Application Functionality**
- [ ] **Frontend loads** without errors
- [ ] **User registration** works
- [ ] **User login** works
- [ ] **AI suggestions** work (< 3 seconds response time)
- [ ] **Ingredient validation** works

### **Performance**
- [ ] **Page load time** < 2 seconds
- [ ] **AI generation time** < 3 seconds
- [ ] **API response time** < 500ms
- [ ] **CloudFront caching** working (check headers)

### **Monitoring**
- [ ] **CloudWatch dashboards** showing data
- [ ] **Cost tracking** active
- [ ] **Performance metrics** collecting
- [ ] **Error monitoring** active

---

## 💰 **Cost Breakdown**

### **Monthly Costs (Estimated)**
| Service | Cost | Notes |
|---------|------|-------|
| **DynamoDB** | $22 | On-demand pricing |
| **Lambda** | $28 | Optimized memory allocation |
| **API Gateway** | $15 | Request-based pricing |
| **S3** | $5 | Storage + requests |
| **CloudFront** | $3 | CDN distribution |
| **Route 53** | $0.50 | Hosted zone |
| **Certificate** | $0 | Free with ACM |
| **Cognito** | $0 | Free tier |
| **CloudWatch** | $2 | Basic monitoring |
| **Total** | **$75.50** | **47% reduction from original** |

### **Cost Optimization Benefits**
- **Original cost:** $140/month
- **After Task 11.2:** $89/month (39% reduction)
- **After Bedrock local:** $75/month (46% reduction)
- **With custom domain:** $75.50/month (47% reduction)
- **Total savings:** $64.50/month

---

## 🔧 **Troubleshooting**

### **Common Issues**

#### **1. Domain Not Resolving**
```bash
# Check name servers
dig NS smartcooking.com

# Should return AWS name servers
# If not, check domain registrar settings
```

#### **2. SSL Certificate Pending**
```bash
# Check certificate validation
aws acm describe-certificate --certificate-arn <certificate-arn> --region ap-southeast-1

# If pending, check DNS records in Route 53
```

#### **3. CloudFront Distribution Not Working**
```bash
# Check distribution status
aws cloudfront get-distribution --id <distribution-id>

# Wait for status to be "Deployed"
```

#### **4. API Endpoints Not Working**
```bash
# Test API Gateway directly
curl https://<api-id>.execute-api.ap-southeast-1.amazonaws.com/prod/v1/health

# Check Lambda function logs
aws logs tail /aws/lambda/smart-cooking-ai-suggestion-prod --region ap-southeast-1
```

### **Rollback Plan**

#### **Quick Rollback to Default Domain**
```bash
# Unset custom domain
unset DOMAIN_NAME
unset CREATE_HOSTED_ZONE

# Redeploy without custom domain
cd cdk
cdk deploy --all --context environment=prod

# Result: Back to https://d1234567890.cloudfront.net
```

#### **Complete Rollback**
```bash
# Destroy all resources
cd cdk
cdk destroy --all --context environment=prod

# Redeploy from scratch if needed
```

---

## 📈 **Monitoring & Maintenance**

### **Daily Monitoring**
- [ ] Check **CloudWatch dashboards**
- [ ] Monitor **error rates** < 1%
- [ ] Verify **response times** < 3s
- [ ] Check **cost tracking**

### **Weekly Reviews**
- [ ] Review **performance metrics**
- [ ] Analyze **user activity**
- [ ] Check **security alerts**
- [ ] Update **cost projections**

### **Monthly Tasks**
- [ ] Review **cost optimization**
- [ ] Update **SSL certificates** (auto-renewal)
- [ ] Performance **optimization review**
- [ ] **Backup verification**

---

## 🎉 **Success Criteria**

### **Technical Success**
- ✅ **https://smartcooking.com** accessible
- ✅ **SSL certificate** valid and trusted
- ✅ **All functionality** working
- ✅ **Performance targets** met
- ✅ **100% ap-southeast-1** architecture

### **Business Success**
- ✅ **Professional domain** active
- ✅ **Cost optimization** achieved (47% reduction)
- ✅ **Scalable architecture** ready
- ✅ **Monitoring** comprehensive

### **User Experience Success**
- ✅ **Fast loading** (< 2s page load)
- ✅ **Quick AI responses** (< 3s)
- ✅ **Reliable service** (99.9% uptime)
- ✅ **Secure connection** (HTTPS everywhere)

---

## 📞 **Support & Next Steps**

### **If You Need Help**
1. **Check logs** in CloudWatch
2. **Review documentation** in `/docs` folder
3. **Test individual components** using AWS Console
4. **Use rollback plan** if needed

### **Next Steps After Deployment**
1. **Content creation** - Add recipes and ingredients
2. **User testing** - Invite beta users
3. **Performance optimization** - Monitor and tune
4. **Feature development** - Phase 2 social features

---

**Status:** ✅ **READY FOR DEPLOYMENT**  
**Command:** `./scripts/deploy-with-custom-domain.sh --domain smartcooking.com`  
**Expected Result:** Professional Smart Cooking MVP at https://smartcooking.com

---

**Document Version:** 1.0  
**Author:** Smart Cooking Development Team  
**Last Updated:** October 6, 2025