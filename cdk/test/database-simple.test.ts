import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Template } from 'aws-cdk-lib/assertions';
import { DatabaseStack } from '../lib/database-stack';

describe('DatabaseStack', () => {
    test('creates DynamoDB table with correct configuration', () => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'TestStack');

        const databaseStack = new DatabaseStack(stack, 'TestDatabase', {
            environment: 'test',
            enablePointInTimeRecovery: true,
            logRetentionDays: logs.RetentionDays.ONE_WEEK
        });

        expect(databaseStack.table).toBeDefined();

        // Verify the table configuration using CloudFormation template
        const template = Template.fromStack(stack);

        // Check main table properties
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'smart-cooking-data-test',
            BillingMode: 'PAY_PER_REQUEST',
            AttributeDefinitions: [
                { AttributeName: 'PK', AttributeType: 'S' },
                { AttributeName: 'SK', AttributeType: 'S' },
                { AttributeName: 'GSI1PK', AttributeType: 'S' },
                { AttributeName: 'GSI1SK', AttributeType: 'S' },
                { AttributeName: 'GSI2PK', AttributeType: 'S' },
                { AttributeName: 'GSI2SK', AttributeType: 'S' },
                { AttributeName: 'GSI3PK', AttributeType: 'S' },
                { AttributeName: 'GSI3SK', AttributeType: 'S' }
            ],
            KeySchema: [
                { AttributeName: 'PK', KeyType: 'HASH' },
                { AttributeName: 'SK', KeyType: 'RANGE' }
            ],
            PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: true
            },
            TimeToLiveSpecification: {
                AttributeName: 'ttl',
                Enabled: true
            },
            StreamSpecification: {
                StreamViewType: 'NEW_AND_OLD_IMAGES'
            }
        });

        // Check GSI configurations
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
                },
                {
                    IndexName: 'GSI3',
                    KeySchema: [
                        { AttributeName: 'GSI3PK', KeyType: 'HASH' },
                        { AttributeName: 'GSI3SK', KeyType: 'RANGE' }
                    ],
                    Projection: { ProjectionType: 'ALL' }
                }
            ]
        });

        // Check CloudWatch log group
        template.hasResourceProperties('AWS::Logs::LogGroup', {
            LogGroupName: '/aws/dynamodb/smart-cooking-test',
            RetentionInDays: 7
        });
    });

    test('creates table with production settings', () => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'ProdStack');

        const databaseStack = new DatabaseStack(stack, 'ProdDatabase', {
            environment: 'prod',
            enablePointInTimeRecovery: true,
            logRetentionDays: logs.RetentionDays.ONE_MONTH
        });

        const template = Template.fromStack(stack);

        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'smart-cooking-data-prod',
            PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: true
            }
        });

        template.hasResourceProperties('AWS::Logs::LogGroup', {
            LogGroupName: '/aws/dynamodb/smart-cooking-prod',
            RetentionInDays: 30
        });
    });

    test('creates table with dev settings', () => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, 'DevStack');

        const databaseStack = new DatabaseStack(stack, 'DevDatabase', {
            environment: 'dev',
            enablePointInTimeRecovery: false,
            logRetentionDays: logs.RetentionDays.ONE_WEEK
        });

        const template = Template.fromStack(stack);

        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'smart-cooking-data-dev',
            PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: false
            }
        });
    });
});