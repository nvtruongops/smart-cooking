/**
 * Test Suite: user-profile Lambda Function
 * 
 * Purpose: CRUD operations for user profile & avatar upload
 * Trigger: API Gateway
 * Memory: 256MB | Timeout: 30s
 * 
 * Endpoints:
 * - GET /v1/users/me/stats - User statistics
 * - GET /v1/users/profile - Get profile
 * - POST /v1/users/profile - Create profile
 * - PUT /v1/users/profile - Update profile
 * - POST /v1/users/profile/avatar/presigned - Get S3 presigned URL
 * 
 * References:
 * - docs/lambda/README.md - Lambda function details
 * - docs/dynamodb/SCHEMA.md - User Profile schema
 */

import { handler } from './index';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const dynamoMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);

describe('user-profile Lambda Function', () => {
  beforeEach(() => {
    dynamoMock.reset();
    s3Mock.reset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /v1/users/profile - Get User Profile', () => {
    it('should return user profile successfully', async () => {
      const mockProfile = {
        PK: { S: 'USER#user-123' },
        SK: { S: 'PROFILE' },
        user_id: { S: 'user-123' },
        email: { S: 'user@example.com' },
        username: { S: 'chef_master' },
        full_name: { S: 'Nguyen Van A' },
        bio: { S: 'Passionate home cook' },
        account_status: { S: 'active' },
        created_at: { S: '2025-01-15T10:30:00Z' }
      };

      dynamoMock.on(GetItemCommand).resolves({ Item: mockProfile });

      const event = {
        httpMethod: 'GET',
        path: '/v1/users/profile',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123'
            }
          }
        }
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.user_id).toBe('user-123');
      expect(body.data.email).toBe('user@example.com');
      expect(body.data.account_status).toBe('active');
    });

    it('should return 404 when user profile not found', async () => {
      dynamoMock.on(GetItemCommand).resolves({ Item: undefined });

      const event = {
        httpMethod: 'GET',
        path: '/v1/users/profile',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'nonexistent-user'
            }
          }
        }
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.data.message).toContain('not found');
    });
  });

  describe('PUT /v1/users/profile - Update User Profile', () => {
    it('should update user profile bio and full_name', async () => {
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: {
          user_id: { S: 'user-456' },
          bio: { S: 'Updated bio content' },
          full_name: { S: 'Updated Name' }
        }
      });

      const event = {
        httpMethod: 'PUT',
        path: '/v1/users/profile',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-456'
            }
          }
        },
        body: JSON.stringify({
          bio: 'Updated bio content',
          full_name: 'Updated Name'
        })
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.bio).toBe('Updated bio content');
      expect(body.data.full_name).toBe('Updated Name');
    });

    it('should reject bio longer than 500 characters', async () => {
      const longBio = 'a'.repeat(501);

      const event = {
        httpMethod: 'PUT',
        path: '/v1/users/profile',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-789'
            }
          }
        },
        body: JSON.stringify({
          bio: longBio
        })
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.data.message).toContain('500 characters');
    });

    it('should update updated_at timestamp', async () => {
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: {
          user_id: { S: 'user-timestamp' },
          updated_at: { S: new Date().toISOString() }
        }
      });

      const event = {
        httpMethod: 'PUT',
        path: '/v1/users/profile',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-timestamp'
            }
          }
        },
        body: JSON.stringify({
          bio: 'New bio'
        })
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      
      const updateCall = dynamoMock.call(0);
      expect(updateCall.args[0].input.UpdateExpression).toContain('updated_at');
    });
  });

  describe('GET /v1/users/me/stats - User Statistics', () => {
    it('should return user statistics summary', async () => {
      // Mock user profile
      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          user_id: { S: 'stats-user' },
          email: { S: 'stats@example.com' }
        }
      });

      const event = {
        httpMethod: 'GET',
        path: '/v1/users/me/stats',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'stats-user'
            }
          }
        }
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('total_recipes');
      expect(body).toHaveProperty('total_sessions');
      expect(body).toHaveProperty('total_ratings');
    });
  });

  describe('POST /v1/users/profile/avatar/presigned - S3 Presigned URL', () => {
    it('should generate S3 presigned URL for avatar upload', async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      const event = {
        httpMethod: 'POST',
        path: '/v1/users/profile/avatar/presigned',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'avatar-user'
            }
          }
        },
        body: JSON.stringify({
          fileName: 'avatar.jpg',
          fileType: 'image/jpeg'
        })
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('uploadUrl');
      expect(body).toHaveProperty('avatarUrl');
      expect(body.data.uploadUrl).toContain('amazonaws.com');
    });

    it('should reject invalid image file types', async () => {
      const event = {
        httpMethod: 'POST',
        path: '/v1/users/profile/avatar/presigned',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'invalid-user'
            }
          }
        },
        body: JSON.stringify({
          fileName: 'malware.exe',
          fileType: 'application/x-msdownload'
        })
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.data.message).toContain('Invalid file type');
    });
  });

  describe('Account Status Handling', () => {
    it('should reject requests from suspended users', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          user_id: { S: 'suspended-user' },
          account_status: { S: 'suspended' },
          suspended_at: { S: '2025-10-08T10:00:00Z' },
          suspension_reason: { S: 'Abuse detected' }
        }
      });

      const event = {
        httpMethod: 'PUT',
        path: '/v1/users/profile',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'suspended-user'
            }
          }
        },
        body: JSON.stringify({
          bio: 'Trying to update'
        })
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.data.message).toContain('suspended');
    });
  });
});
