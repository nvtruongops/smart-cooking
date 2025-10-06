# Smart Cooking MVP - Custom Domain Setup

**Date:** October 6, 2025  
**Objective:** Setup custom domain `smartcooking.com` với certificate tại ap-southeast-1  
**Status:** IMPLEMENTATION READY

---

## 🎯 **Domain Configuration**

### Target Domains
- **Primary:** `smartcooking.com`
- **WWW:** `www.smartcooking.com`
- **API:** `api.smartcooking.com` (optional)

### Certificate Strategy
- **Create certificate tại ap-southeast-1**
- **AWS tự động replicate** sang us-east-1 cho CloudFront
- **DNS validation** thông qua Route 53

---

## 🏗️ **CDK Implementation**

### Step 1: Update Frontend Stack với Custom Domain

```typescript
// cdk/lib/frontend-stack.ts - Enhanced version
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

export interface FrontendStackProps {
  environment: string;
  domainName?: string;  // Make optional
  certificateArn?: string;  // Make optional
  createHostedZone?: boolean;  // New option
  apiGatewayUrl: string;
  userPoolId: string;
  userPoolClientId: string;
}

export class FrontendStack extends Construct {
  public readonly websiteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly certificate?: certificatemanager.ICertificate;
  public readonly hostedZone?: route53.IHostedZone;
  public readonly websiteUrl: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id);

    const { 
      environment, 
      domainName, 
      certificateArn, 
      createHostedZone = false,
      apiGatewayUrl, 
      userPoolId, 
      userPoolClientId 
    } = props;

    // S3 Bucket for static website hosting
    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `smart-cooking-frontend-${environment}-${cdk.Stack.of(this).account}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
    });

    // Route 53 Hosted Zone (if needed)
    if (domainName && createHostedZone) {
      this.hostedZone = new route53.HostedZone(this, 'HostedZone', {
        zoneName: domainName,
        comment: `Smart Cooking ${environment} - Hosted Zone`
      });
    } else if (domainName) {
      // Use existing hosted zone
      this.hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: domainName
      });
    }

    // SSL Certificate Setup
    if (domainName) {
      if (certificateArn) {
        // Use existing certificate
        this.certificate = certificatemanager.Certificate.fromCertificateArn(
          this, 'Certificate', certificateArn
        );
      } else {
        // Create new certificate at ap-southeast-1
        // AWS will automatically replicate to us-east-1 for CloudFront
        this.certificate = new certificatemanager.Certificate(this, 'Certificate', {
          domainName: domainName,
          subjectAlternativeNames: [`www.${domainName}`],
          validation: certificatemanager.CertificateValidation.fromDns(this.hostedZone),
          certificateName: `smart-cooking-${environment}-cert`
        });
      }
    }

    // CloudFront Cache Policies
    const staticAssetsCachePolicy = new cloudfront.CachePolicy(this, 'StaticAssetsCachePolicy', {
      cachePolicyName: `smart-cooking-static-${environment}`,
      comment: 'Cache policy for static assets (JS, CSS, images)',
      defaultTtl: cdk.Duration.days(30),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.seconds(0),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true
    });

    const htmlCachePolicy = new cloudfront.CachePolicy(this, 'HtmlCachePolicy', {
      cachePolicyName: `smart-cooking-html-${environment}`,
      comment: 'Cache policy for HTML files',
      defaultTtl: cdk.Duration.hours(1),
      maxTtl: cdk.Duration.days(1),
      minTtl: cdk.Duration.seconds(0),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true
    });

    // CloudFront Distribution with Custom Domain
    this.distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      comment: `Smart Cooking ${environment} Distribution`,
      defaultRootObject: 'index.html',
      
      // Custom domain configuration
      domainNames: domainName ? [domainName, `www.${domainName}`] : undefined,
      certificate: this.certificate,
      
      // Default behavior for HTML files
      defaultBehavior: {
        origin: new origins.S3Origin(this.websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: htmlCachePolicy,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD
      },

      // Additional behaviors for static assets
      additionalBehaviors: {
        '/static/*': {
          origin: new origins.S3Origin(this.websiteBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true
        },
        '/_next/static/*': {
          origin: new origins.S3Origin(this.websiteBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true
        },
        '/images/*': {
          origin: new origins.S3Origin(this.websiteBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true
        },
        '/api/*': {
          origin: new origins.HttpOrigin(apiGatewayUrl.replace('https://', '')),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN
        }
      },

      // Error pages for SPA routing
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5)
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5)
        }
      ],

      // Geographic restrictions
      geoRestriction: cloudfront.GeoRestriction.allowlist('US', 'CA', 'VN', 'SG'),

      // Price class
      priceClass: environment === 'prod' 
        ? cloudfront.PriceClass.PRICE_CLASS_ALL 
        : cloudfront.PriceClass.PRICE_CLASS_100,

      // Enable logging
      enableLogging: true,
      logBucket: new s3.Bucket(this, 'CloudFrontLogsBucket', {
        bucketName: `smart-cooking-cf-logs-${environment}-${Math.random().toString(36).substring(2, 8)}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true
      }),
      logFilePrefix: 'cloudfront-logs/',
      logIncludesCookies: false
    });

    // Route 53 DNS Records
    if (domainName && this.hostedZone) {
      // A record for root domain
      new route53.ARecord(this, 'AliasRecord', {
        zone: this.hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution)
        ),
        comment: `Smart Cooking ${environment} - Root domain`
      });

      // A record for www subdomain
      new route53.ARecord(this, 'WwwAliasRecord', {
        zone: this.hostedZone,
        recordName: `www.${domainName}`,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution)
        ),
        comment: `Smart Cooking ${environment} - WWW subdomain`
      });
    }

    // Update S3 bucket policy for CloudFront access
    this.websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [`${this.websiteBucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${this.distribution.distributionId}`
        }
      }
    }));

    // Set website URL
    this.websiteUrl = domainName 
      ? `https://${domainName}` 
      : `https://${this.distribution.distributionDomainName}`;

    // Outputs
    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: this.websiteUrl,
      description: 'Website URL',
      exportName: `SmartCooking-${environment}-WebsiteUrl`
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `SmartCooking-${environment}-DistributionId`
    });

    if (this.certificate) {
      new cdk.CfnOutput(this, 'CertificateArn', {
        value: this.certificate.certificateArn,
        description: 'SSL Certificate ARN',
        exportName: `SmartCooking-${environment}-CertificateArn`
      });
    }

    if (this.hostedZone) {
      new cdk.CfnOutput(this, 'HostedZoneId', {
        value: this.hostedZone.hostedZoneId,
        description: 'Route 53 Hosted Zone ID',
        exportName: `SmartCooking-${environment}-HostedZoneId`
      });

      new cdk.CfnOutput(this, 'NameServers', {
        value: this.hostedZone.hostedZoneNameServers?.join(', ') || 'N/A',
        description: 'Route 53 Name Servers',
        exportName: `SmartCooking-${environment}-NameServers`
      });
    }
  }
}
```

---

## 🔧 **Configuration Updates**

### Update CDK App Configuration

```typescript
// cdk/bin/app.ts - Updated
const config = {
  dev: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-1',
    domainName: process.env.DOMAIN_NAME || '', // e.g., 'dev.smartcooking.com'
    certificateArn: process.env.CERTIFICATE_ARN || '',
    createHostedZone: process.env.CREATE_HOSTED_ZONE === 'true',
    enablePointInTimeRecovery: false,
    enableWaf: false,
    logRetentionDays: logs.RetentionDays.ONE_WEEK,
    budgetLimit: 50
  },
  prod: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-southeast-1',
    domainName: process.env.DOMAIN_NAME || 'smartcooking.com',
    certificateArn: process.env.CERTIFICATE_ARN || '',
    createHostedZone: process.env.CREATE_HOSTED_ZONE === 'true',
    enablePointInTimeRecovery: true,
    enableWaf: true,
    logRetentionDays: logs.RetentionDays.ONE_MONTH,
    budgetLimit: 200
  }
};
```

### Environment Variables for Custom Domain

```bash
# config/ap-southeast-1.env - Updated for custom domain
export AWS_REGION=ap-southeast-1
export CDK_DEFAULT_REGION=ap-southeast-1
export BEDROCK_REGION=ap-southeast-1
export ENVIRONMENT=prod

