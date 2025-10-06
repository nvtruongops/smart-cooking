// Production Test Configuration
// Used for E2E testing against deployed production infrastructure

export const productionConfig = {
  // API Configuration
  apiUrl: 'https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/',
  region: 'ap-southeast-1',
  
  // Cognito Configuration
  userPoolId: 'ap-southeast-1_Vnu4kcJin',
  userPoolClientId: '7h6n8dal12qpuh3242kg4gg4t3',
  
  // DynamoDB Configuration
  tableName: 'smart-cooking-data-prod',
  
  // CloudFront Configuration
  cloudFrontUrl: 'https://d6grpgvslabt3.cloudfront.net',
  cloudFrontDistributionId: 'E3NWDKYRQKV9E5',
  
  // S3 Configuration
  s3Bucket: 'smart-cooking-frontend-prod-156172784433',
  
  // Test Configuration
  environment: 'production',
  testTimeout: 30000, // 30 seconds
  aiGenerationTimeout: 10000, // 10 seconds for AI
  
  // Test User Configuration
  testUsers: {
    user1: {
      email: 'test-user-1@smartcooking.com',
      password: 'TestPassword123!',
      role: 'primary_tester'
    },
    user2: {
      email: 'test-user-2@smartcooking.com',
      password: 'TestPassword123!',
      role: 'friend_tester'
    },
    user3: {
      email: 'test-user-3@smartcooking.com',
      password: 'TestPassword123!',
      role: 'privacy_tester'
    }
  },
  
  // Feature Flags
  features: {
    enableAI: true,
    enableSocial: true,
    enableCaching: true,
    enableMonitoring: true
  },
  
  // Performance Thresholds
  thresholds: {
    apiLatencyP50: 500, // ms
    apiLatencyP99: 2000, // ms
    aiGenerationTime: 8000, // ms
    cacheHitRate: 0.6, // 60%
    errorRate: 0.01 // 1%
  }
};

export default productionConfig;
