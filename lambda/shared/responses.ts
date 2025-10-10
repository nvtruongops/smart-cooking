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
  console.log('HANDLEERROR DEBUG: Function called with error:', error?.message);
  console.error('Lambda Error:', {
    error: error.message,
    stack: error.stack,
    details: error.details || {},
  });

  // Always return a valid APIResponse - no matter what
  try {
    // Check for AppError properties first (statusCode and errorCode)
    if (error.statusCode && error.errorCode) {
      return {
        statusCode: error.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
        body: JSON.stringify({
          success: false,
          error: error.errorCode,
          message: error.message,
          details: error.details || {},
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // Check if it's an AppError instance
    if (error instanceof AppError) {
      return {
        statusCode: error.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
        body: JSON.stringify({
          success: false,
          error: error.errorCode,
          message: error.message,
          details: error.details,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // Handle AWS SDK errors
    if (error.name === 'ValidationException') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
        body: JSON.stringify({
          success: false,
          error: 'validation_error',
          message: error.message,
          details: {},
          timestamp: new Date().toISOString(),
        }),
      };
    }

    if (error.name === 'ResourceNotFoundException') {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
        body: JSON.stringify({
          success: false,
          error: 'resource_not_found',
          message: error.message,
          details: {},
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // Handle DatabaseError from DynamoDB helper
    if (error.name === 'DatabaseError') {
      return {
        statusCode: error.statusCode || 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
        body: JSON.stringify({
          success: false,
          error: error.code || 'database_error',
          message: error.message,
          details: error.details || {},
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // Default internal server error
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      },
      body: JSON.stringify({
        success: false,
        error: 'internal_server_error',
        message: 'An unexpected error occurred',
        details: {},
        timestamp: new Date().toISOString(),
      }),
    };

  } catch (handlerError) {
    // If even the error handler fails, return a basic response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: 'critical_error',
        message: 'Critical error in error handler',
        timestamp: new Date().toISOString(),
      }),
    };
  }
}