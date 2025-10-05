import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface LambdaStackProps {
  environment: string;
  table: dynamodb.Table;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  logRetentionDays: number;
  adminTopicArn?: string;
}

export class LambdaStack extends Construct {
  public readonly functions: { [key: string]: lambda.Function };

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id);

    const { environment, table, userPool, userPoolClient, logRetentionDays, adminTopicArn } = props;

    // Common Lambda configuration
    const commonProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        DYNAMODB_TABLE: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        ENVIRONMENT: environment,
        LOG_LEVEL: environment === 'prod' ? 'INFO' : 'DEBUG'
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE // Enable X-Ray tracing
    };

    // Initialize functions object
    this.functions = {};

    // 1. Auth Handler Lambda (Post-confirmation trigger)
    this.functions.authHandler = new lambda.Function(this, 'AuthHandler', {
      ...commonProps,
      functionName: `smart-cooking-auth-handler-${environment}`,
      description: 'Handles post-authentication user profile creation',
      code: lambda.Code.fromAsset('lambda/auth-handler'),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(10)
    });

    // 2. User Profile Lambda
    this.functions.userProfile = new lambda.Function(this, 'UserProfile', {
      ...commonProps,
      functionName: `smart-cooking-user-profile-${environment}`,
      description: 'Handles user profile CRUD operations',
      code: lambda.Code.fromAsset('lambda/user-profile'),
      handler: 'index.handler'
    });

    // 3. Ingredient Validator Lambda
    this.functions.ingredientValidator = new lambda.Function(this, 'IngredientValidator', {
      ...commonProps,
      functionName: `smart-cooking-ingredient-validator-${environment}`,
      description: 'Validates ingredients against master database with fuzzy matching',
      code: lambda.Code.fromAsset('lambda/ingredient-validator'),
      handler: 'index.handler',
      environment: {
        ...commonProps.environment,
        ADMIN_TOPIC_ARN: adminTopicArn || ''
      }
    });

    // 4. AI Suggestion Lambda (Higher memory and timeout for AI processing)
    this.functions.aiSuggestion = new lambda.Function(this, 'AISuggestion', {
      ...commonProps,
      functionName: `smart-cooking-ai-suggestion-${environment}`,
      description: 'Generates recipe suggestions using flexible DB/AI mix',
      code: lambda.Code.fromAsset('lambda/ai-suggestion'),
      handler: 'index.handler',
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
      environment: {
        ...commonProps.environment,
        BEDROCK_REGION: 'us-east-1',
        BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0'
      }
    });

    // 5. Cooking History Lambda
    this.functions.cookingHistory = new lambda.Function(this, 'CookingHistory', {
      ...commonProps,
      functionName: `smart-cooking-cooking-history-${environment}`,
      description: 'Manages cooking sessions and history tracking',
      code: lambda.Code.fromAsset('lambda/cooking-history'),
      handler: 'index.handler'
    });

    // 6. Rating Handler Lambda
    this.functions.ratingHandler = new lambda.Function(this, 'RatingHandler', {
      ...commonProps,
      functionName: `smart-cooking-rating-handler-${environment}`,
      description: 'Handles recipe ratings and auto-approval system',
      code: lambda.Code.fromAsset('lambda/rating-handler'),
      handler: 'index.handler'
    });

    // 7. Recipe CRUD Lambda
    this.functions.recipeCrud = new lambda.Function(this, 'RecipeCrud', {
      ...commonProps,
      functionName: `smart-cooking-recipe-crud-${environment}`,
      description: 'Handles recipe CRUD operations and search',
      code: lambda.Code.fromAsset('lambda/recipe-crud'),
      handler: 'index.handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(30)
    });

    // Grant DynamoDB permissions to all Lambda functions
    Object.values(this.functions).forEach(func => {
      table.grantReadWriteData(func);
      
      // Grant additional permissions for specific functions
      if (func === this.functions.aiSuggestion) {
        // Grant Bedrock permissions for AI suggestion
        func.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream'
          ],
          resources: [
            `arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`
          ]
        }));
      }

      if (func === this.functions.ingredientValidator && adminTopicArn) {
        // Grant SNS permissions for admin notifications
        func.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'sns:Publish'
          ],
          resources: [adminTopicArn]
        }));
      }

      // Grant CloudWatch Logs permissions
      func.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        resources: [`arn:aws:logs:*:*:*`]
      }));

      // Grant X-Ray permissions for tracing
      func.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords'
        ],
        resources: ['*']
      }));
    });

    // Set up Cognito trigger for auth handler
    userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, this.functions.authHandler);

    // Outputs for debugging
    Object.entries(this.functions).forEach(([name, func]) => {
      new cdk.CfnOutput(this, `${name}FunctionName`, {
        value: func.functionName,
        description: `${name} Lambda Function Name`,
        exportName: `SmartCooking-${environment}-${name}FunctionName`
      });
    });

    // Tags
    Object.values(this.functions).forEach(func => {
      cdk.Tags.of(func).add('Component', 'Lambda');
      cdk.Tags.of(func).add('Runtime', 'NodeJS20');
    });
  }
}