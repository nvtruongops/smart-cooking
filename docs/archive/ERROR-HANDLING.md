# Error Handling and Recovery System

## Overview

The Smart Cooking application implements a comprehensive error handling and recovery system that provides:

- **Centralized error handling** with proper HTTP status codes
- **Graceful degradation** for AI service failures and timeouts
- **Retry logic** with exponential backoff for transient failures
- **User-friendly error messages** and recovery suggestions
- **Circuit breaker pattern** to prevent cascading failures
- **Partial success handling** for batch operations

## Architecture

### Error Classes Hierarchy

```
Error (base)
└── AppError (custom base)
    ├── Client Errors (4xx)
    │   ├── BadRequestError (400)
    │   ├── UnauthorizedError (401)
    │   ├── ForbiddenError (403)
    │   ├── NotFoundError (404)
    │   ├── ValidationError (422)
    │   ├── ConflictError (409)
    │   └── RateLimitError (429)
    └── Server Errors (5xx)
        ├── InternalError (500)
        ├── ServiceUnavailableError (503)
        ├── AIServiceError (503)
        ├── DatabaseError (503)
        └── TimeoutError (504)
```

### Core Components

1. **Error Classes** (`lambda/shared/errors.ts`)
   - Standardized error types with HTTP status codes
   - Error metadata (code, details, recovery suggestions)
   - JSON serialization for API responses

2. **Error Handler Middleware** (`lambda/shared/error-handler.ts`)
   - Lambda handler wrapper for automatic error handling
   - User-friendly message generation
   - Request/response logging

3. **Graceful Degradation** (`lambda/shared/graceful-degradation.ts`)
   - AI service wrapper with circuit breaker
   - Fallback mechanisms for service failures
   - Partial success for batch operations

4. **Retry Logic** (`lambda/shared/utils.ts`)
   - Exponential backoff with jitter
   - Configurable retry conditions
   - Transient error detection

## Usage Examples

### 1. Basic Error Handling

```typescript
import { withErrorHandler, successResponse, extractUserId } from '../shared/error-handler';
import { BadRequestError } from '../shared/errors';

async function myHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = extractUserId(event); // Throws UnauthorizedError if missing

  if (!event.body) {
    throw new BadRequestError('Request body is required');
  }

  return successResponse({ message: 'Success' });
}

export const handler = withErrorHandler(myHandler);
```

### 2. AI Service with Graceful Degradation

```typescript
import { AIServiceWrapper } from '../shared/graceful-degradation';

const aiRecipes = await AIServiceWrapper.execute(
  // Primary: AI generation
  async () => {
    const response = await bedrockClient.send(command);
    return parseAIResponse(response);
  },
  // Fallback: Database recipes only
  async () => {
    return await DynamoDBHelper.query({ /* ... */ });
  },
  30000 // 30 second timeout
);
```

### 3. Retry with Exponential Backoff

```typescript
import { retryWithExponentialBackoff } from '../shared/utils';
import { isTransientError } from '../shared/errors';

const data = await retryWithExponentialBackoff(
  () => DynamoDBHelper.get(pk, sk),
  {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    shouldRetry: isTransientError,
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt}: ${error.message}`);
    }
  }
);
```

### 4. Batch Operations with Partial Success

```typescript
import { executeBatchWithPartialSuccess } from '../shared/graceful-degradation';

const result = await executeBatchWithPartialSuccess(
  ingredients,
  async (ingredient) => validateIngredient(ingredient)
);

// Handle results
console.log(`Successful: ${result.successful.length}`);
console.log(`Failed: ${result.failed.length}`);
console.log(`Partial success: ${result.partialSuccess}`);
```

### 5. Custom Error with Recovery Suggestion

```typescript
import { AppError, ErrorCode } from '../shared/errors';

throw new AppError({
  code: ErrorCode.AI_SERVICE_ERROR,
  message: 'AI model is overloaded',
  statusCode: 503,
  details: { modelId: 'claude-3-haiku' },
  recoverable: true,
  recoverySuggestion: 'Try again in a few minutes or use simpler ingredients'
});
```

## Error Response Format

All errors return a consistent JSON format:

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid input parameters",
    "details": {
      "field": "ingredients",
      "reason": "must be an array"
    },
    "recoverable": true,
    "recoverySuggestion": "Please check your request and try again.",
    "timestamp": "2025-10-04T10:30:00.000Z"
  }
}
```

## Circuit Breaker Pattern

The AI service wrapper implements a circuit breaker to prevent cascading failures:

- **Closed (Normal)**: Requests flow to AI service
- **Open (Failure)**: After 3 failures in 1 minute, use fallback immediately
- **Half-Open (Recovery)**: After cooldown period, try AI service again

```typescript
// Circuit breaker automatically manages state
const result = await AIServiceWrapper.execute(aiFn, fallbackFn);
```

