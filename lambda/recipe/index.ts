/**
 * Recipe Management Lambda Function
 * Handles recipe CRUD operations and image uploads
 */

import { APIGatewayEvent, APIResponse } from '../shared/types';
import { successResponse, errorResponse, handleError, AppError } from '../shared/responses';
import { getUserIdFromEvent, logStructured } from '../shared/utils';
import { RecipeService } from './recipe-service';
import {
  CreateRecipeRequest,
  UpdateRecipeRequest,
  ListRecipesRequest,
  SearchRecipesRequest
} from './types';

export async function handler(event: APIGatewayEvent): Promise<APIResponse> {
  try {
    logStructured('INFO', 'Recipe request received', {
      method: event.httpMethod,
      path: event.path,
      pathParameters: event.pathParameters
    });

    const userId = getUserIdFromEvent(event);
    const method = event.httpMethod;
    const path = event.path;

    // Route requests based on HTTP method and path

    // POST /recipes - Create new recipe
    if (method === 'POST' && path.endsWith('/recipes')) {
      return await createRecipe(userId, event.body);
    }

    // GET /recipes/{id} - Get recipe by ID
    if (method === 'GET' && path.includes('/recipes/') && event.pathParameters?.id) {
      return await getRecipe(userId, event.pathParameters.id);
    }

    // PUT /recipes/{id} - Update recipe
    if (method === 'PUT' && path.includes('/recipes/') && event.pathParameters?.id) {
      return await updateRecipe(userId, event.pathParameters.id, event.body);
    }

    // DELETE /recipes/{id} - Delete recipe
    if (method === 'DELETE' && path.includes('/recipes/') && event.pathParameters?.id) {
      return await deleteRecipe(userId, event.pathParameters.id);
    }

    // GET /recipes - List recipes
    if (method === 'GET' && path.endsWith('/recipes')) {
      return await listRecipes(userId, event.queryStringParameters);
    }

    // GET /recipes/search - Search recipes with filters
    if (method === 'GET' && path.includes('/recipes/search')) {
      return await searchRecipes(event.queryStringParameters);
    }

    return errorResponse(404, 'not_found', 'Endpoint not found');

  } catch (error) {
    return handleError(error);
  }
}

/**
 * Create a new recipe
 */
async function createRecipe(userId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  const request: CreateRecipeRequest = JSON.parse(body);

  // Validate required fields
  if (!request.title || !request.cooking_method) {
    throw new AppError(400, 'missing_fields', 'Title and cooking method are required');
  }

  if (!request.ingredients || request.ingredients.length === 0) {
    throw new AppError(400, 'missing_ingredients', 'At least one ingredient is required');
  }

  if (!request.instructions || request.instructions.length === 0) {
    throw new AppError(400, 'missing_instructions', 'At least one instruction is required');
  }

  const result = await RecipeService.createRecipe(userId, request);

  return successResponse({
    recipe_id: result.recipe_id,
    message: 'Recipe created successfully'
  }, 201);
}

/**
 * Get recipe by ID
 */
async function getRecipe(userId: string, recipeId: string): Promise<APIResponse> {
  if (!recipeId) {
    throw new AppError(400, 'missing_recipe_id', 'Recipe ID is required');
  }

  const recipe = await RecipeService.getRecipeById(recipeId, userId);

  return successResponse({ recipe });
}

/**
 * Update recipe
 */
async function updateRecipe(userId: string, recipeId: string, body: string | null): Promise<APIResponse> {
  if (!body) {
    throw new AppError(400, 'missing_body', 'Request body is required');
  }

  if (!recipeId) {
    throw new AppError(400, 'missing_recipe_id', 'Recipe ID is required');
  }

  const updates: UpdateRecipeRequest = JSON.parse(body);
  updates.recipe_id = recipeId;

  const recipe = await RecipeService.updateRecipe(userId, updates);

  return successResponse({
    recipe,
    message: 'Recipe updated successfully'
  });
}

/**
 * Delete recipe
 */
async function deleteRecipe(userId: string, recipeId: string): Promise<APIResponse> {
  if (!recipeId) {
    throw new AppError(400, 'missing_recipe_id', 'Recipe ID is required');
  }

  await RecipeService.deleteRecipe(userId, recipeId);

  return successResponse({
    message: 'Recipe deleted successfully'
  });
}

/**
 * List recipes with filters
 */
async function listRecipes(userId: string, queryParams: any): Promise<APIResponse> {
  const request: ListRecipesRequest = {
    limit: queryParams?.limit ? parseInt(queryParams.limit) : undefined,
    start_key: queryParams?.start_key,
    filter_by_user: queryParams?.filter_by_user === 'true',
    filter_by_approved: queryParams?.filter_by_approved !== 'false', // Default true
    cooking_method: queryParams?.cooking_method
  };

  const response = await RecipeService.listRecipes(userId, request);

  return successResponse(response);
}

/**
 * Search recipes with advanced filters
 */
async function searchRecipes(queryParams: any): Promise<APIResponse> {
  const request: SearchRecipesRequest = {
    q: queryParams?.q,
    cuisine_type: queryParams?.cuisine_type,
    cooking_method: queryParams?.cooking_method,
    meal_type: queryParams?.meal_type,
    min_rating: queryParams?.min_rating ? parseFloat(queryParams.min_rating) : undefined,
    max_prep_time: queryParams?.max_prep_time ? parseInt(queryParams.max_prep_time) : undefined,
    max_cook_time: queryParams?.max_cook_time ? parseInt(queryParams.max_cook_time) : undefined,
    difficulty_level: queryParams?.difficulty_level,
    sort_by: queryParams?.sort_by || 'created_at',
    sort_order: queryParams?.sort_order || 'desc',
    limit: queryParams?.limit ? parseInt(queryParams.limit) : 20,
    offset: queryParams?.offset ? parseInt(queryParams.offset) : 0
  };

  const response = await RecipeService.searchRecipes(request);

  return successResponse(response);
}
