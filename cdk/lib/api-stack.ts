import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ApiStackProps {
  environment: string;
  userPool: cognito.UserPool;
  lambdaFunctions: { [key: string]: lambda.Function };
  enableWaf: boolean;
}

export class ApiStack extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id);

    const { environment, userPool, lambdaFunctions, enableWaf } = props;

    // Create API Gateway
    this.api = new apigateway.RestApi(this, 'SmartCookingApi', {
      restApiName: `smart-cooking-api-${environment}`,
      description: 'Smart Cooking MVP REST API',
      
      // CORS configuration
      defaultCorsPreflightOptions: {
        allowOrigins: environment === 'prod' 
          ? ['https://smartcooking.com'] // Replace with your domain
          : apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent'
        ],
        allowCredentials: true
      },

      // API Gateway configuration
      deployOptions: {
        stageName: environment,
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: environment !== 'prod',
        metricsEnabled: true,
        tracingEnabled: true, // Enable X-Ray tracing
        cachingEnabled: environment === 'prod',
        cacheClusterEnabled: environment === 'prod',
        cacheClusterSize: environment === 'prod' ? '0.5' : undefined
      },

      // Binary media types
      binaryMediaTypes: ['image/*', 'application/octet-stream'],

      // Endpoint configuration
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      }
    });

    // Cognito Authorizer
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: `smart-cooking-authorizer-${environment}`,
      identitySource: 'method.request.header.Authorization'
    });

    // Request validators
    const requestValidator = new apigateway.RequestValidator(this, 'RequestValidator', {
      restApi: this.api,
      requestValidatorName: 'request-validator',
      validateRequestBody: true,
      validateRequestParameters: true
    });

    // Request/Response Models for validation
    const errorResponseModel = new apigateway.Model(this, 'ErrorResponseModel', {
      restApi: this.api,
      modelName: 'ErrorResponse',
      contentType: 'application/json',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          error: { type: apigateway.JsonSchemaType.STRING },
          message: { type: apigateway.JsonSchemaType.STRING },
          details: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: {
              type: apigateway.JsonSchemaType.OBJECT,
              properties: {
                field: { type: apigateway.JsonSchemaType.STRING },
                value: { type: apigateway.JsonSchemaType.STRING },
                constraint: { type: apigateway.JsonSchemaType.STRING }
              }
            }
          }
        },
        required: ['error', 'message']
      }
    });

    const aiSuggestionRequestModel = new apigateway.Model(this, 'AISuggestionRequestModel', {
      restApi: this.api,
      modelName: 'AISuggestionRequest',
      contentType: 'application/json',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          ingredients: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: { type: apigateway.JsonSchemaType.STRING },
            minItems: 2,
            maxItems: 10
          },
          recipe_count: {
            type: apigateway.JsonSchemaType.INTEGER,
            minimum: 1,
            maximum: 5
          }
        },
        required: ['ingredients']
      }
    });

    const ingredientValidationRequestModel = new apigateway.Model(this, 'IngredientValidationRequestModel', {
      restApi: this.api,
      modelName: 'IngredientValidationRequest',
      contentType: 'application/json',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          ingredients: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: { type: apigateway.JsonSchemaType.STRING },
            minItems: 1,
            maxItems: 20
          }
        },
        required: ['ingredients']
      }
    });

    const userProfileCreateModel = new apigateway.Model(this, 'UserProfileCreateModel', {
      restApi: this.api,
      modelName: 'UserProfileCreate',
      contentType: 'application/json',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          email: { type: apigateway.JsonSchemaType.STRING, maxLength: 100 },
          username: { type: apigateway.JsonSchemaType.STRING, maxLength: 50 },
          full_name: { type: apigateway.JsonSchemaType.STRING, maxLength: 100 },
          date_of_birth: { type: apigateway.JsonSchemaType.STRING, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          gender: { type: apigateway.JsonSchemaType.STRING, enum: ['male', 'female', 'other'] },
          country: { type: apigateway.JsonSchemaType.STRING, maxLength: 50 },
          avatar_url: { type: apigateway.JsonSchemaType.STRING, maxLength: 500 }
        },
        required: ['email', 'username', 'full_name']
      }
    });

    const userProfileUpdateModel = new apigateway.Model(this, 'UserProfileUpdateModel', {
      restApi: this.api,
      modelName: 'UserProfileUpdate',
      contentType: 'application/json',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          full_name: { type: apigateway.JsonSchemaType.STRING, maxLength: 100 },
          date_of_birth: { type: apigateway.JsonSchemaType.STRING, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          gender: { type: apigateway.JsonSchemaType.STRING, enum: ['male', 'female', 'other'] },
          country: { type: apigateway.JsonSchemaType.STRING, maxLength: 50 },
          avatar_url: { type: apigateway.JsonSchemaType.STRING, maxLength: 500 }
        }
      }
    });

    const userPreferencesModel = new apigateway.Model(this, 'UserPreferencesModel', {
      restApi: this.api,
      modelName: 'UserPreferences',
      contentType: 'application/json',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          dietary_restrictions: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: { type: apigateway.JsonSchemaType.STRING }
          },
          allergies: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: { type: apigateway.JsonSchemaType.STRING }
          },
          favorite_cuisines: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: { type: apigateway.JsonSchemaType.STRING }
          },
          preferred_cooking_methods: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: { type: apigateway.JsonSchemaType.STRING }
          }
        }
      }
    });

    const ratingRequestModel = new apigateway.Model(this, 'RatingRequestModel', {
      restApi: this.api,
      modelName: 'RatingRequest',
      contentType: 'application/json',
      schema: {
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          recipe_id: { type: apigateway.JsonSchemaType.STRING },
          rating: { 
            type: apigateway.JsonSchemaType.INTEGER,
            minimum: 1,
            maximum: 5
          },
          comment: { type: apigateway.JsonSchemaType.STRING, maxLength: 500 },
          history_id: { type: apigateway.JsonSchemaType.STRING }
        },
        required: ['recipe_id', 'rating']
      }
    });

    // Common method responses for error handling
    const commonMethodResponses = [
      {
        statusCode: '200',
        responseModels: {
          'application/json': apigateway.Model.EMPTY_MODEL
        }
      },
      {
        statusCode: '400',
        responseModels: {
          'application/json': errorResponseModel
        }
      },
      {
        statusCode: '401',
        responseModels: {
          'application/json': errorResponseModel
        }
      },
      {
        statusCode: '403',
        responseModels: {
          'application/json': errorResponseModel
        }
      },
      {
        statusCode: '500',
        responseModels: {
          'application/json': errorResponseModel
        }
      }
    ];

    // API Resources and Methods

    // 1. User Profile endpoints
    const userResource = this.api.root.addResource('user');
    const profileResource = userResource.addResource('profile');
    
    profileResource.addMethod('GET', new apigateway.LambdaIntegration(lambdaFunctions.userProfile), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: commonMethodResponses
    });
    
    profileResource.addMethod('POST', new apigateway.LambdaIntegration(lambdaFunctions.userProfile), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      requestModels: {
        'application/json': userProfileCreateModel
      },
      methodResponses: commonMethodResponses
    });
    
    profileResource.addMethod('PUT', new apigateway.LambdaIntegration(lambdaFunctions.userProfile), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      requestModels: {
        'application/json': userProfileUpdateModel
      },
      methodResponses: commonMethodResponses
    });

    const preferencesResource = userResource.addResource('preferences');
    
    preferencesResource.addMethod('GET', new apigateway.LambdaIntegration(lambdaFunctions.userProfile), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: commonMethodResponses
    });
    
    preferencesResource.addMethod('POST', new apigateway.LambdaIntegration(lambdaFunctions.userProfile), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      requestModels: {
        'application/json': userPreferencesModel
      },
      methodResponses: commonMethodResponses
    });
    
    preferencesResource.addMethod('PUT', new apigateway.LambdaIntegration(lambdaFunctions.userProfile), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      requestModels: {
        'application/json': userPreferencesModel
      },
      methodResponses: commonMethodResponses
    });

    // 2. Ingredient validation endpoints
    const ingredientsResource = this.api.root.addResource('ingredients');
    const validateResource = ingredientsResource.addResource('validate');
    
    validateResource.addMethod('POST', new apigateway.LambdaIntegration(lambdaFunctions.ingredientValidator), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      requestModels: {
        'application/json': ingredientValidationRequestModel
      },
      methodResponses: commonMethodResponses
    });

    // 3. AI suggestion endpoints
    const aiResource = this.api.root.addResource('ai');
    const suggestResource = aiResource.addResource('suggest');
    
    suggestResource.addMethod('POST', new apigateway.LambdaIntegration(lambdaFunctions.aiSuggestion, {
      timeout: cdk.Duration.seconds(29) // API Gateway max timeout
    }), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      requestModels: {
        'application/json': aiSuggestionRequestModel
      },
      methodResponses: commonMethodResponses
    });

    // 4. Cooking history endpoints
    const cookingResource = this.api.root.addResource('cooking');
    const historyResource = cookingResource.addResource('history');
    
    historyResource.addMethod('GET', new apigateway.LambdaIntegration(lambdaFunctions.cookingHistory), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: commonMethodResponses
    });
    
    historyResource.addMethod('POST', new apigateway.LambdaIntegration(lambdaFunctions.cookingHistory), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      methodResponses: commonMethodResponses
    });

    const sessionResource = cookingResource.addResource('session');
    const sessionIdResource = sessionResource.addResource('{sessionId}');
    
    sessionIdResource.addMethod('PUT', new apigateway.LambdaIntegration(lambdaFunctions.cookingHistory), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      methodResponses: commonMethodResponses
    });

    // 5. Rating endpoints
    const ratingsResource = this.api.root.addResource('ratings');
    
    ratingsResource.addMethod('POST', new apigateway.LambdaIntegration(lambdaFunctions.ratingHandler), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      requestModels: {
        'application/json': ratingRequestModel
      },
      methodResponses: commonMethodResponses
    });

    // 6. Recipe endpoints
    const recipesResource = this.api.root.addResource('recipes');
    
    recipesResource.addMethod('GET', new apigateway.LambdaIntegration(lambdaFunctions.recipeCrud), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: commonMethodResponses
    });
    
    recipesResource.addMethod('POST', new apigateway.LambdaIntegration(lambdaFunctions.recipeCrud), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      methodResponses: commonMethodResponses
    });

    const recipeIdResource = recipesResource.addResource('{recipeId}');
    
    recipeIdResource.addMethod('GET', new apigateway.LambdaIntegration(lambdaFunctions.recipeCrud), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: commonMethodResponses
    });
    
    recipeIdResource.addMethod('PUT', new apigateway.LambdaIntegration(lambdaFunctions.recipeCrud), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator,
      methodResponses: commonMethodResponses
    });
    
    recipeIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaFunctions.recipeCrud), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: commonMethodResponses
    });

    // Health check endpoint (no auth required)
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [{
        statusCode: '200',
        responseTemplates: {
          'application/json': JSON.stringify({
            status: 'healthy',
            timestamp: '$context.requestTime',
            environment: environment
          })
        }
      }],
      requestTemplates: {
        'application/json': '{"statusCode": 200}'
      }
    }), {
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': apigateway.Model.EMPTY_MODEL
        }
      }]
    });

    // Set API URL
    this.apiUrl = this.api.url;

    // WAF Configuration (if enabled)
    if (enableWaf) {
      const webAcl = new wafv2.CfnWebACL(this, 'ApiWebAcl', {
        scope: 'REGIONAL',
        defaultAction: { allow: {} },
        name: `smart-cooking-api-waf-${environment}`,
        description: 'WAF for Smart Cooking API',
        rules: [
          {
            name: 'AWSManagedRulesCommonRuleSet',
            priority: 1,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet'
              }
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'CommonRuleSetMetric'
            }
          },
          {
            name: 'AWSManagedRulesKnownBadInputsRuleSet',
            priority: 2,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesKnownBadInputsRuleSet'
              }
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'KnownBadInputsRuleSetMetric'
            }
          },
          {
            name: 'RateLimitRule',
            priority: 3,
            action: { block: {} },
            statement: {
              rateBasedStatement: {
                limit: 2000,
                aggregateKeyType: 'IP'
              }
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'RateLimitRuleMetric'
            }
          }
        ],
        visibilityConfig: {
          sampledRequestsEnabled: true,
          cloudWatchMetricsEnabled: true,
          metricName: `SmartCookingApiWaf${environment}`
        }
      });

      // Associate WAF with API Gateway
      new wafv2.CfnWebACLAssociation(this, 'ApiWebAclAssociation', {
        resourceArn: this.api.deploymentStage.stageArn,
        webAclArn: webAcl.attrArn
      });
    }

    // CloudWatch Log Group for API Gateway
    new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/aws/apigateway/smart-cooking-${environment}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiUrl,
      description: 'API Gateway URL',
      exportName: `SmartCooking-${environment}-ApiUrl`
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'API Gateway ID',
      exportName: `SmartCooking-${environment}-ApiId`
    });

    // Gateway Responses for better error handling
    this.api.addGatewayResponse('Unauthorized', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'"
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'unauthorized',
          message: 'Authentication required. Please provide a valid JWT token.'
        })
      }
    });

    this.api.addGatewayResponse('AccessDenied', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      statusCode: '403',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'"
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'forbidden',
          message: 'Access denied. Insufficient permissions.'
        })
      }
    });

    this.api.addGatewayResponse('BadRequestBody', {
      type: apigateway.ResponseType.BAD_REQUEST_BODY,
      statusCode: '400',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'"
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'validation_failed',
          message: 'Invalid request body. Please check your input data.',
          details: '$context.error.validationErrorString'
        })
      }
    });

    this.api.addGatewayResponse('BadRequestParameters', {
      type: apigateway.ResponseType.BAD_REQUEST_PARAMETERS,
      statusCode: '400',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'"
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'validation_failed',
          message: 'Invalid request parameters. Please check your query parameters.',
          details: '$context.error.validationErrorString'
        })
      }
    });

    this.api.addGatewayResponse('Default4xx', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'"
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'client_error',
          message: 'Bad request. Please check your request and try again.',
          request_id: '$context.requestId'
        })
      }
    });

    this.api.addGatewayResponse('Default5xx', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'*'"
      },
      templates: {
        'application/json': JSON.stringify({
          error: 'server_error',
          message: 'Internal server error. Please try again later.',
          request_id: '$context.requestId'
        })
      }
    });

    // Usage Plan for API management
    const usagePlan = new apigateway.UsagePlan(this, 'ApiUsagePlan', {
      name: `smart-cooking-usage-plan-${environment}`,
      description: 'Usage plan for Smart Cooking API',
      throttle: {
        rateLimit: 1000,
        burstLimit: 2000
      },
      quota: {
        limit: environment === 'prod' ? 100000 : 10000, // Requests per month
        period: apigateway.Period.MONTH
      },
      apiStages: [{
        api: this.api,
        stage: this.api.deploymentStage
      }]
    });

    // API Key for monitoring and analytics
    const apiKey = new apigateway.ApiKey(this, 'ApiKey', {
      apiKeyName: `smart-cooking-api-key-${environment}`,
      description: 'API Key for Smart Cooking application'
    });

    // Associate API Key with Usage Plan
    usagePlan.addApiKey(apiKey);

    // Output API Key ID
    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID',
      exportName: `SmartCooking-${environment}-ApiKeyId`
    });

    // Tags
    cdk.Tags.of(this.api).add('Component', 'API');
  }
}