## Transient Error Detection

The system automatically detects and retries transient errors:

**AWS SDK Errors:**
- ThrottlingException
- ProvisionedThroughputExceededException
- ServiceUnavailable
- TimeoutError
- NetworkingError

**Application Errors:**
- AIServiceError (if marked recoverable)
- ServiceUnavailableError
- DatabaseError
- TimeoutError

## User-Friendly Messages

The `ErrorMessageBuilder` maps technical errors to user-friendly messages:

| Technical Error | User Message |
|----------------|--------------|
| ThrottlingException | "Too many requests. Please wait a moment and try again." |
| ModelTimeoutException | "AI processing took too long. Please try again." |
| ValidationException | "Invalid request. Please check your input and try again." |
| UserNotFoundException | "User not found. Please check your credentials." |

## Health Checks

Monitor service health with built-in health check utilities:

```typescript
import { checkServiceHealth } from '../shared/graceful-degradation';

const health = await checkServiceHealth(
  'AI Service',
  async () => {
    await bedrockClient.send(testCommand);
  },
  5000 // timeout
);

console.log(health.healthy); // true/false
console.log(health.responseTimeMs); // 234
```

## Rate Limiting

Simple in-memory rate limiting (for Lambda):

```typescript
import { checkRateLimit } from '../shared/error-handler';

// 100 requests per minute per user
checkRateLimit(
  userId,
  100,  // max requests
  60000 // window in ms
); // Throws RateLimitError if exceeded
```

## Best Practices

### 1. Always Use Error Handler Wrapper

```typescript
// ✅ Good
export const handler = withErrorHandler(async (event) => {
  // Your logic
});

// ❌ Bad
export const handler = async (event) => {
  try {
    // Your logic
  } catch (error) {
    // Manual error handling
  }
};
```

### 2. Use Appropriate Error Types

```typescript
// ✅ Good - Specific error type
throw new ValidationError('Invalid email format', { field: 'email' });

// ❌ Bad - Generic error
throw new Error('Email is invalid');
```

### 3. Add Recovery Suggestions

```typescript
// ✅ Good
throw new AIServiceError(
  'AI model unavailable',
  { modelId },
  true, // recoverable
);

// ❌ Bad - No recovery info
throw new Error('AI failed');
```

### 4. Implement Graceful Degradation

```typescript
// ✅ Good - Fallback available
const recipes = await withGracefulDegradation(
  () => getAIRecipes(),
  {
    serviceName: 'AI',
    enableFallback: true,
    fallbackFn: () => getDBRecipes()
  }
);

// ❌ Bad - No fallback
const recipes = await getAIRecipes(); // Throws if AI fails
```

### 5. Retry Transient Errors Only

```typescript
// ✅ Good
await retryWithExponentialBackoff(
  () => dynamodb.get(),
  { shouldRetry: isTransientError }
);

// ❌ Bad - Retrying validation errors
await retryWithExponentialBackoff(
  () => validateInput(),
  { maxRetries: 3 } // Don't retry validation errors!
);
```

## Testing

The error handling system includes comprehensive tests:

```bash
npm test -- error-handling.test.ts
```

Key test coverage:
- Error class creation and serialization
- Response formatting
- Transient error detection
- Retry logic with backoff
- Circuit breaker behavior
- Graceful degradation scenarios
- Batch partial success handling
- User message generation

## Monitoring and Logging

All errors are logged in structured JSON format:

```json
{
  "timestamp": "2025-10-04T10:30:00.000Z",
  "level": "ERROR",
  "error": {
    "name": "AIServiceError",
    "message": "AI model timeout",
    "code": "AI_SERVICE_ERROR",
    "statusCode": 503,
    "stack": "...",
    "details": { "modelId": "claude-3-haiku" }
  }
}
```

Use CloudWatch Insights queries to analyze errors:

```sql
fields @timestamp, error.code, error.message, error.statusCode
| filter level = "ERROR"
| stats count() by error.code
```

## Performance Considerations

1. **Circuit Breaker**: Prevents wasting resources on failing services
2. **Exponential Backoff**: Reduces load during service degradation
3. **Jitter**: Prevents thundering herd on retry
4. **Timeouts**: Fail fast instead of hanging
5. **Partial Success**: Process what we can, report what failed

## Future Enhancements

- [ ] Distributed circuit breaker using DynamoDB
- [ ] Rate limiting with Redis/DynamoDB
- [ ] Error aggregation and alerting
- [ ] Retry budget to prevent excessive retries
- [ ] Dead letter queue for failed operations
- [ ] Custom error pages for frontend

## Related Documentation

- [Monitoring System](./MONITORING.md)
- [API Specification](../plan/5-api-spec.md)
- [Security Guidelines](../plan/6-security.md)
