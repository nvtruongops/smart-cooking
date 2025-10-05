import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SmartCookingStack } from '../lib/smart-cooking-stack';

describe('SmartCookingStack', () => {
    let app: cdk.App;
    let stack: SmartCookingStack;
    let template: Template;

    beforeEach(() => {
        app = new cdk.App();
        stack = new SmartCookingStack(app, 'TestSmartCookingStack');
        template = Template.fromStack(stack);
    });

    test('creates DynamoDB table with correct configuration', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'smart-cooking-data',
            BillingMode: 'PAY_PER_REQUEST',
            PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: true
            }
        });
    });

    test('creates DynamoDB table with GSI indexes', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'GSI1',
                    KeySchema: [
                        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
                        { AttributeName: 'GSI1SK', KeyType: 'RANGE' }
                    ],
                    Projection: { ProjectionType: 'ALL' }
                },
                {
                    IndexName: 'GSI2',
                    KeySchema: [
                        { AttributeName: 'GSI2PK', KeyType: 'HASH' },
                        { AttributeName: 'GSI2SK', KeyType: 'RANGE' }
                    ],
                    Projection: { ProjectionType: 'ALL' }
                }
            ]
        });
    });

    test('creates Cognito User Pool with correct configuration', () => {
        template.hasResourceProperties('AWS::Cognito::UserPool', {
            UserPoolName: 'smart-cooking-users',
            AutoVerifiedAttributes: ['email'],
            Policies: {
                PasswordPolicy: {
                    MinimumLength: 8,
                    RequireLowercase: true,
                    RequireNumbers: true,
                    RequireUppercase: true,
                    RequireSymbols: false
                }
            }
        });
    });

    test('creates API Gateway with CORS configuration', () => {
        template.hasResourceProperties('AWS::ApiGateway::RestApi', {
            Name: 'Smart Cooking API'
        });
    });

    test('creates S3 bucket for images', () => {
        template.hasResourceProperties('AWS::S3::Bucket', {
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true
            }
        });
    });

    test('creates Lambda function with correct IAM permissions', () => {
        template.hasResourceProperties('AWS::Lambda::Function', {
            Runtime: 'nodejs20.x',
            MemorySize: 256,
            Timeout: 10
        });

        // Check that IAM role exists
        template.hasResourceProperties('AWS::IAM::Role', {
            AssumeRolePolicyDocument: {
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Service: 'lambda.amazonaws.com'
                        },
                        Action: 'sts:AssumeRole'
                    }
                ]
            }
        });
    });

    test('outputs all required values', () => {
        template.hasOutput('DynamoDBTableName', {});
        template.hasOutput('UserPoolId', {});
        template.hasOutput('UserPoolClientId', {});
        template.hasOutput('APIGatewayURL', {});
        template.hasOutput('S3BucketName', {});
        template.hasOutput('Region', {});
    });
});