#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';

interface TestSuite {
  name: string;
  file: string;
  description: string;
  estimatedTime: string;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'User Journey',
    file: 'user-journey.test.ts',
    description: 'Complete user flow from registration to recipe rating',
    estimatedTime: '3-5 minutes'
  },
  {
    name: 'AI Suggestions',
    file: 'ai-suggestions.test.ts',
    description: 'AI suggestion validation with various ingredient combinations',
    estimatedTime: '5-8 minutes'
  },
  {
    name: 'Auto-Approval',
    file: 'auto-approval.test.ts',
    description: 'Recipe auto-approval system with multiple user ratings',
    estimatedTime: '4-6 minutes'
  },
  {
    name: 'Cost Metrics',
    file: 'cost-metrics.test.ts',
    description: 'Cost optimization and CloudWatch metrics verification',
    estimatedTime: '3-5 minutes'
  }
];

function printHeader() {
  console.log('🧪 Smart Cooking MVP - E2E Test Suite');
  console.log('=====================================');
  console.log('');
}

function printTestSuites() {
  console.log('Available Test Suites:');
  console.log('');
  
  TEST_SUITES.forEach((suite, index) => {
    console.log(`${index + 1}. ${suite.name}`);
    console.log(`   File: ${suite.file}`);
    console.log(`   Description: ${suite.description}`);
    console.log(`   Estimated Time: ${suite.estimatedTime}`);
    console.log('');
  });
}

function validateEnvironment() {
  console.log('🔍 Validating Environment...');
  
  const requiredFiles = [
    'package.json',
    'jest.setup.ts',
    'tsconfig.json',
    'setup.ts',
    'config.ts'
  ];

  const missingFiles = requiredFiles.filter(file => !existsSync(file));
  
  if (missingFiles.length > 0) {
    console.error('❌ Missing required files:', missingFiles);
    process.exit(1);
  }

  const requiredEnvVars = [
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY'
  ];

  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.warn('⚠️  Missing environment variables:', missingEnvVars);
    console.warn('   Tests may fail without proper AWS credentials');
  }

  console.log('✅ Environment validation complete');
  console.log('');
}

function runTestSuite(suiteFile: string, environment: string = 'dev') {
  console.log(`🚀 Running test suite: ${suiteFile}`);
  console.log(`   Environment: ${environment}`);
  console.log('');

  try {
    const command = `TEST_ENV=${environment} npm test ${suiteFile}`;
    execSync(command, { stdio: 'inherit' });
    
    console.log('');
    console.log(`✅ Test suite completed: ${suiteFile}`);
    
  } catch (error) {
    console.error('');
    console.error(`❌ Test suite failed: ${suiteFile}`);
    console.error('Error:', error.message);
    process.exit(1);
  }
}

function runAllTests(environment: string = 'dev') {
  console.log('🚀 Running All E2E Test Suites');
  console.log(`   Environment: ${environment}`);
  console.log(`   Total Estimated Time: 15-24 minutes`);
  console.log('');

  const startTime = Date.now();
  
  for (const suite of TEST_SUITES) {
    console.log(`📋 Starting: ${suite.name} (${suite.estimatedTime})`);
    runTestSuite(suite.file, environment);
    console.log('');
  }

  const endTime = Date.now();
  const totalTime = Math.round((endTime - startTime) / 1000 / 60 * 10) / 10;
  
  console.log('🎉 All E2E Tests Completed Successfully!');
  console.log(`   Total Time: ${totalTime} minutes`);
  console.log('');
}

function printUsage() {
  console.log('Usage:');
  console.log('  npm run test              # Run all test suites (dev environment)');
  console.log('  npm run test:dev          # Run all test suites (dev environment)');
  console.log('  npm run test:prod         # Run all test suites (prod environment)');
  console.log('  npm run test:user-journey # Run user journey tests only');
  console.log('  npm run test:ai-suggestions # Run AI suggestion tests only');
  console.log('  npm run test:auto-approval # Run auto-approval tests only');
  console.log('  npm run test:cost-metrics # Run cost metrics tests only');
  console.log('');
  console.log('Environment Variables:');
  console.log('  TEST_ENV                  # Target environment (dev/prod)');
  console.log('  AWS_REGION               # AWS region');
  console.log('  AWS_ACCESS_KEY_ID        # AWS access key');
  console.log('  AWS_SECRET_ACCESS_KEY    # AWS secret key');
  console.log('  DEV_API_URL              # Dev API endpoint');
  console.log('  PROD_API_URL             # Prod API endpoint');
  console.log('  DEV_USER_POOL_ID         # Dev Cognito User Pool ID');
  console.log('  PROD_USER_POOL_ID        # Prod Cognito User Pool ID');
  console.log('');
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const environment = process.env.TEST_ENV || 'dev';

  printHeader();

  if (command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === 'list') {
    printTestSuites();
    return;
  }

  validateEnvironment();

  if (!command || command === 'all') {
    runAllTests(environment);
  } else if (command.endsWith('.test.ts')) {
    runTestSuite(command, environment);
  } else {
    console.error(`❌ Unknown command: ${command}`);
    console.log('');
    printUsage();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { runTestSuite, runAllTests, TEST_SUITES };