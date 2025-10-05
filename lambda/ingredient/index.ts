/**
 * Ingredient Validation Lambda Handler
 * Stateless endpoint - NO DATABASE WRITES
 */

import { APIGatewayEvent, APIResponse } from '../shared/types';
import { successResponse, errorResponse, handleError, AppError } from '../shared/responses';
import { logStructured } from '../shared/utils';
import { IngredientValidationService } from './validation-service';
import { ValidationRequest } from './types';

export async function handler(event: APIGatewayEvent): Promise<APIResponse> {
  try {
    logStructured('INFO', 'Ingredient validation request received', {
      method: event.httpMethod,
      path: event.path
    });

    const method = event.httpMethod;
    const path = event.path;

    // POST /ingredients/validate - Validate ingredients
    if (method === 'POST' && path.endsWith('/ingredients/validate')) {
      return await validateIngredients(event.body);
    }

    return errorResponse(404, 'not_found', 'Endpoint not found');

  } catch (error) {
    return handleError(error);
  }
}

/**
 * Validate ingredients (stateless - no DB writes)
 */
async function validateIngredients(body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const request: ValidationRequest = JSON.parse(body);

  // Validate request
  if (!request.ingredients || !Array.isArray(request.ingredients)) {
    throw new AppError(400, 'invalid_request', 'ingredients must be an array');
  }

  if (request.ingredients.length === 0) {
    throw new AppError(400, 'invalid_request', 'At least one ingredient is required');
  }

  if (request.ingredients.length > 20) {
    throw new AppError(400, 'invalid_request', 'Maximum 20 ingredients allowed per request');
  }

  // Validate each ingredient is a non-empty string
  for (const ingredient of request.ingredients) {
    if (typeof ingredient !== 'string') {
      throw new AppError(400, 'invalid_request', 'All ingredients must be strings');
    }
  }

  const result = await IngredientValidationService.validateIngredients(request);

  return successResponse(result);
}
