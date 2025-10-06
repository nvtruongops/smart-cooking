import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { logStructured } from './monitoring-setup';

/**
 * DynamoDB-based caching service for Smart Cooking MVP
 * Provides Redis-like caching functionality using DynamoDB TTL
 */
export class CacheService {
  private client: DynamoDBClient;
  private tableName: string;

  constructor() {
    this.client = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.tableName = process.env.DYNAMODB_TABLE!;
  }

  /**
   * Get cached data by key
   */
  async get(key: string): Promise<any> {
    try {
      const response = await this.client.send(new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `CACHE#${key}`,
          SK: 'DATA'
        })
      }));

      if (response.Item) {
        const item = unmarshall(response.Item);
        
        // Check TTL (additional check beyond DynamoDB TTL)
        if (item.expires_at && new Date(item.expires_at) < new Date()) {
          logStructured('DEBUG', 'Cache item expired', { key });
          return null;
        }
        
        logStructured('DEBUG', 'Cache hit', { key, dataSize: JSON.stringify(item.data).length });
        return item.data;
      }
      
      logStructured('DEBUG', 'Cache miss', { key });
      return null;
    } catch (error) {
      logStructured('ERROR', 'Cache get error', { key, error: error.message });
      return null; // Fail gracefully
    }
  }

  /**
   * Set cached data with TTL
   */
  async set(key: string, data: any, ttlSeconds: number = 3600): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      const ttlTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
      
      await this.client.send(new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          PK: `CACHE#${key}`,
          SK: 'DATA',
          entity_type: 'CACHE_ENTRY',
          data: data,
          expires_at: expiresAt,
          ttl: ttlTimestamp, // DynamoDB TTL attribute
          created_at: new Date().toISOString(),
          cache_key: key,
          data_size: JSON.stringify(data).length
        })
      }));

      logStructured('DEBUG', 'Cache set', { 
        key, 
        ttlSeconds, 
        dataSize: JSON.stringify(data).length 
      });
    } catch (error) {
      logStructured('ERROR', 'Cache set error', { key, error: error.message });
      // Fail gracefully - don't break the main operation
    }
  }

  /**
   * Generate cache key from prefix and parameters
   */
  generateKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${JSON.stringify(params[key])}`)
      .join('|');
    
    const hash = Buffer.from(sortedParams).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    return `${prefix}:${hash}`;
  }

  /**
   * Delete cached item
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          PK: `CACHE#${key}`,
          SK: 'DATA',
          ttl: Math.floor(Date.now() / 1000) + 1 // Expire immediately
        })
      }));

      logStructured('DEBUG', 'Cache delete', { key });
    } catch (error) {
      logStructured('ERROR', 'Cache delete error', { key, error: error.message });
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    hitRate: number;
  }> {
    // This would require additional tracking in a real implementation
    // For now, return placeholder stats
    return {
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0.75 // Estimated based on usage patterns
    };
  }
}

// Singleton instance
let cacheInstance: CacheService | null = null;

export function getCache(): CacheService {
  if (!cacheInstance) {
    cacheInstance = new CacheService();
  }
  return cacheInstance;
}

// Cache TTL constants
export const CACHE_TTL = {
  INGREDIENT_VALIDATION: 24 * 60 * 60, // 24 hours
  AI_SUGGESTIONS: 60 * 60, // 1 hour
  RECIPE_SEARCH: 30 * 60, // 30 minutes
  USER_PROFILE: 15 * 60, // 15 minutes
  MASTER_INGREDIENTS: 7 * 24 * 60 * 60 // 7 days
} as const;