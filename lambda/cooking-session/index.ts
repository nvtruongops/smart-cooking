/**
 * Cooking Session Management Lambda Function
 * Handles cooking session lifecycle, history tracking, and favorites
 */

import { APIGatewayEvent, APIResponse } from '../shared/types';
import { successResponse, errorResponse, handleError, AppError } from '../shared/responses';
import { getUserIdFromEvent, logStructured } from '../shared/utils';
import { CookingSessionService } from './cooking-session-service';
import { logger } from '../shared/logger';
import { metrics } from '../shared/metrics';
import { tracer } from '../shared/tracer';
import {
    StartCookingRequest,
    CompleteCookingRequest,
    UpdateCookingStatusRequest,
    GetCookingHistoryRequest,
    ToggleFavoriteRequest,
    GetFavoritesRequest
} from './types';

export async function handler(event: APIGatewayEvent): Promise<APIResponse> {
    const startTime = Date.now();
    
    // Initialize logger with request context
    logger.initFromEvent(event);
    logger.logFunctionStart('cooking-session', event);

    try {
        const userId = getUserIdFromEvent(event);
        const method = event.httpMethod;
        const path = event.path;

        // Set X-Ray user context
        tracer.setUser(userId);

        logger.info('Cooking session request received', {
            method,
            path,
            userId,
            pathParameters: event.pathParameters
        });

        // Route requests based on HTTP method and path
        if (method === 'POST' && path.includes('/cooking/start')) {
            return await startCooking(userId, event.body);
        }

        if (method === 'PUT' && path.includes('/cooking/complete')) {
            return await completeCooking(userId, event.body);
        }

        if (method === 'PUT' && path.includes('/cooking/status')) {
            return await updateCookingStatus(userId, event.body);
        }

        if (method === 'GET' && path.includes('/cooking/history')) {
            return await getCookingHistory(userId, event.queryStringParameters);
        }

        if (method === 'GET' && path.includes('/cooking/stats')) {
            return await getCookingStats(userId);
        }

        if (method === 'POST' && path.includes('/favorites/toggle')) {
            return await toggleFavorite(userId, event.body);
        }

        if (method === 'GET' && path.includes('/favorites')) {
            return await getFavorites(userId, event.queryStringParameters);
        }

        return errorResponse(404, 'not_found', 'Endpoint not found');

    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Cooking session handler error', error, { duration });
        metrics.trackApiRequest(500, duration, 'cooking-session');
        logger.logFunctionEnd('cooking-session', 500, duration);
        return handleError(error);
    } finally {
        // Flush metrics and log function end
        const duration = Date.now() - startTime;
        logger.logFunctionEnd('cooking-session', 200, duration);
        await metrics.flush();
    }
}

/**
 * Start a new cooking session
 */
async function startCooking(userId: string, body: string | null): Promise<APIResponse> {
    if (!body) {
        throw new AppError(400, 'missing_body', 'Request body is required');
    }

    const request: StartCookingRequest = JSON.parse(body);

    if (!request.recipe_id) {
        throw new AppError(400, 'missing_recipe_id', 'Recipe ID is required');
    }

    const session = await CookingSessionService.startCooking(userId, request);
    return successResponse(session, 201);
}

/**
 * Complete a cooking session with optional rating
 */
async function completeCooking(userId: string, body: string | null): Promise<APIResponse> {
    if (!body) {
        throw new AppError(400, 'missing_body', 'Request body is required');
    }

    const request: CompleteCookingRequest = JSON.parse(body);

    if (!request.session_id) {
        throw new AppError(400, 'missing_session_id', 'Session ID is required');
    }

    const session = await CookingSessionService.completeCooking(userId, request);
    return successResponse(session);
}

/**
 * Update cooking session status (cooking/completed/abandoned)
 */
async function updateCookingStatus(userId: string, body: string | null): Promise<APIResponse> {
    if (!body) {
        throw new AppError(400, 'missing_body', 'Request body is required');
    }

    const request: UpdateCookingStatusRequest = JSON.parse(body);

    if (!request.session_id || !request.status) {
        throw new AppError(400, 'missing_fields', 'Session ID and status are required');
    }

    const session = await CookingSessionService.updateCookingStatus(userId, request);
    return successResponse(session);
}

/**
 * Get cooking history with filtering and sorting
 */
async function getCookingHistory(userId: string, queryParams: any): Promise<APIResponse> {
    const request: GetCookingHistoryRequest = {
        user_id: userId,
        limit: queryParams?.limit ? parseInt(queryParams.limit) : undefined,
        start_key: queryParams?.start_key,
        status_filter: queryParams?.status_filter,
        recipe_id_filter: queryParams?.recipe_id_filter,
        sort_order: queryParams?.sort_order
    };

    const response = await CookingSessionService.getCookingHistory(userId, request);
    return successResponse(response);
}

/**
 * Get cooking statistics for user
 */
async function getCookingStats(userId: string): Promise<APIResponse> {
    const stats = await CookingSessionService.getCookingStats(userId);
    return successResponse(stats);
}

/**
 * Toggle favorite status for a recipe
 */
async function toggleFavorite(userId: string, body: string | null): Promise<APIResponse> {
    if (!body) {
        throw new AppError(400, 'missing_body', 'Request body is required');
    }

    const request: ToggleFavoriteRequest = JSON.parse(body);

    if (!request.recipe_id) {
        throw new AppError(400, 'missing_recipe_id', 'Recipe ID is required');
    }

    const result = await CookingSessionService.toggleFavorite(userId, request);
    return successResponse(result);
}

/**
 * Get user's favorite recipes
 */
async function getFavorites(userId: string, queryParams: any): Promise<APIResponse> {
    const request: GetFavoritesRequest = {
        user_id: userId,
        limit: queryParams?.limit ? parseInt(queryParams.limit) : undefined,
        start_key: queryParams?.start_key
    };

    const response = await CookingSessionService.getFavorites(userId, request);
    return successResponse(response);
}