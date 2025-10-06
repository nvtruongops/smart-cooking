import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export interface StorageStackProps {
  environment: string;
}

export class StorageStack extends Construct {
  public readonly imagesBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id);

    const { environment } = props;

    // S3 Bucket for user-generated content (avatars, recipe images, etc.)
    this.imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      bucketName: `smart-cooking-images-${environment}`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD
          ],
          allowedOrigins: ['*'], // TODO: Restrict to actual domain in production
          allowedHeaders: ['*'],
          maxAge: 3000
        }
      ],
      lifecycleRules: [
        {
          // Delete incomplete multipart uploads after 7 days
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
          enabled: true
        },
        {
          // Move old files to Intelligent Tiering after 90 days
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(90)
            }
          ],
          enabled: true
        }
      ],
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod'
    });

    // Deploy default avatar to S3
    new s3deploy.BucketDeployment(this, 'DeployDefaultAssets', {
      sources: [s3deploy.Source.asset('../assets/default')],
      destinationBucket: this.imagesBucket,
      destinationKeyPrefix: 'default/',
      prune: false, // Don't delete existing files
      retainOnDelete: environment === 'prod'
    });

    // CloudFront Origin Access Identity for secure access
    const originAccessIdentity = new cdk.aws_cloudfront.OriginAccessIdentity(
      this,
      'ImagesOAI',
      {
        comment: `OAI for smart-cooking images bucket (${environment})`
      }
    );

    // Grant read access to CloudFront OAI
    this.imagesBucket.grantRead(originAccessIdentity);

    // CloudFront distribution for serving images
    const distribution = new cdk.aws_cloudfront.Distribution(this, 'ImagesDistribution', {
      defaultBehavior: {
        origin: new cdk.aws_cloudfront_origins.S3Origin(this.imagesBucket, {
          originAccessIdentity
        }),
        viewerProtocolPolicy: cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: new cdk.aws_cloudfront.CachePolicy(this, 'ImagesCachePolicy', {
          cachePolicyName: `smart-cooking-images-cache-${environment}`,
          comment: 'Cache policy for user-generated images',
          defaultTtl: cdk.Duration.days(7),
          maxTtl: cdk.Duration.days(365),
          minTtl: cdk.Duration.seconds(0),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
          headerBehavior: cdk.aws_cloudfront.CacheHeaderBehavior.allowList(
            'Access-Control-Request-Headers',
            'Access-Control-Request-Method',
            'Origin'
          ),
          queryStringBehavior: cdk.aws_cloudfront.CacheQueryStringBehavior.none(),
          cookieBehavior: cdk.aws_cloudfront.CacheCookieBehavior.none()
        }),
        allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cdk.aws_cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS
      },
      priceClass: cdk.aws_cloudfront.PriceClass.PRICE_CLASS_100,
      enabled: true,
      comment: `Smart Cooking Images CDN (${environment})`,
      httpVersion: cdk.aws_cloudfront.HttpVersion.HTTP2_AND_3
    });

    // Outputs
    new cdk.CfnOutput(this, 'ImagesBucketName', {
      value: this.imagesBucket.bucketName,
      description: 'S3 Bucket for user images',
      exportName: `SmartCooking-${environment}-ImagesBucketName`
    });

    new cdk.CfnOutput(this, 'ImagesBucketArn', {
      value: this.imagesBucket.bucketArn,
      description: 'S3 Bucket ARN',
      exportName: `SmartCooking-${environment}-ImagesBucketArn`
    });

    new cdk.CfnOutput(this, 'ImagesDistributionDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain for images',
      exportName: `SmartCooking-${environment}-ImagesCDN`
    });

    new cdk.CfnOutput(this, 'ImagesDistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL for images',
      exportName: `SmartCooking-${environment}-ImagesCDNUrl`
    });

    // Tags
    cdk.Tags.of(this.imagesBucket).add('Component', 'Storage');
    cdk.Tags.of(this.imagesBucket).add('Purpose', 'UserImages');
    cdk.Tags.of(distribution).add('Component', 'CDN');
  }
}
