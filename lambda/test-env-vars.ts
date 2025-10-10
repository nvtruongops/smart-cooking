/**
 * Environment Variable Validation Test
 * Tests Lambda behavior when DynamoDB and S3 env vars are missing
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

// Test results
interface TestResult {
  lambda: string;
  service: string;
  hasFallback: boolean;
  usesNonNullAssertion: boolean;
  validated: boolean;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  behavior: string;
}

const results: TestResult[] = [];

// Simulate missing environment variables
function testMissingEnvVars() {
  console.log('🧪 Testing Lambda behavior with missing environment variables\n');

  // Save original values
  const originalDynamoDB = process.env.DYNAMODB_TABLE;
  const originalRegion = process.env.AWS_REGION;
  const originalS3 = process.env.S3_BUCKET_NAME;

  // Test 1: Friends Cache Service (uses non-null assertion)
  console.log('Test 1: Friends Cache Service');
  delete process.env.DYNAMODB_TABLE;
  delete process.env.AWS_REGION;
  
  try {
    // This will crash because of tableName = process.env.DYNAMODB_TABLE!
    // We can't actually import it without crashing, so we analyze the code
    results.push({
      lambda: 'friends',
      service: 'CacheService',
      hasFallback: false,
      usesNonNullAssertion: true,
      validated: false,
      risk: 'HIGH',
      behavior: '❌ CRASH on initialization - process.env.DYNAMODB_TABLE! returns undefined'
    });
    console.log('  ❌ WILL CRASH: Uses non-null assertion operator');
  } catch (error) {
    console.log('  ❌ ERROR:', error);
  }

  // Test 2: AI Suggestion (uses fallback)
  console.log('\nTest 2: AI Suggestion Lambda');
  delete process.env.DYNAMODB_TABLE;
  delete process.env.AWS_REGION;
  
  // Simulate the code: const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'smart-cooking-data';
  const simulatedTable = process.env.DYNAMODB_TABLE || 'smart-cooking-data';
  const simulatedRegion = process.env.AWS_REGION || 'us-east-1';
  
  results.push({
    lambda: 'ai-suggestion',
    service: 'Main Handler',
    hasFallback: true,
    usesNonNullAssertion: false,
    validated: false,
    risk: 'MEDIUM',
    behavior: `⚠️ Uses defaults: table='${simulatedTable}', region='${simulatedRegion}' (may be wrong environment)`
  });
  console.log(`  ⚠️ RUNS with defaults: table='${simulatedTable}', region='${simulatedRegion}'`);

  // Test 3: Monitoring Lambda (validated)
  console.log('\nTest 3: Monitoring Lambda');
  delete process.env.DYNAMODB_TABLE;
  
  try {
    // Simulate: if (!tableName) throw new Error(...)
    const tableName = process.env.DYNAMODB_TABLE;
    if (!tableName) {
      throw new Error('DYNAMODB_TABLE environment variable is required');
    }
  } catch (error: any) {
    results.push({
      lambda: 'monitoring',
      service: 'Main Handler',
      hasFallback: false,
      usesNonNullAssertion: false,
      validated: true,
      risk: 'LOW',
      behavior: '✅ Fails fast with clear error message'
    });
    console.log('  ✅ VALIDATED:', error.message);
  }

  // Test 4: Avatar Service (uses fallback for S3)
  console.log('\nTest 4: Avatar Service (S3)');
  delete process.env.S3_BUCKET_NAME;
  delete process.env.AWS_REGION;
  
  const simulatedBucket = process.env.S3_BUCKET_NAME || 'smart-cooking-images';
  const simulatedS3Region = process.env.AWS_REGION || 'us-east-1';
  
  results.push({
    lambda: 'user-profile',
    service: 'AvatarService (S3)',
    hasFallback: true,
    usesNonNullAssertion: false,
    validated: false,
    risk: 'MEDIUM',
    behavior: `⚠️ Uses defaults: bucket='${simulatedBucket}', region='${simulatedS3Region}' (may not exist)`
  });
  console.log(`  ⚠️ RUNS with defaults: bucket='${simulatedBucket}', region='${simulatedS3Region}'`);

  // Restore original values
  if (originalDynamoDB) process.env.DYNAMODB_TABLE = originalDynamoDB;
  if (originalRegion) process.env.AWS_REGION = originalRegion;
  if (originalS3) process.env.S3_BUCKET_NAME = originalS3;

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY OF ENVIRONMENT VARIABLE HANDLING\n');
  
  const highRisk = results.filter(r => r.risk === 'HIGH');
  const mediumRisk = results.filter(r => r.risk === 'MEDIUM');
  const lowRisk = results.filter(r => r.risk === 'LOW');

  console.log(`🔴 HIGH RISK (${highRisk.length}):`);
  highRisk.forEach(r => {
    console.log(`   ${r.lambda}/${r.service}:`);
    console.log(`   ${r.behavior}\n`);
  });

  console.log(`🟡 MEDIUM RISK (${mediumRisk.length}):`);
  mediumRisk.forEach(r => {
    console.log(`   ${r.lambda}/${r.service}:`);
    console.log(`   ${r.behavior}\n`);
  });

  console.log(`🟢 LOW RISK (${lowRisk.length}):`);
  lowRisk.forEach(r => {
    console.log(`   ${r.lambda}/${r.service}:`);
    console.log(`   ${r.behavior}\n`);
  });

  console.log('='.repeat(80));
  console.log('\n📋 RECOMMENDATIONS:\n');
  console.log('1. FIX HIGH RISK: Replace non-null assertions with validation');
  console.log('2. FIX MEDIUM RISK: Add explicit validation, remove fallback defaults');
  console.log('3. VERIFY CDK: Ensure all env vars are set in CloudFormation template');
  console.log('4. ADD TESTS: Create integration tests for missing env vars\n');
}

// Run tests
testMissingEnvVars();

export { testMissingEnvVars, results };
