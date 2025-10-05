import { APIGatewayEvent, APIResponse, ValidationRequest, ValidationResponse, ValidationWarning } from '../shared/types';
import { successResponse, errorResponse } from '../shared/responses';
import { DynamoDBHelper } from '../shared/dynamodb';
import { parseJSON, logStructured } from '../shared/utils';
import { normalizeVietnamese } from './validation-utils';
import { IngredientService } from '../shared/ingredient-service';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { logger } from '../shared/logger';
import { metrics } from '../shared/metrics';
import { tracer, captureAWS } from '../shared/tracer';
import { ErrorHandler } from '../shared/error-handler';
import { executeWithRecovery } from '../shared/error-recovery';
import { 
  BadRequestError, 
  ValidationError,
  ServiceUnavailableError 
} from '../shared/errors';

// Initialize SNS client with X-Ray tracing
const snsClient = captureAWS(new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' }));
const ADMIN_TOPIC_ARN = process.env.ADMIN_TOPIC_ARN;

export const handler = async (event: APIGatewayEvent): Promise<APIResponse> => {
  const startTime = Date.now();
  
  // Initialize logger with request context
  logger.initFromEvent(event);
  logger.logFunctionStart('ingredient-validator', event);

  return await ErrorHandler.executeWithErrorHandling(
    async () => {
      // Validate request body
      const body = ErrorHandler.validateRequest(event.body, ['ingredients']);
      
      // Additional validation for ingredient validator specific fields
      if (!Array.isArray(body.ingredients)) {
        throw new ValidationError('ingredients field must be an array');
      }
      
      if (body.ingredients.length === 0) {
        throw new ValidationError('ingredients array cannot be empty');
      }
      
      if (body.ingredients.length > 20) {
        throw new ValidationError('ingredients array cannot contain more than 20 items');
      }

      const { ingredients } = body;
      logger.info('Processing ingredient validation', {
        ingredientCount: ingredients.length,
        ingredients: ingredients
      });

      // Process ingredients with error recovery
      const validationResults = await executeWithRecovery(
        async () => {
          const results = [];
          for (const ingredient of ingredients) {
            const result = await validateIngredient(ingredient.trim());
            results.push(result);
          }
          return results;
        },
        {
          operation: 'ingredient-validation',
          requestId: event.requestContext.requestId,
          originalRequest: { ingredients },
          metadata: { allowPartialSuccess: true }
        }
      );

      // Aggregate results
      const valid: string[] = [];
      const invalid: string[] = [];
      const warnings: ValidationWarning[] = [];

      validationResults.forEach(result => {
        if (result.isValid) {
          valid.push(result.correctedName || result.originalName);
          if (result.warning) {
            warnings.push(result.warning);
          }
        } else {
          invalid.push(result.originalName);
          if (result.warning) {
            warnings.push(result.warning);
          }
        }
      });

      const response: ValidationResponse = {
        valid,
        invalid,
        warnings
      };

      // Track metrics
      metrics.trackIngredientValidation(ingredients.length, valid.length, invalid.length);
      
      const duration = Date.now() - startTime;
      metrics.trackApiRequest(200, duration, 'ingredient-validator');
      
      logger.info('Validation completed successfully', {
        validCount: valid.length,
        invalidCount: invalid.length,
        warningCount: warnings.length,
        duration
      });
      
      logger.logFunctionEnd('ingredient-validator', 200, duration);
      
      return successResponse(response);
    },
    {
      operation: 'ingredient-validator',
      requestId: event.requestContext.requestId,
      enableRetry: true,
      retryOptions: {
        maxRetries: 2,
        baseDelay: 500,
        shouldRetry: (error: Error) => {
          // Retry on database errors but not validation errors
          return error.name === 'ThrottlingException' ||
                 error.name === 'ProvisionedThroughputExceededException' ||
                 error.message.includes('timeout');
        }
      }
    }
  ).finally(async () => {
    // Flush metrics before function ends
    await metrics.flush();
  });
};

interface ValidationResult {
  originalName: string;
  correctedName?: string;
  isValid: boolean;
  warning?: ValidationWarning;
}

async function validateIngredient(ingredient: string): Promise<ValidationResult> {
  const originalName = ingredient;
  const normalizedInput = normalizeVietnamese(ingredient);

  logStructured('INFO', 'Validating individual ingredient', {
    original: originalName,
    normalized: normalizedInput
  });

  try {
    // Use the enhanced IngredientService for better search capabilities
    const searchResults = await IngredientService.searchIngredients(originalName, {
      limit: 5,
      fuzzyThreshold: 0.6
    });

    if (searchResults.length > 0) {
      const bestMatch = searchResults[0];

      // Exact or high confidence match (>= 0.8)
      if (bestMatch.match_score >= 0.8) {
        logStructured('INFO', 'High confidence match found', {
          original: originalName,
          matched: bestMatch.name,
          confidence: bestMatch.match_score,
          matchType: bestMatch.match_type
        });

        return {
          originalName,
          correctedName: bestMatch.name,
          isValid: true,
          warning: originalName !== bestMatch.name ? {
            original: originalName,
            corrected: bestMatch.name,
            confidence: bestMatch.match_score,
            message: bestMatch.match_type === 'exact' 
              ? 'Ingredient name corrected to standard form'
              : 'Ingredient name auto-corrected based on similarity'
          } : undefined
        };
      }
      
      // Medium confidence match (0.6-0.8) - provide suggestions
      else if (bestMatch.match_score >= 0.6) {
        logStructured('INFO', 'Medium confidence matches found', {
          original: originalName,
          suggestionCount: searchResults.length,
          bestScore: bestMatch.match_score
        });

        return {
          originalName,
          isValid: false,
          warning: {
            ingredient: originalName,
            suggestions: searchResults.slice(0, 3).map(r => r.name),
            message: 'Ingredient not found. Did you mean one of these?'
          }
        };
      }
    }

    // No good matches found - log for admin review
    logStructured('WARN', 'No matches found for ingredient', {
      original: originalName,
      normalized: normalizedInput
    });
    
    await logInvalidIngredient(originalName, normalizedInput);

    return {
      originalName,
      isValid: false,
      warning: {
        ingredient: originalName,
        message: 'Ingredient not found in database',
        reported: true
      }
    };

  } catch (error) {
    logStructured('ERROR', 'Error validating ingredient', {
      ingredient: originalName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return {
      originalName,
      isValid: false,
      warning: {
        ingredient: originalName,
        message: 'Error occurred during validation'
      }
    };
  }
}



async function logInvalidIngredient(originalName: string, normalizedName: string): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const reportId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Check if this ingredient has been reported before
    const existingReports = await DynamoDBHelper.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': 'INVALID_INGREDIENT',
        ':sk': `REPORT#${normalizedName}#`
      }
    });

    const reportCount = existingReports.Count || 0;
    const newReportCount = reportCount + 1;
    const needsAdminReview = newReportCount >= 5;

    // Log the invalid ingredient report
    await DynamoDBHelper.put({
      PK: 'INVALID_INGREDIENT',
      SK: `REPORT#${normalizedName}#${timestamp}`,
      entity_type: 'INVALID_INGREDIENT_REPORT',
      report_id: reportId,
      original_name: originalName,
      normalized_name: normalizedName,
      report_count: newReportCount,
      reported_at: timestamp,
      needs_admin_review: needsAdminReview,
      GSI1PK: needsAdminReview ? 'ADMIN_REVIEW_NEEDED' : 'REPORTED_INGREDIENT',
      GSI1SK: `COUNT#${newReportCount.toString().padStart(5, '0')}#${timestamp}`
    });

    // Update summary record
    await DynamoDBHelper.put({
      PK: 'INVALID_INGREDIENT',
      SK: `SUMMARY#${normalizedName}`,
      entity_type: 'INVALID_INGREDIENT_SUMMARY',
      original_name: originalName,
      normalized_name: normalizedName,
      total_reports: newReportCount,
      first_reported: existingReports.Items && existingReports.Items.length > 0 
        ? existingReports.Items[existingReports.Items.length - 1].reported_at 
        : timestamp,
      last_reported: timestamp,
      needs_admin_review: needsAdminReview,
      GSI1PK: needsAdminReview ? 'ADMIN_REVIEW_NEEDED' : 'REPORTED_INGREDIENT',
      GSI1SK: `COUNT#${newReportCount.toString().padStart(5, '0')}#${timestamp}`
    });

    logStructured('INFO', 'Invalid ingredient logged', {
      ingredient: originalName,
      normalized: normalizedName,
      reportCount: newReportCount,
      needsAdminReview
    });
    
    // Send admin notification if threshold reached
    if (needsAdminReview) {
      await sendAdminNotification(originalName, normalizedName, newReportCount);
    }

  } catch (error) {
    logStructured('ERROR', 'Error logging invalid ingredient', {
      ingredient: originalName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Don't throw - this is a non-critical operation
  }
}

async function sendAdminNotification(originalName: string, normalizedName: string, reportCount: number): Promise<void> {
  if (!ADMIN_TOPIC_ARN) {
    logStructured('WARN', 'Admin topic ARN not configured, skipping notification', {
      ingredient: originalName
    });
    return;
  }

  try {
    const message = {
      alert_type: 'invalid_ingredient_review_needed',
      ingredient: {
        original_name: originalName,
        normalized_name: normalizedName,
        report_count: reportCount
      },
      timestamp: new Date().toISOString(),
      action_required: 'Review ingredient for potential addition to master database',
      dashboard_link: `https://console.aws.amazon.com/dynamodb/home?region=${process.env.AWS_REGION}#tables:selected=smart-cooking-data;tab=items;filter=INVALID_INGREDIENT`
    };

    const publishCommand = new PublishCommand({
      TopicArn: ADMIN_TOPIC_ARN,
      Subject: `🚨 Smart Cooking: Invalid Ingredient Needs Review - "${originalName}"`,
      Message: JSON.stringify(message, null, 2),
      MessageAttributes: {
        alert_type: {
          DataType: 'String',
          StringValue: 'invalid_ingredient_review'
        },
        ingredient_name: {
          DataType: 'String',
          StringValue: originalName
        },
        report_count: {
          DataType: 'Number',
          StringValue: reportCount.toString()
        }
      }
    });

    await snsClient.send(publishCommand);

    logStructured('INFO', 'Admin notification sent successfully', {
      ingredient: originalName,
      reportCount,
      topicArn: ADMIN_TOPIC_ARN
    });

  } catch (error) {
    logStructured('ERROR', 'Failed to send admin notification', {
      ingredient: originalName,
      error: error instanceof Error ? error.message : 'Unknown error',
      topicArn: ADMIN_TOPIC_ARN
    });
    // Don't throw - notification failure shouldn't break the main flow
  }
}