# Custom domain configuration
export DOMAIN_NAME=smartcooking.com
export CREATE_HOSTED_ZONE=true  # Set to false if hosted zone already exists
# export CERTIFICATE_ARN=  # Leave empty to create new certificate

echo "✅ Environment configured for ap-southeast-1 deployment with custom domain"
echo "📍 Primary region: $AWS_REGION"
echo "🤖 Bedrock region: $BEDROCK_REGION (local)"
echo "🌐 Domain: $DOMAIN_NAME"
echo "🔒 Certificate: Will be created at ap-southeast-1 and replicated to us-east-1"
echo ""
echo "🚀 Note: Custom domain setup with local certificate creation!"
```

---

## 📋 **Deployment Steps**

### Step 1: Domain Registration
```bash
# If you don't have the domain yet, register it:
# - Go to Route 53 Console
# - Register smartcooking.com
# - Or transfer existing domain to Route 53
```

### Step 2: Deploy with Custom Domain
```bash
# Set environment variables
export DOMAIN_NAME=smartcooking.com
export CREATE_HOSTED_ZONE=true
export AWS_REGION=ap-southeast-1

# Deploy infrastructure
cd cdk
cdk deploy --all --require-approval never

# The deployment will:
# 1. Create hosted zone for smartcooking.com
# 2. Create SSL certificate at ap-southeast-1
# 3. AWS automatically replicates certificate to us-east-1
# 4. Create CloudFront distribution with custom domain
# 5. Create DNS records pointing to CloudFront
```

### Step 3: DNS Validation
```bash
# After deployment, you'll see name servers in output
# Update your domain registrar to use these name servers:
# ns-1234.awsdns-12.org
# ns-5678.awsdns-34.net
# ns-9012.awsdns-56.co.uk
# ns-3456.awsdns-78.com
```

### Step 4: Certificate Validation
```bash
# Certificate validation happens automatically via DNS
# Wait 5-10 minutes for certificate to be issued
# Check status in ACM console (ap-southeast-1)
```

---

## 🎯 **Expected Results**

### Domain Access
- **https://smartcooking.com** → Smart Cooking MVP
- **https://www.smartcooking.com** → Smart Cooking MVP
- **https://smartcooking.com/api/v1/...** → API Gateway

### Certificate Location
- **Created at:** ap-southeast-1 (ACM Console)
- **Replicated to:** us-east-1 (automatically by AWS)
- **Used by:** CloudFront (global service)

### Architecture Benefits
- **100% ap-southeast-1** for all services
- **Custom professional domain**
- **SSL certificate managed regionally**
- **No manual us-east-1 dependencies**

---

## 💰 **Cost Impact**

### Additional Costs
- **Route 53 Hosted Zone:** $0.50/month
- **SSL Certificate:** FREE (AWS Certificate Manager)
- **Custom Domain CloudFront:** No additional cost

### Total Monthly Cost
- **Previous:** ~$75/month
- **With Custom Domain:** ~$75.50/month
- **Additional:** $0.50/month only

---

## 🔄 **Rollback Plan**

### If Custom Domain Fails
```bash
# Quick rollback to default CloudFront domain
unset DOMAIN_NAME
unset CREATE_HOSTED_ZONE
cdk deploy --all

# Result: Back to https://d1234567890.cloudfront.net
```

### Domain Transfer
```bash
# If need to change domain later
export DOMAIN_NAME=newdomain.com
cdk deploy --all
# Old domain will be removed, new one created
```

---

## 📊 **Final Architecture**

### Services by Region
- **ap-southeast-1:**
  - DynamoDB
  - Lambda Functions
  - API Gateway
  - S3 Buckets
  - Cognito
  - **SSL Certificate (created here)**
  - Route 53 Hosted Zone

- **us-east-1:**
  - **SSL Certificate (replicated automatically)**

- **Global:**
  - CloudFront Distribution (using certificate from us-east-1)

### Domain Flow
```
smartcooking.com (Route 53)
    ↓
CloudFront Distribution (Global)
    ↓
S3 Bucket (ap-southeast-1) + API Gateway (ap-southeast-1)
```

---

**Status:** ✅ **READY FOR IMPLEMENTATION**  
**Domain:** `smartcooking.com`  
**Certificate:** Created at ap-southeast-1, auto-replicated to us-east-1  
**Architecture:** 100% ap-southeast-1 services with professional custom domain
