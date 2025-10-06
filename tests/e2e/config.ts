import { TestConfig } from './setup';

// Environment-specific configurations
export const getTestConfig = (environment: string = 'dev'): TestConfig => {
  const configs: Record<string, TestConfig> = {
    dev: {
      apiUrl: process.env.DEV_API_URL || 'https://api-dev.smartcooking.com/v1',
      userPoolId: process.env.DEV_USER_POOL_ID || 'us-east-1_devpool123',
      userPoolClientId: process.env.DEV_USER_POOL_CLIENT_ID || 'devclient123',
      tableName: process.env.DEV_TABLE_NAME || 'smart-cooking-data-dev',
      region: process.env.AWS_REGION || 'us-east-1'
    },
    prod: {
      apiUrl: process.env.PROD_API_URL || 'https://api.smartcooking.com/v1',
      userPoolId: process.env.PROD_USER_POOL_ID || 'us-east-1_prodpool123',
      userPoolClientId: process.env.PROD_USER_POOL_CLIENT_ID || 'prodclient123',
      tableName: process.env.PROD_TABLE_NAME || 'smart-cooking-data-prod',
      region: process.env.AWS_REGION || 'us-east-1'
    }
  };

  const config = configs[environment];
  if (!config) {
    throw new Error(`Unknown environment: ${environment}`);
  }

  return config;
};

// Test data constants
export const TEST_INGREDIENTS = {
  VALID: ['thịt bò', 'cà chua', 'hành tây', 'tỏi', 'gạo'],
  INVALID: ['invalid-ingredient', 'fake-food', 'nonexistent'],
  FUZZY_MATCH: ['thit bo', 'ca chua', 'hanh tay'], // Missing tone marks
  MIXED: ['thịt bò', 'invalid-ingredient', 'cà chua', 'fake-food', 'tỏi']
};

export const TEST_RECIPES = {
  HIGH_RATED: {
    id: 'recipe-pho-bo',
    expectedRating: 4.5,
    ingredients: ['thịt bò', 'bánh phở', 'hành tây']
  },
  MEDIUM_RATED: {
    id: 'recipe-com-tam',
    expectedRating: 4.2,
    ingredients: ['gạo tấm', 'thịt heo']
  },
  PENDING_APPROVAL: {
    id: 'recipe-banh-mi',
    expectedRating: 3.8,
    ingredients: ['bánh mì', 'thịt']
  }
};

export const TEST_SCENARIOS = {
  USER_JOURNEY: {
    name: 'Complete User Journey',
    steps: [
      'User Registration',
      'Profile Setup',
      'Ingredient Input',
      'AI Recipe Suggestions',
      'Start Cooking Session',
      'Complete Cooking',
      'Rate Recipe',
      'View Cooking History'
    ]
  },
  AI_VALIDATION: {
    name: 'AI Suggestion Validation',
    scenarios: [
      'Valid ingredients only',
      'Mixed valid/invalid ingredients',
      'Fuzzy match ingredients',
      'Large ingredient list (10+ items)',
      'Minimal ingredient list (2-3 items)'
    ]
  },
  AUTO_APPROVAL: {
    name: 'Auto-Approval System',
    thresholds: {
      approvalRating: 4.0,
      minimumRatings: 3
    }
  }
};

export const TIMEOUTS = {
  API_REQUEST: 30000,
  AI_GENERATION: 60000,
  DATABASE_OPERATION: 10000,
  AUTHENTICATION: 15000
};

export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 5000
};