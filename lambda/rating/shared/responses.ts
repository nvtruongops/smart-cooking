import { APIResponse } from './types';

export function successResponse(data: any, statusCode: number = 200): APIResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify({
      success: true,
      data
    }),
  };
}

export function errorResponse(
  statusCode: number,
  error: string,
  message: string,
  details: any = {}
): APIResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify({
      success: false,
      error,
      message,
      details,
      timestamp: new Date().toISOString(),
    }),
  };
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public details: any = {}
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleError(error: any): APIResponse {
  console.error('Lambda Error:', {
    error: error.message,
    stack: error.stack,
    details: error.details || {},
  });

  if (error instanceof AppError) {
    return errorResponse(error.statusCode, error.errorCode, error.message, error.details);
  }

  // Handle AWS SDK errors
  if (error.name === 'ValidationException') {
    return errorResponse(400, 'validation_error', error.message);
  }

  if (error.name === 'ResourceNotFoundException') {
    return errorResponse(404, 'resource_not_found', error.message);
  }

  if (error.name === 'ConditionalCheckFailedException') {
    return errorResponse(409, 'conflict', 'Resource already exists or condition failed');
  }

  if (error.name === 'ThrottlingException' || error.name === 'ProvisionedThroughputExceededException') {
    return errorResponse(429, 'rate_limit_exceeded', 'Too many requests, please try again later');
  }

  // Default internal server error
  return errorResponse(500, 'internal_server_error', 'An unexpected error occurred');
}