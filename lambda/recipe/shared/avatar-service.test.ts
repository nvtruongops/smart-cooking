/**
 * Unit tests for Avatar Service
 * Tests S3 integration, validation, and error handling
 */

import { AppError } from './responses';

// Mock shared utilities first
jest.mock('./utils', () => ({
  logStructured: jest.fn()
}));

// Mock AWS SDK with factory function to avoid hoisting issues
let mockS3Send: jest.Mock;

jest.mock('@aws-sdk/client-s3', () => {
  mockS3Send = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockS3Send
    })),
    PutObjectCommand: jest.fn(),
    CopyObjectCommand: jest.fn()
  };
});

// Import after mocks are set up
import { AvatarService } from './avatar-service';

const { S3Client, PutObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
const utilsMock = require('./utils');

describe('AvatarService', () => {
  const mockUserId = 'test-user-123';
  const mockBucketName = 'smart-cooking-images';
  const mockRegion = 'us-east-1';
  
  const validJpegBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A';
  const validPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set environment variables
    process.env.S3_BUCKET_NAME = mockBucketName;
    process.env.AWS_REGION = mockRegion;
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.S3_BUCKET_NAME;
    delete process.env.AWS_REGION;
  });

  describe('setDefaultAvatar', () => {
    it('should copy default avatar to user folder successfully', async () => {
      mockS3Send.mockResolvedValue({});

      const result = await AvatarService.setDefaultAvatar(mockUserId);

      expect(result).toEqual({
        avatar_url: `https://${mockBucketName}.s3.${mockRegion}.amazonaws.com/${mockUserId}/avatar/avatar.png`,
        avatar_key: `${mockUserId}/avatar/avatar.png`,
        is_default: true
      });

      // Verify S3 copy command was called correctly
      expect(CopyObjectCommand).toHaveBeenCalledWith({
        Bucket: mockBucketName,
        CopySource: `${mockBucketName}/default/avatar.png`,
        Key: `${mockUserId}/avatar/avatar.png`,
        ContentType: 'image/png',
        CacheControl: 'max-age=31536000',
        Metadata: {
          'user-id': mockUserId,
          'is-default': 'true',
          'created-at': expect.any(String)
        }
      });

      expect(mockS3Send).toHaveBeenCalledWith(expect.any(Object));

      // Verify logging
      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'INFO',
        'Default avatar set for user',
        {
          userId: mockUserId,
          avatarKey: `${mockUserId}/avatar/avatar.png`,
          avatarUrl: `https://${mockBucketName}.s3.${mockRegion}.amazonaws.com/${mockUserId}/avatar/avatar.png`
        }
      );
    });

    it('should handle S3 copy failure', async () => {
      const s3Error = new Error('Access denied');
      mockS3Send.mockRejectedValue(s3Error);

      await expect(AvatarService.setDefaultAvatar(mockUserId))
        .rejects.toThrow(AppError);

      await expect(AvatarService.setDefaultAvatar(mockUserId))
        .rejects.toThrow('Failed to set default avatar');

      // Verify error logging
      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'ERROR',
        'Failed to set default avatar',
        {
          userId: mockUserId,
          error: 'Access denied'
        }
      );
    });

    it('should use default environment values when not set', async () => {
      delete process.env.S3_BUCKET_NAME;
      delete process.env.AWS_REGION;

      mockS3Send.mockResolvedValue({});

      const result = await AvatarService.setDefaultAvatar(mockUserId);

      expect(result.avatar_url).toBe(`https://smart-cooking-images.s3.us-east-1.amazonaws.com/${mockUserId}/avatar/avatar.png`);
    });
  });

  describe('uploadAvatar', () => {

    it('should upload JPEG avatar successfully', async () => {
      mockS3Send.mockResolvedValue({});

      const request = {
        user_id: mockUserId,
        image_data: validJpegBase64,
        content_type: 'image/jpeg'
      };

      const result = await AvatarService.uploadAvatar(request);

      expect(result).toEqual({
        avatar_url: `https://${mockBucketName}.s3.${mockRegion}.amazonaws.com/${mockUserId}/avatar/avatar.jpg`,
        avatar_key: `${mockUserId}/avatar/avatar.jpg`,
        is_default: false
      });

      // Verify S3 put command was called correctly
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: mockBucketName,
        Key: `${mockUserId}/avatar/avatar.jpg`,
        Body: expect.any(Buffer),
        ContentType: 'image/jpeg',
        CacheControl: 'max-age=31536000',
        Metadata: {
          'user-id': mockUserId,
          'is-default': 'false',
          'uploaded-at': expect.any(String)
        }
      });

      expect(mockS3Send).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should upload PNG avatar successfully', async () => {
      mockS3Send.mockResolvedValue({});

      const request = {
        user_id: mockUserId,
        image_data: validPngBase64,
        content_type: 'image/png'
      };

      const result = await AvatarService.uploadAvatar(request);

      expect(result.avatar_key).toBe(`${mockUserId}/avatar/avatar.png`);
      expect(result.is_default).toBe(false);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: `${mockUserId}/avatar/avatar.png`,
          ContentType: 'image/png'
        })
      );
    });

    it('should validate required fields', async () => {
      const requestWithoutImageData = {
        user_id: mockUserId,
        content_type: 'image/jpeg'
        // Missing image_data
      };

      await expect(AvatarService.uploadAvatar(requestWithoutImageData))
        .rejects.toThrow(AppError);

      await expect(AvatarService.uploadAvatar(requestWithoutImageData))
        .rejects.toThrow('image_data and content_type are required');

      const requestWithoutContentType = {
        user_id: mockUserId,
        image_data: validJpegBase64
        // Missing content_type
      };

      await expect(AvatarService.uploadAvatar(requestWithoutContentType))
        .rejects.toThrow('image_data and content_type are required');
    });

    it('should validate content type', async () => {
      const requestWithInvalidContentType = {
        user_id: mockUserId,
        image_data: validJpegBase64,
        content_type: 'image/gif' // Not allowed
      };

      await expect(AvatarService.uploadAvatar(requestWithInvalidContentType))
        .rejects.toThrow(AppError);

      await expect(AvatarService.uploadAvatar(requestWithInvalidContentType))
        .rejects.toThrow('Content type must be one of: image/jpeg, image/png, image/jpg');
    });

    it('should validate image size (max 2MB)', async () => {
      const largeImageData = 'data:image/jpeg;base64,' + 'A'.repeat(3000000); // ~3MB base64

      const requestWithLargeImage = {
        user_id: mockUserId,
        image_data: largeImageData,
        content_type: 'image/jpeg'
      };

      await expect(AvatarService.uploadAvatar(requestWithLargeImage))
        .rejects.toThrow(AppError);

      await expect(AvatarService.uploadAvatar(requestWithLargeImage))
        .rejects.toThrow('Avatar size must not exceed 2MB');
    });

    it('should validate base64 image data', async () => {
      const requestWithInvalidBase64 = {
        user_id: mockUserId,
        image_data: 'not!!!valid!!!base64===', // Invalid characters
        content_type: 'image/jpeg'
      };

      await expect(AvatarService.uploadAvatar(requestWithInvalidBase64))
        .rejects.toThrow(AppError);

      await expect(AvatarService.uploadAvatar(requestWithInvalidBase64))
        .rejects.toThrow('Invalid base64 image data');
    });

    it('should handle S3 upload failure', async () => {
      const s3Error = new Error('S3 service unavailable');
      mockS3Send.mockRejectedValue(s3Error);

      const request = {
        user_id: mockUserId,
        image_data: validJpegBase64,
        content_type: 'image/jpeg'
      };

      await expect(AvatarService.uploadAvatar(request))
        .rejects.toThrow(AppError);

      await expect(AvatarService.uploadAvatar(request))
        .rejects.toThrow('Failed to upload avatar to S3');

      // Verify error logging
      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'ERROR',
        'Failed to upload avatar to S3',
        {
          userId: mockUserId,
          error: 'S3 service unavailable'
        }
      );
    });

    it('should strip data URL prefix from base64', async () => {
      mockS3Send.mockResolvedValue({});

      const request = {
        user_id: mockUserId,
        image_data: validJpegBase64, // Includes data:image/jpeg;base64, prefix
        content_type: 'image/jpeg'
      };

      await AvatarService.uploadAvatar(request);

      // Verify the buffer was created from clean base64 (without prefix)
      const putCall = PutObjectCommand.mock.calls[0][0];
      expect(putCall.Body).toBeInstanceOf(Buffer);
      expect(putCall.Body.length).toBeGreaterThan(0);
    });

    it('should handle different file extensions correctly', async () => {
      mockS3Send.mockResolvedValue({});

      // Test image/jpg content type
      const jpgRequest = {
        user_id: mockUserId,
        image_data: validJpegBase64,
        content_type: 'image/jpg'
      };

      const jpgResult = await AvatarService.uploadAvatar(jpgRequest);
      expect(jpgResult.avatar_key).toBe(`${mockUserId}/avatar/avatar.jpg`);

      // Test image/jpeg content type
      const jpegRequest = {
        user_id: mockUserId,
        image_data: validJpegBase64,
        content_type: 'image/jpeg'
      };

      const jpegResult = await AvatarService.uploadAvatar(jpegRequest);
      expect(jpegResult.avatar_key).toBe(`${mockUserId}/avatar/avatar.jpg`);

      // Test image/png content type
      const pngRequest = {
        user_id: mockUserId,
        image_data: validPngBase64,
        content_type: 'image/png'
      };

      const pngResult = await AvatarService.uploadAvatar(pngRequest);
      expect(pngResult.avatar_key).toBe(`${mockUserId}/avatar/avatar.png`);
    });

    it('should log successful upload', async () => {
      mockS3Send.mockResolvedValue({});

      const request = {
        user_id: mockUserId,
        image_data: validJpegBase64,
        content_type: 'image/jpeg'
      };

      await AvatarService.uploadAvatar(request);

      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'INFO',
        'Avatar uploaded successfully',
        {
          userId: mockUserId,
          avatarKey: `${mockUserId}/avatar/avatar.jpg`,
          avatarUrl: `https://${mockBucketName}.s3.${mockRegion}.amazonaws.com/${mockUserId}/avatar/avatar.jpg`,
          size: expect.any(Number)
        }
      );
    });

    it('should handle edge case with minimal valid image', async () => {
      mockS3Send.mockResolvedValue({});

      // Very small valid PNG (1x1 pixel)
      const minimalPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

      const request = {
        user_id: mockUserId,
        image_data: minimalPng,
        content_type: 'image/png'
      };

      const result = await AvatarService.uploadAvatar(request);

      expect(result.is_default).toBe(false);
      expect(result.avatar_url).toContain(`${mockUserId}/avatar/avatar.png`);
    });
  });

  describe('File Extension Mapping', () => {
    it('should map content types to correct extensions', async () => {
      mockS3Send.mockResolvedValue({});

      const testCases = [
        { contentType: 'image/jpeg', expectedExt: 'jpg' },
        { contentType: 'image/jpg', expectedExt: 'jpg' },
        { contentType: 'image/png', expectedExt: 'png' }
      ];

      for (const testCase of testCases) {
        const imageData = testCase.contentType === 'image/png' ? validPngBase64 : validJpegBase64;
        const request = {
          user_id: mockUserId,
          image_data: imageData,
          content_type: testCase.contentType
        };

        const result = await AvatarService.uploadAvatar(request);
        expect(result.avatar_key).toBe(`${mockUserId}/avatar/avatar.${testCase.expectedExt}`);
      }
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle unknown S3 errors', async () => {
      const unknownError = new Error('Something went wrong');
      mockS3Send.mockRejectedValue(unknownError);

      const request = {
        user_id: mockUserId,
        image_data: validJpegBase64,
        content_type: 'image/jpeg'
      };

      await expect(AvatarService.uploadAvatar(request))
        .rejects.toThrow('Failed to upload avatar to S3');

      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'ERROR',
        'Failed to upload avatar to S3',
        {
          userId: mockUserId,
          error: 'Something went wrong'
        }
      );
    });

    it('should handle non-Error objects in catch blocks', async () => {
      const stringError = 'String error';
      mockS3Send.mockRejectedValue(stringError);

      await expect(AvatarService.setDefaultAvatar(mockUserId))
        .rejects.toThrow('Failed to set default avatar');

      expect(utilsMock.logStructured).toHaveBeenCalledWith(
        'ERROR',
        'Failed to set default avatar',
        {
          userId: mockUserId,
          error: 'Unknown error'
        }
      );
    });
  });
});