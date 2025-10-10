import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
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
  public readonly imagesBucket: s3.Bucket;
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

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: { name: 'GSI3PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI3SK', type: dynamodb.AttributeType.STRING },
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: { name: 'GSI4PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI4SK', type: dynamodb.AttributeType.STRING },
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
    const authHandlerFunction = new NodejsFunction(this, 'AuthHandler', {
      ...commonLambdaProps,
      functionName: `smart-cooking-auth-handler-${environment}`,
      description: 'Handles post-authentication user profile creation',
      entry: '../lambda/auth-handler/index.ts',
      handler: 'handler',
      memorySize: 128,  // Optimized from 256MB
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: environment !== 'prod',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // User Profile Lambda - Keep at 256MB (S3 operations)
    const userProfileFunction = new NodejsFunction(this, 'UserProfile', {
      ...commonLambdaProps,
      functionName: `smart-cooking-user-profile-${environment}`,
      description: 'Handles user profile CRUD operations',
      entry: '../lambda/user-profile/index.ts',
      handler: 'handler',
      memorySize: 256,  // Unchanged
      bundling: {
        minify: true,
        sourceMap: environment !== 'prod',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Ingredient Validator Lambda - Optimized: 256MB → 512MB (CPU-intensive fuzzy matching)
    const ingredientValidatorFunction = new NodejsFunction(this, 'IngredientValidator', {
      ...commonLambdaProps,
      functionName: `smart-cooking-ingredient-validator-${environment}`,
      description: 'Validates ingredients against master database',
      entry: '../lambda/ingredient-validator/index.ts',
      handler: 'handler',
      memorySize: 512,  // Optimized from 256MB
      timeout: cdk.Duration.seconds(15),
      bundling: {
        minify: true,
        sourceMap: environment !== 'prod',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // AI Suggestion Lambda - Optimized: 1024MB → 768MB (Bedrock API is the bottleneck)
    const aiSuggestionFunction = new NodejsFunction(this, 'AISuggestion', {
      ...commonLambdaProps,
      functionName: `smart-cooking-ai-suggestion-${environment}`,
      description: 'Generates recipe suggestions using AI',
      entry: '../lambda/ai-suggestion/index.ts',
      handler: 'handler',
      memorySize: 768,  // Optimized from 1024MB
      timeout: cdk.Duration.seconds(60),
      bundling: {
        minify: true,
        sourceMap: environment !== 'prod',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Cooking Session Lambda - Handles cooking sessions and history
    const cookingSessionFunction = new NodejsFunction(this, 'CookingSession', {
      ...commonLambdaProps,
      functionName: `smart-cooking-cooking-session-${environment}`,
      description: 'Handles cooking session lifecycle and history',
      entry: '../lambda/cooking-session/index.ts',
      handler: 'handler',
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: environment !== 'prod',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Posts Lambda - Handles social posts and user content
    const postsFunction = new NodejsFunction(this, 'Posts', {
      ...commonLambdaProps,
      functionName: `smart-cooking-posts-${environment}`,
      description: 'Handles user posts, recipes, and social content',
      entry: '../lambda/posts/index.ts',
      handler: 'handler',
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: environment !== 'prod',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Rating Lambda - Handles recipe ratings and reviews
    const ratingFunction = new NodejsFunction(this, 'Rating', {
      ...commonLambdaProps,
      functionName: `smart-cooking-rating-${environment}`,
      description: 'Handles recipe ratings, reviews, and user feedback',
      entry: '../lambda/rating/index.ts',
      handler: 'handler',
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: environment !== 'prod',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Friends Lambda - Handles friendship management
    const friendsFunction = new NodejsFunction(this, 'Friends', {
      ...commonLambdaProps,
      functionName: `smart-cooking-friends-${environment}`,
      description: 'Handles friend requests, friendships, and social connections',
      entry: '../lambda/friends/index.ts',
      handler: 'handler',
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: environment !== 'prod',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Monitoring Lambda for cost optimization metrics
    const monitoringFunction = new NodejsFunction(this, 'MonitoringLambda', {
      ...commonLambdaProps,
      functionName: `smart-cooking-monitoring-${environment}`,
      description: 'Collects cost optimization and performance metrics',
      entry: '../lambda/monitoring/index.ts',
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: environment !== 'prod',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Admin Lambda - Handles admin dashboard and management
    const adminFunction = new NodejsFunction(this, 'Admin', {
      ...commonLambdaProps,
      functionName: `smart-cooking-admin-${environment}`,
      description: 'Handles admin dashboard, user management, and content moderation',
      entry: '../lambda/admin/index.ts',
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      bundling: {
        minify: true,
        sourceMap: environment !== 'prod',
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Collect all Lambda functions for monitoring
    this.lambdaFunctions = [
      authHandlerFunction,
      userProfileFunction,
      ingredientValidatorFunction,
      aiSuggestionFunction,
      cookingSessionFunction,
      postsFunction,
      ratingFunction,
      friendsFunction,
      monitoringFunction,
      adminFunction
    ];

    // Grant DynamoDB permissions to Lambda functions
    this.table.grantReadWriteData(authHandlerFunction);
    this.table.grantReadWriteData(userProfileFunction);
    this.table.grantReadWriteData(ingredientValidatorFunction);
    this.table.grantReadWriteData(aiSuggestionFunction);
    this.table.grantReadWriteData(cookingSessionFunction);
    this.table.grantReadWriteData(postsFunction);
    this.table.grantReadWriteData(ratingFunction);
    this.table.grantReadWriteData(friendsFunction);
    this.table.grantReadData(monitoringFunction); // Read-only for metrics collection
    this.table.grantReadWriteData(adminFunction); // Full access for admin operations

    // Grant CloudWatch permissions to all Lambda functions for custom metrics
    const cloudWatchMetricsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:ListMetrics'
      ],
      resources: ['*']
    });

    authHandlerFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    userProfileFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    ingredientValidatorFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    aiSuggestionFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    cookingSessionFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    postsFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    ratingFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    friendsFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    monitoringFunction.addToRolePolicy(cloudWatchMetricsPolicy);
    adminFunction.addToRolePolicy(cloudWatchMetricsPolicy);

    // Grant Bedrock permissions to AI Suggestion Lambda
    const bedrockPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        // Allow all Claude models in ap-southeast-1
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-*`
      ]
    });
    
    aiSuggestionFunction.addToRolePolicy(bedrockPolicy);

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
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token'
        ],
      },
      deployOptions: {
        stageName: environment,
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
      },
    });

    // Add CORS headers to error responses (4xx and 5xx)
    this.api.addGatewayResponse('Default4XX', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    this.api.addGatewayResponse('Default5XX', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    this.api.addGatewayResponse('Unauthorized', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    this.api.addGatewayResponse('AccessDenied', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
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
    auth.addMethod('POST', new apigateway.LambdaIntegration(authHandlerFunction)); // Main auth endpoint for login/register
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

    // User stats endpoint /v1/users/me/stats
    const usersMe = users.addResource('me');
    const userStats = usersMe.addResource('stats');
    userStats.addMethod('GET', new apigateway.LambdaIntegration(userProfileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // User profile type routes (preferences, privacy, etc.)
    const userProfileType = userProfile.addResource('{type}');
    userProfileType.addMethod('GET', new apigateway.LambdaIntegration(userProfileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    userProfileType.addMethod('POST', new apigateway.LambdaIntegration(userProfileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    userProfileType.addMethod('PUT', new apigateway.LambdaIntegration(userProfileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Avatar presigned URL endpoint
    const userProfileAvatar = userProfile.addResource('avatar');
    const avatarPresigned = userProfileAvatar.addResource('presigned');
    avatarPresigned.addMethod('POST', new apigateway.LambdaIntegration(userProfileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Username availability check endpoint (no auth required for registration)

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

    // Cooking session routes
    const cooking = v1.addResource('cooking');
    
    // GET /v1/cooking/history - Get user's cooking history
    cooking.addResource('history').addMethod('GET', new apigateway.LambdaIntegration(cookingSessionFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Cooking sessions resource
    const sessions = cooking.addResource('sessions');
    
    // POST /v1/cooking/sessions - Start new cooking session
    sessions.addMethod('POST', new apigateway.LambdaIntegration(cookingSessionFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Session by ID
    const sessionById = sessions.addResource('{sessionId}');
    
    // GET /v1/cooking/sessions/{sessionId} - Get specific session
    sessionById.addMethod('GET', new apigateway.LambdaIntegration(cookingSessionFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // PUT /v1/cooking/sessions/{sessionId} - Update cooking session
    sessionById.addMethod('PUT', new apigateway.LambdaIntegration(cookingSessionFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // DELETE /v1/cooking/sessions/{sessionId} - Delete cooking session
    sessionById.addMethod('DELETE', new apigateway.LambdaIntegration(cookingSessionFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========== POSTS ROUTES ==========
    const posts = v1.addResource('posts', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token'
        ],
        statusCode: 200, // Ensure 200 response
      }
    });

    // GET /v1/posts/me - Get current user's posts
    const postsMe = posts.addResource('me');
    postsMe.addMethod('GET', new apigateway.LambdaIntegration(postsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // POST /v1/posts - Create new post
    posts.addMethod('POST', new apigateway.LambdaIntegration(postsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /v1/posts/{postId} - Get specific post
    const postById = posts.addResource('{postId}');
    postById.addMethod('GET', new apigateway.LambdaIntegration(postsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // PUT /v1/posts/{postId} - Update post
    postById.addMethod('PUT', new apigateway.LambdaIntegration(postsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // DELETE /v1/posts/{postId} - Delete post
    postById.addMethod('DELETE', new apigateway.LambdaIntegration(postsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ==================== RATING ROUTES ====================
    const ratings = v1.addResource('ratings');

    // POST /v1/ratings - Submit rating/review
    ratings.addMethod('POST', new apigateway.LambdaIntegration(ratingFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /v1/ratings/{recipeId} - Get ratings for a recipe
    const ratingByRecipe = ratings.addResource('{recipeId}');
    ratingByRecipe.addMethod('GET', new apigateway.LambdaIntegration(ratingFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /v1/ratings/user/{userId} - Get user's ratings
    const ratingsUser = ratings.addResource('user');
    const ratingsByUser = ratingsUser.addResource('{userId}');
    ratingsByUser.addMethod('GET', new apigateway.LambdaIntegration(ratingFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ==================== FRIENDS ROUTES ====================
    const friends = v1.addResource('friends');

    // GET /v1/friends - List all friends
    friends.addMethod('GET', new apigateway.LambdaIntegration(friendsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // POST /v1/friends/request - Send friend request
    const friendsRequest = friends.addResource('request');
    friendsRequest.addMethod('POST', new apigateway.LambdaIntegration(friendsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // PUT /v1/friends/{friendId}/accept - Accept friend request
    const friendById = friends.addResource('{friendId}');
    const friendAccept = friendById.addResource('accept');
    friendAccept.addMethod('PUT', new apigateway.LambdaIntegration(friendsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // PUT /v1/friends/{friendId}/reject - Reject friend request
    const friendReject = friendById.addResource('reject');
    friendReject.addMethod('PUT', new apigateway.LambdaIntegration(friendsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // DELETE /v1/friends/{friendId} - Remove friend
    friendById.addMethod('DELETE', new apigateway.LambdaIntegration(friendsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ==================== ADMIN ROUTES ====================
    const admin = v1.addResource('admin');

    // GET /v1/admin/stats - Database statistics
    const adminStats = admin.addResource('stats');
    adminStats.addMethod('GET', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /v1/admin/stats/ingredients - Ingredient statistics
    const adminStatsIngredients = adminStats.addResource('ingredients');
    adminStatsIngredients.addMethod('GET', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /v1/admin/stats/users - User statistics
    const adminStatsUsers = adminStats.addResource('users');
    adminStatsUsers.addMethod('GET', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /v1/admin/violations - All violations
    const adminViolations = admin.addResource('violations');
    adminViolations.addMethod('GET', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /v1/admin/violations/summary - Violation summary
    const adminViolationsSummary = adminViolations.addResource('summary');
    adminViolationsSummary.addMethod('GET', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /v1/admin/violations/user/{userId} - User violations
    const adminViolationsUser = adminViolations.addResource('user');
    const adminViolationsByUser = adminViolationsUser.addResource('{userId}');
    adminViolationsByUser.addMethod('GET', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Admin users management
    const adminUsers = admin.addResource('users');

    // GET /v1/admin/users/suspended - List suspended users
    const adminUsersSuspended = adminUsers.addResource('suspended');
    adminUsersSuspended.addMethod('GET', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // User by ID operations
    const adminUserById = adminUsers.addResource('{userId}');

    // POST /v1/admin/users/{userId}/ban - Ban user
    const adminUserBan = adminUserById.addResource('ban');
    adminUserBan.addMethod('POST', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // POST /v1/admin/users/{userId}/unban - Unban user
    const adminUserUnban = adminUserById.addResource('unban');
    adminUserUnban.addMethod('POST', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // PUT /v1/admin/users/{userId}/approve-ban - Approve ban request
    const adminUserApproveBan = adminUserById.addResource('approve-ban');
    adminUserApproveBan.addMethod('PUT', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // PUT /v1/admin/users/{userId}/reject-ban - Reject ban request
    const adminUserRejectBan = adminUserById.addResource('reject-ban');
    adminUserRejectBan.addMethod('PUT', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Admin recipes management
    const adminRecipes = admin.addResource('recipes');

    // GET /v1/admin/recipes/pending - Pending recipes
    const adminRecipesPending = adminRecipes.addResource('pending');
    adminRecipesPending.addMethod('GET', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Recipe by ID operations
    const adminRecipeById = adminRecipes.addResource('{recipeId}');

    // PUT /v1/admin/recipes/{recipeId}/approve - Approve recipe
    const adminRecipeApprove = adminRecipeById.addResource('approve');
    adminRecipeApprove.addMethod('PUT', new apigateway.LambdaIntegration(adminFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // PUT /v1/admin/recipes/{recipeId}/reject - Reject recipe
    const adminRecipeReject = adminRecipeById.addResource('reject');
    adminRecipeReject.addMethod('PUT', new apigateway.LambdaIntegration(adminFunction), {
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
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: environment === 'prod' 
            ? ['https://smartcooking.com'] 
            : ['http://localhost:3000'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // 6b. S3 Bucket for User-Generated Images (avatars, recipe photos, etc.)
    this.imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      bucketName: `smart-cooking-images-${environment}-${this.account}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: environment === 'prod' 
            ? ['https://smartcooking.com', 'https://d6grpgvslabt3.cloudfront.net'] 
            : ['http://localhost:3000'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          // Delete incomplete multipart uploads after 7 days
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          // Move old avatars to Intelligent Tiering after 90 days
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });

    // Deploy default assets and folder structure to S3
    new s3deploy.BucketDeployment(this, 'DeployDefaultAssets', {
      sources: [s3deploy.Source.asset('../assets/default')],
      destinationBucket: this.websiteBucket,
      destinationKeyPrefix: 'assets',
      prune: false, // Don't delete user-uploaded files
    });

    // Create users folder structure (empty placeholder)
    new s3deploy.BucketDeployment(this, 'CreateUsersFolderStructure', {
      sources: [s3deploy.Source.data('users/.keep', '')],
      destinationBucket: this.websiteBucket,
      prune: false,
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
        '/avatars/*': {
          origin: new origins.S3Origin(this.imagesBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
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
    this.imagesBucket.grantRead(new iam.ServicePrincipal('cloudfront.amazonaws.com'));

    // Grant S3 permissions to UserProfile Lambda for avatar uploads
    this.imagesBucket.grantReadWrite(userProfileFunction);
    
    // Add S3 bucket name to UserProfile Lambda environment
    userProfileFunction.addEnvironment('S3_BUCKET_NAME', this.imagesBucket.bucketName);
    userProfileFunction.addEnvironment('S3_USERS_PREFIX', 'users/');
    
    // Add CloudFront domain (will be set after distribution is created)
    // For now, use environment-specific domain
    const cloudfrontDomain = environment === 'prod' 
      ? 'd6grpgvslabt3.cloudfront.net' 
      : 'd2o9m048qjl0kq.cloudfront.net';
    userProfileFunction.addEnvironment('CLOUDFRONT_DOMAIN', cloudfrontDomain);

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

    new cdk.CfnOutput(this, 'S3ImagesBucketName', {
      value: this.imagesBucket.bucketName,
      description: 'S3 Images Bucket Name (User Content)',
      exportName: `SmartCooking-${environment}-ImagesBucketName`
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `SmartCooking-${environment}-DistributionId`
    });
  }
}