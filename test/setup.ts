// Jest setup file for Smart Cooking MVP tests

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-cognito-identity-provider');

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-123'
}));

// Set test environment variables
process.env.DYNAMODB_TABLE = 'test-smart-cooking-data';
process.env.USER_POOL_ID = 'test-user-pool-id';
process.env.USER_POOL_CLIENT_ID = 'test-client-id';
process.env.S3_BUCKET = 'test-smart-cooking-images';
process.env.BEDROCK_REGION = 'us-east-1';

// Global test timeout
jest.setTimeout(30000);