import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { MonitoringStack } from './monitoring-stack';
import { CostOptimization } from './cost-optimization';

export interface SimpleStackProps extends cdk.StackProps {
  environment: string;
  alertEmail?: string;
}

export class SimpleStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly api: apigateway.RestApi;
  public readonly websiteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly lambdaFunctions: lambda.Function[];
  public readonly monitoringStack: MonitoringStack;
  public readonly costOptimization: CostOptimization;

  constructor(scope: Construct, id: string, props: SimpleStackProps) {
    super(scope, id, props);

    const { environment, alertEmail } = props;

    // 1. DynamoDB Table
    this.table = new dynamodb.Table(this, 'SmartCookingTable', {
      tableName: `smart-cooking-data-${environment}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: environment === 'prod',
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,

      // TTL for automatic cleanup of temporary data
      timeToLiveAttribute: 'ttl'
    });

    // Add Global Secondary Indexes
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
    });

    // 2. Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `smart-cooking-users-${environment}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `smart-cooking-client-${environment}`,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: environment === 'prod' 
          ? ['https://smartcooking.com/auth/callback']
          : ['http://localhost:3000/auth/callback'],
        logoutUrls: environment === 'prod'
          ? ['https://smartcooking.com']
          : ['http://localhost:3000'],
      },
    });

    // 3. SNS Topic for admin notifications
    const adminTopic = new sns.Topic(this, 'AdminTopic', {
      topicName: `smart-cooking-alerts-${environment}`,
      displayName: `Smart Cooking ${environment} Alerts`
    });

    // 4. Lambda Functions with optimized memory allocations (Task 11.2)
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256, // Default, overridden per function
      environment: {
        DYNAMODB_TABLE: this.table.tableName,
        USER_POOL_ID: this.userPool.userPoolId,
        USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
        ENVIRONMENT: environment,
        LOG_LEVEL: environment === 'prod' ? 'INFO' : 'DEBUG',
        ADMIN_TOPIC_ARN: adminTopic.topicArn,
      },
      tracing: lambda.Tracing.ACTIVE,
    };

    // Auth Handler Lambda - Optimized: 256MB → 128MB (simple operation)
    const authHandlerFunction = new lambda.Function(this, 'AuthHandler', {
      ...commonLambdaProps,
      functionName: `smart-cooking-auth-handler-${environment}`,
      description: 'Handles post-authentication user profile creation',
      code: lambda.Code.fromAsset('../lambda/auth-handler'),
      handler: 'index.handler',
      memorySize: 128,  // Optimized from 256MB
      timeout: cdk.Duration.seconds(10)
    });

    // User Profile Lambda - Keep at 256MB (S3 operations)
    const userProfileFunction = new lambda.Function(this, 'UserProfile', {
      ...commonLambdaProps,
      functionName: `smart-cooking-user-profile-${environment}`,
      description: 'Handles user profile CRUD operations',
      code: lambda.Code.fromAsset('../lambda/user-profile'),
      handler: 'index.handler',
      memorySize: 256  // Unchanged
    });

    // Ingredient Validator Lambda - Optimized: 256MB → 512MB (CPU-intensive fuzzy matching)
    const ingredientValidatorFunction = new lambda.Function(this, 'IngredientValidator', {
      ...commonLambdaProps,
      functionName: `smart-cooking-ingredient-validator-${environment}`,
      description: 'Validates ingredients against master database',
      code: lambda.Code.fromAsset('../lambda/ingredient-validator'),
      handler: 'index.handler',
      memorySize: 512,  // Optimized from 256MB
      timeout: cdk.Duration.seconds(15)
    });

    // AI Suggestion Lambda - Optimized: 1024MB → 768MB (Bedrock API is the bottleneck)
    const aiSuggestionFunction = new lambda.Function(this, 'AISuggestion', {
      ...commonLambdaProps,
      functionName: `smart-cooking-ai-suggestion-${environment}`,
      description: 'Generates recipe suggestions using AI',
      code: lambda.Code.fromAsset('../lambda/ai-suggestion'),
      handler: 'dist/ai-suggestion/index.handler',
      memorySize: 768,  // Optimized from 1024MB
      timeout: cdk.Duration.seconds(60)
    });

    // Monitoring Lambda for cost optimization metrics
    const monitoringFunction = new lambda.Function(this, 'MonitoringLambda', {
      ...commonLambdaProps,
      functionName: `smart-cooking-monitoring-${environment}`,
      description: 'Collects cost optimization and performance metrics',
      code: lambda.Code.fromAsset('../lambda/monitoring'),
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 512
    });

    // Collect all Lambda functions for monitoring
    this.lambdaFunctions = [
      authHandlerFunction,
      userProfileFunction,
      ingredientValidatorFunction,
      aiSuggestionFunction,
      monitoringFunction
    ];

    // Grant DynamoDB permissions to Lambda functions
    this.table.grantReadWriteData(authHandlerFunction);
    this.table.grantReadWriteData(userProfileFunction);
    this.table.grantReadWriteData(ingredientValidatorFunction);
    this.table.grantReadWriteData(aiSuggestionFunction);
    this.table.grantReadData(monitoringFunction); // Read-only for metrics collection

    // Grant CloudWatch permissions to monitoring function
    monitoringFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:ListMetrics'
      ],
      resources: ['*']
    }));

    // Grant SNS permissions
    adminTopic.grantPublish(ingredientValidatorFunction);

    // Set up scheduled trigger for monitoring function (every hour)
    const monitoringRule = new events.Rule(this, 'MonitoringSchedule', {
      ruleName: `smart-cooking-monitoring-schedule-${environment}`,
      description: 'Triggers cost optimization metrics collection every hour',
      schedule: events.Schedule.rate(cdk.Duration.hours(1))
    });

    monitoringRule.addTarget(new targets.LambdaFunction(monitoringFunction));

    // 5. API Gateway
    this.api = new apigateway.RestApi(this, 'SmartCookingApi', {
      restApiName: `smart-cooking-api-${environment}`,
      description: 'Smart Cooking MVP API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: environment,
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
      },
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [this.userPool],
      authorizerName: `smart-cooking-authorizer-${environment}`,
    });

    // API Routes
    const v1 = this.api.root.addResource('v1');

    // Auth routes
    const auth = v1.addResource('auth');
    auth.addResource('profile').addMethod('POST', new apigateway.LambdaIntegration(authHandlerFunction));

    // User routes
    const users = v1.addResource('users');
    const userProfile = users.addResource('profile');
    userProfile.addMethod('GET', new apigateway.LambdaIntegration(userProfileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    userProfile.addMethod('POST', new apigateway.LambdaIntegration(userProfileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    userProfile.addMethod('PUT', new apigateway.LambdaIntegration(userProfileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Ingredient routes
    const ingredients = v1.addResource('ingredients');
    ingredients.addResource('validate').addMethod('POST', new apigateway.LambdaIntegration(ingredientValidatorFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // AI suggestion routes
    const suggestions = v1.addResource('suggestions');
    suggestions.addResource('ai').addMethod('POST', new apigateway.LambdaIntegration(aiSuggestionFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // 6. S3 Bucket for Frontend
    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `smart-cooking-frontend-${environment}-${this.account}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
    });

    // 7. CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(this.api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Grant CloudFront access to S3
    this.websiteBucket.grantRead(new iam.ServicePrincipal('cloudfront.amazonaws.com'));

    // 8. Create Cost Optimization
    this.costOptimization = new CostOptimization(this, 'CostOptimization', {
      environment,
      lambdaFunctions: this.lambdaFunctions
    });

    // 9. Create Monitoring Stack
    this.monitoringStack = new MonitoringStack(this, 'Monitoring', {
      environment,
      table: this.table,
      api: this.api,
      lambdaFunctions: this.lambdaFunctions,
      alertEmail
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: `SmartCooking-${environment}-ApiUrl`
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
      exportName: `SmartCooking-${environment}-WebsiteUrl`
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `SmartCooking-${environment}-UserPoolId`
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `SmartCooking-${environment}-UserPoolClientId`
    });

    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: this.table.tableName,
      description: 'DynamoDB Table Name',
      exportName: `SmartCooking-${environment}-TableName`
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: this.websiteBucket.bucketName,
      description: 'S3 Website Bucket Name',
      exportName: `SmartCooking-${environment}-BucketName`
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `SmartCooking-${environment}-DistributionId`
    });
  }
}