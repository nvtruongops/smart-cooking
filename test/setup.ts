import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

// Mock AWS SDK clients globally
export const mockDynamoDBClient = mockClient(DynamoDBClient);
export const mockDynamoDBDocumentClient = mockClient(DynamoDBDocumentClient);
export const mockBedrockClient = mockClient(BedrockRuntimeClient);
export const mockS3Client = mockClient(S3Client);
export const mockCognitoClient = mockClient(CognitoIdentityProviderClient);

// Setup test environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'ap-southeast-1';
process.env.DYNAMODB_TABLE = 'smart-cooking-data-test';
process.env.S3_BUCKET = 'smart-cooking-user-content-test';
process.env.COGNITO_USER_POOL_ID = 'ap-southeast-1_test123';
process.env.COGNITO_CLIENT_ID = 'test-client-id';
process.env.LOG_LEVEL = 'ERROR'; // Reduce log noise in tests

// Global test setup
beforeEach(() => {
  // Reset all mocks before each test
  mockDynamoDBClient.reset();
  mockDynamoDBDocumentClient.reset();
  mockBedrockClient.reset();
  mockS3Client.reset();
  mockCognitoClient.reset();
  
  // Clear all timers
  jest.clearAllTimers();
  
  // Reset console methods
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up any remaining timers
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// Global test teardown
afterAll(() => {
  // Restore all mocks
  mockDynamoDBClient.restore();
  mockDynamoDBDocumentClient.restore();
  mockBedrockClient.restore();
  mockS3Client.restore();
  mockCognitoClient.restore();
});

// Suppress console output during tests unless LOG_LEVEL is DEBUG
if (process.env.LOG_LEVEL !== 'DEBUG') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Mock Date.now for consistent timestamps in tests
const mockDate = new Date('2024-01-01T00:00:00.000Z');
jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
Date.now = jest.fn(() => mockDate.getTime());

// Mock UUID for consistent test data
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234-5678-9012'),
}));

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidISODate(): R;
      toMatchDynamoDBItem(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },
  
  toBeValidISODate(received: string) {
    const date = new Date(received);
    const pass = !isNaN(date.getTime()) && received === date.toISOString();
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid ISO date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid ISO date`,
        pass: false,
      };
    }
  },
  
  toMatchDynamoDBItem(received: any) {
    const hasRequiredFields = received.PK && received.SK && received.entity_type;
    const pass = typeof received === 'object' && hasRequiredFields;
    
    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to match DynamoDB item structure`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to match DynamoDB item structure (PK, SK, entity_type)`,
        pass: false,
      };
    }
  },
});