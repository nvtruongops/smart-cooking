import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface FrontendStackProps {
  environment: string;
  domainName: string;
  certificateArn: string;
  apiGatewayUrl: string;
  userPoolId: string;
  userPoolClientId: string;
}

export class FrontendStack extends Construct {
  public readonly websiteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly websiteUrl: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id);

    const { environment, domainName, certificateArn, apiGatewayUrl, userPoolId, userPoolClientId } = props;

    // S3 Bucket for static website hosting
    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `smart-cooking-frontend-${environment}-${Math.random().toString(36).substring(2, 8)}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      
      // CORS configuration for API calls
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 3000
      }]
    });

    // CloudFront Origin Access Control (using S3OriginAccessControl)
    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'OriginAccessControl', {
      description: `OAC for Smart Cooking ${environment}`
    });

    // CloudFront Cache Policies
    const staticAssetsCachePolicy = new cloudfront.CachePolicy(this, 'StaticAssetsCachePolicy', {
      cachePolicyName: `smart-cooking-static-${environment}`,
      comment: 'Cache policy for static assets (JS, CSS, images)',
      defaultTtl: cdk.Duration.days(1),
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

    // SSL Certificate (create or use existing)
    let certificate: certificatemanager.ICertificate;
    if (certificateArn) {
      certificate = certificatemanager.Certificate.fromCertificateArn(this, 'Certificate', certificateArn);
    } else {
      // Create new certificate (requires manual DNS validation)
      certificate = new certificatemanager.Certificate(this, 'Certificate', {
        domainName: domainName,
        subjectAlternativeNames: [`www.${domainName}`],
        validation: certificatemanager.CertificateValidation.fromDns()
      });
    }

    // CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      comment: `Smart Cooking ${environment} Distribution`,
      defaultRootObject: 'index.html',
      
      // Domain configuration
      domainNames: environment === 'prod' ? [domainName, `www.${domainName}`] : undefined,
      certificate: environment === 'prod' ? certificate : undefined,
      
      // Default behavior for HTML files
      defaultBehavior: {
        origin: new origins.S3Origin(this.websiteBucket, {
          originAccessControlId: originAccessControl.originAccessControlId
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: htmlCachePolicy,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD
      },

      // Additional behaviors for static assets
      additionalBehaviors: {
        '/static/*': {
          origin: new origins.S3Origin(this.websiteBucket, {
            originAccessControlId: originAccessControl.originAccessControlId
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true
        },
        '/_next/static/*': {
          origin: new origins.S3Origin(this.websiteBucket, {
            originAccessControlId: originAccessControl.originAccessControlId
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true
        },
        '/images/*': {
          origin: new origins.S3Origin(this.websiteBucket, {
            originAccessControlId: originAccessControl.originAccessControlId
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: staticAssetsCachePolicy,
          compress: true
        }
      },

      // Error responses for SPA routing
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

      // Geographic restrictions (if needed)
      geoRestriction: cloudfront.GeoRestriction.allowlist('US', 'CA', 'VN'), // Adjust as needed

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

    // Update S3 bucket policy to allow CloudFront access
    this.websiteBucket.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
      effect: cdk.aws_iam.Effect.ALLOW,
      principals: [new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [`${this.websiteBucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${this.distribution.distributionId}`
        }
      }
    }));

    // Route 53 configuration for custom domain
    if (environment === 'prod' && domainName && domainName !== 'smartcooking.com') {
      // Try to find existing hosted zone, or create a new one
      let hostedZone: route53.IHostedZone;
      
      try {
        hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
          domainName: domainName
        });
      } catch (error) {
        // Create new hosted zone if lookup fails
        hostedZone = new route53.HostedZone(this, 'HostedZone', {
          zoneName: domainName,
          comment: `Smart Cooking ${environment} hosted zone`
        });
        
        // Output the name servers for manual DNS configuration
        new cdk.CfnOutput(this, 'NameServers', {
          value: hostedZone.hostedZoneNameServers?.join(', ') || 'Not available',
          description: 'Name servers for DNS configuration',
          exportName: `SmartCooking-${environment}-NameServers`
        });
      }

      // A record for root domain
      new route53.ARecord(this, 'WebsiteARecord', {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution))
      });

      // A record for www subdomain
      new route53.ARecord(this, 'WebsiteWwwARecord', {
        zone: hostedZone,
        recordName: `www.${domainName}`,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution))
      });
      
      // CNAME record for www redirect (alternative approach)
      new route53.CnameRecord(this, 'WwwCnameRecord', {
        zone: hostedZone,
        recordName: 'www',
        domainName: this.distribution.distributionDomainName
      });
    }

    // Set website URL
    this.websiteUrl = environment === 'prod' && domainName !== 'smartcooking.com'
      ? `https://${domainName}`
      : `https://${this.distribution.distributionDomainName}`;

    // Create environment configuration file for frontend
    const envConfig = {
      NEXT_PUBLIC_API_URL: apiGatewayUrl,
      NEXT_PUBLIC_USER_POOL_ID: userPoolId,
      NEXT_PUBLIC_USER_POOL_CLIENT_ID: userPoolClientId,
      NEXT_PUBLIC_ENVIRONMENT: environment,
      NEXT_PUBLIC_REGION: cdk.Stack.of(this).region
    };

    // Deploy environment config (this will be created during deployment)
    new s3deploy.BucketDeployment(this, 'DeployEnvConfig', {
      sources: [s3deploy.Source.jsonData('env-config.json', envConfig)],
      destinationBucket: this.websiteBucket,
      distribution: this.distribution,
      distributionPaths: ['/env-config.json']
    });

    // Outputs
    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: this.websiteBucket.bucketName,
      description: 'S3 Website Bucket Name',
      exportName: `SmartCooking-${environment}-WebsiteBucketName`
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `SmartCooking-${environment}-DistributionId`
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
      exportName: `SmartCooking-${environment}-DistributionDomainName`
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: this.websiteUrl,
      description: 'Website URL',
      exportName: `SmartCooking-${environment}-WebsiteUrl`
    });

    // Tags
    cdk.Tags.of(this.websiteBucket).add('Component', 'Frontend');
    cdk.Tags.of(this.distribution).add('Component', 'Frontend');
  }
}