import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Fix for circular JSON reference in Jest
const originalStringify = JSON.stringify;
JSON.stringify = function(value, replacer, space) {
  try {
    return originalStringify(value, replacer, space);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('circular')) {
      return originalStringify('[Circular Reference Removed]');
    }
    throw error;
  }
};

export interface TestConfig {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  tableName: string;
  region: string;
}

export interface TestUser {
  email: string;
  password: string;
  userId: string;
  accessToken?: string;
  idToken?: string;
  testRecipeId?: string;
  sessionId?: string;
}

export class E2ETestSetup {
  private cognito: CognitoIdentityProviderClient;
  private dynamodb: DynamoDBClient;
  private config: TestConfig;

  constructor(config: TestConfig) {
    this.config = config;
    this.cognito = new CognitoIdentityProviderClient({ region: config.region });
    this.dynamodb = new DynamoDBClient({ region: config.region });
  }

  /**
   * Create a test user in Cognito and DynamoDB
   */
  async createTestUser(email: string, password: string = 'TestPass123!'): Promise<TestUser> {
    const userId = `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Create user in Cognito
      await this.cognito.send(new AdminCreateUserCommand({
        UserPoolId: this.config.userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' }
        ],
        MessageAction: 'SUPPRESS',
        TemporaryPassword: password
      }));

      // Set permanent password
      await this.cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: this.config.userPoolId,
        Username: email,
        Password: password,
        Permanent: true
      }));

      // Create user profile in DynamoDB
      await this.dynamodb.send(new PutItemCommand({
        TableName: this.config.tableName,
        Item: marshall({
          PK: `USER#${userId}`,
          SK: 'PROFILE',
          entity_type: 'USER_PROFILE',
          user_id: userId,
          email: email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          age: 25,
          gender: 'other',
          privacy_settings: {
            profile_visibility: 'public',
            email_visibility: 'private',
            date_of_birth_visibility: 'private',
            cooking_history_visibility: 'friends',
            preferences_visibility: 'friends'
          },
          preferences: {
            dietary_restrictions: [],
            allergies: [],
            favorite_cuisines: ['vietnamese', 'italian'],
            cooking_methods: ['stir_fry', 'boil']
          }
        })
      }));

      return {
        email,
        password,
        userId
      };

    } catch (error) {
      console.error('Failed to create test user:', error);
      throw error;
    }
  }

  /**
   * Authenticate test user and get tokens
   */
  async authenticateUser(user: TestUser): Promise<TestUser> {
    try {
      const response = await fetch(`${this.config.apiUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: user.email,
          password: user.password
        })
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
      }

      const authData = await response.json() as any;
      
      return {
        ...user,
        accessToken: authData.AccessToken,
        idToken: authData.IdToken
      };

    } catch (error) {
      console.error('Failed to authenticate user:', error);
      throw error;
    }
  }

  /**
   * Clean up test user from Cognito and DynamoDB
   */
  async cleanupTestUser(user: TestUser): Promise<void> {
    try {
      // Delete from Cognito
      await this.cognito.send(new AdminDeleteUserCommand({
        UserPoolId: this.config.userPoolId,
        Username: user.email
      }));

      // Delete user profile from DynamoDB
      await this.dynamodb.send(new DeleteItemCommand({
        TableName: this.config.tableName,
        Key: marshall({
          PK: `USER#${user.userId}`,
          SK: 'PROFILE'
        })
      }));

      // Clean up any cooking sessions
      const sessions = await this.dynamodb.send(new QueryCommand({
        TableName: this.config.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: marshall({
          ':pk': `USER#${user.userId}`,
          ':sk': 'COOKING_SESSION#'
        })
      }));

      if (sessions.Items) {
        for (const item of sessions.Items) {
          const session = unmarshall(item);
          await this.dynamodb.send(new DeleteItemCommand({
            TableName: this.config.tableName,
            Key: marshall({
              PK: session.PK,
              SK: session.SK
            })
          }));
        }
      }

    } catch (error) {
      console.error('Failed to cleanup test user:', error);
      // Don't throw - cleanup should be best effort
    }
  }

  /**
   * Seed test ingredients in the database
   */
  async seedTestIngredients(): Promise<void> {
    const testIngredients = [
      { name: 'thịt bò', category: 'protein', aliases: ['beef', 'bo'] },
      { name: 'cà chua', category: 'vegetable', aliases: ['tomato', 'ca chua'] },
      { name: 'hành tây', category: 'vegetable', aliases: ['onion', 'hanh tay'] },
      { name: 'tỏi', category: 'seasoning', aliases: ['garlic', 'toi'] },
      { name: 'gạo', category: 'grain', aliases: ['rice', 'gao'] },
      { name: 'nước mắm', category: 'seasoning', aliases: ['fish sauce', 'nuoc mam'] },
      { name: 'đường', category: 'seasoning', aliases: ['sugar', 'duong'] },
      { name: 'muối', category: 'seasoning', aliases: ['salt', 'muoi'] }
    ];

    for (const ingredient of testIngredients) {
      await this.dynamodb.send(new PutItemCommand({
        TableName: this.config.tableName,
        Item: marshall({
          PK: `INGREDIENT#${ingredient.name}`,
          SK: 'MASTER',
          entity_type: 'MASTER_INGREDIENT',
          name: ingredient.name,
          category: ingredient.category,
          aliases: ingredient.aliases,
          created_at: new Date().toISOString()
        })
      }));
    }
  }

  /**
   * Seed test recipes in the database
   */
  async seedTestRecipes(): Promise<void> {
    const testRecipes = [
      {
        id: 'recipe-pho-bo',
        title: 'Phở Bò',
        description: 'Traditional Vietnamese beef noodle soup',
        cuisine_type: 'vietnamese',
        cooking_method: 'boil',
        meal_type: 'lunch',
        ingredients: ['thịt bò', 'bánh phở', 'hành tây', 'gừng'],
        instructions: ['Boil bones for broth', 'Prepare noodles', 'Slice beef', 'Assemble bowl'],
        is_approved: true,
        average_rating: 4.5,
        rating_count: 10,
        cook_count: 25,
        favorite_count: 8
      },
      {
        id: 'recipe-com-tam',
        title: 'Cơm Tấm',
        description: 'Broken rice with grilled pork',
        cuisine_type: 'vietnamese',
        cooking_method: 'grill',
        meal_type: 'lunch',
        ingredients: ['gạo tấm', 'thịt heo', 'nước mắm', 'đường'],
        instructions: ['Cook rice', 'Marinate pork', 'Grill pork', 'Serve with rice'],
        is_approved: true,
        average_rating: 4.2,
        rating_count: 15,
        cook_count: 30,
        favorite_count: 12
      },
      {
        id: 'recipe-banh-mi',
        title: 'Bánh Mì',
        description: 'Vietnamese sandwich',
        cuisine_type: 'vietnamese',
        cooking_method: 'assemble',
        meal_type: 'breakfast',
        ingredients: ['bánh mì', 'thịt', 'rau', 'nước mắm'],
        instructions: ['Slice bread', 'Prepare fillings', 'Assemble sandwich'],
        is_approved: false, // For testing auto-approval
        average_rating: 3.8,
        rating_count: 5,
        cook_count: 8,
        favorite_count: 3
      }
    ];

    for (const recipe of testRecipes) {
      await this.dynamodb.send(new PutItemCommand({
        TableName: this.config.tableName,
        Item: marshall({
          PK: `RECIPE#${recipe.id}`,
          SK: 'METADATA',
          entity_type: 'RECIPE',
          recipe_id: recipe.id,
          title: recipe.title,
          description: recipe.description,
          cuisine_type: recipe.cuisine_type,
          cooking_method: recipe.cooking_method,
          meal_type: recipe.meal_type,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          is_approved: recipe.is_approved,
          average_rating: recipe.average_rating,
          rating_count: recipe.rating_count,
          cook_count: recipe.cook_count,
          favorite_count: recipe.favorite_count,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // GSI1 for search
          GSI1PK: 'RECIPE',
          GSI1SK: `${recipe.cuisine_type}#${recipe.cooking_method}#${recipe.meal_type}`,
          // GSI2 for popularity
          GSI2PK: 'RECIPE_POPULAR',
          GSI2SK: `${recipe.average_rating.toString().padStart(3, '0')}#${new Date().toISOString()}`
        })
      }));
    }
  }

  /**
   * Clean up test data
   */
  async cleanupTestData(): Promise<void> {
    // This is a simplified cleanup - in a real scenario you'd want more comprehensive cleanup
    const testRecipeIds = ['recipe-pho-bo', 'recipe-com-tam', 'recipe-banh-mi'];
    const testIngredients = ['thịt bò', 'cà chua', 'hành tây', 'tỏi', 'gạo', 'nước mắm', 'đường', 'muối'];

    // Clean up recipes
    for (const recipeId of testRecipeIds) {
      try {
        await this.dynamodb.send(new DeleteItemCommand({
          TableName: this.config.tableName,
          Key: marshall({
            PK: `RECIPE#${recipeId}`,
            SK: 'METADATA'
          })
        }));
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    // Clean up ingredients
    for (const ingredient of testIngredients) {
      try {
        await this.dynamodb.send(new DeleteItemCommand({
          TableName: this.config.tableName,
          Key: marshall({
            PK: `INGREDIENT#${ingredient}`,
            SK: 'MASTER'
          })
        }));
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  }
}

/**
 * Helper function to make authenticated API requests
 */
export async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit,
  accessToken: string
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Helper function to wait for a condition with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs: number = 30000,
  intervalMs: number = 1000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Helper function to generate test data
 */
export function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
}

export function generateTestIngredients(): string[] {
  const ingredients = ['thịt bò', 'cà chua', 'hành tây', 'tỏi', 'gạo'];
  const count = Math.floor(Math.random() * 3) + 3; // 3-5 ingredients
  return ingredients.slice(0, count);
}