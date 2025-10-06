import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';
import { E2ETestSetup, TestUser, makeAuthenticatedRequest, generateTestEmail } from './setup';
import { getTestConfig, TEST_INGREDIENTS, TIMEOUTS } from './config';

describe('E2E: AI Suggestion Validation', () => {
  let testSetup: E2ETestSetup;
  let testUser: TestUser;
  let config: ReturnType<typeof getTestConfig>;

  beforeAll(async () => {
    config = getTestConfig(process.env.TEST_ENV || 'dev');
    testSetup = new E2ETestSetup(config);
    
    await testSetup.seedTestIngredients();
    await testSetup.seedTestRecipes();
    
    testUser = await testSetup.createTestUser(generateTestEmail());
    testUser = await testSetup.authenticateUser(testUser);
  }, TIMEOUTS.DATABASE_OPERATION * 2);

  afterAll(async () => {
    if (testUser) {
      await testSetup.cleanupTestUser(testUser);
    }
    await testSetup.cleanupTestData();
  });

  test('AI Suggestions with Valid Ingredients Only', async () => {
    const response = await makeAuthenticatedRequest(
      `${config.apiUrl}/suggestions/ai`,
      {
        method: 'POST',
        body: JSON.stringify({
          ingredients: TEST_INGREDIENTS.VALID,
          preferences: {
            cuisine_type: 'vietnamese',
            cooking_method: 'stir_fry'
          }
        })
      },
      testUser.accessToken!
    );

    expect(response.ok).toBe(true);
    const result = await response.json();
    
    expect(result).toHaveProperty('recipes');
    expect(result.recipes.length).toBeGreaterThan(0);
    expect(result).toHaveProperty('stats');
    
    // Verify flexible mix algorithm stats
    expect(result.stats).toMatchObject({
      from_database: expect.any(Number),
      from_ai: expect.any(Number),
      total_recipes: expect.any(Number)
    });
    
    expect(result.stats.from_database + result.stats.from_ai).toBe(result.stats.total_recipes);
  }, TIMEOUTS.AI_GENERATION);

  test('AI Suggestions with Mixed Valid/Invalid Ingredients', async () => {
    const response = await makeAuthenticatedRequest(
      `${config.apiUrl}/suggestions/ai`,
      {
        method: 'POST',
        body: JSON.stringify({
          ingredients: TEST_INGREDIENTS.MIXED,
          preferences: {
            cuisine_type: 'vietnamese'
          }
        })
      },
      testUser.accessToken!
    );

    expect(response.ok).toBe(true);
    const result = await response.json();
    
    // Should still return recipes using only valid ingredients
    expect(result.recipes.length).toBeGreaterThan(0);
    expect(result).toHaveProperty('validation_results');
    
    // Check that invalid ingredients are flagged
    const invalidResults = result.validation_results.filter((r: any) => !r.is_valid);
    expect(invalidResults.length).toBeGreaterThan(0);
  }, TIMEOUTS.AI_GENERATION);

  test('AI Suggestions with Fuzzy Match Ingredients', async () => {
    const response = await makeAuthenticatedRequest(
      `${config.apiUrl}/suggestions/ai`,
      {
        method: 'POST',
        body: JSON.stringify({
          ingredients: TEST_INGREDIENTS.FUZZY_MATCH,
          preferences: {
            cuisine_type: 'vietnamese'
          }
        })
      },
      testUser.accessToken!
    );

    expect(response.ok).toBe(true);
    const result = await response.json();
    
    expect(result.recipes.length).toBeGreaterThan(0);
    
    // Check that fuzzy matches were corrected
    const correctedResults = result.validation_results?.filter((r: any) => r.corrected_name);
    expect(correctedResults?.length).toBeGreaterThan(0);
  }, TIMEOUTS.AI_GENERATION);
}  test('AI 
Suggestions with Large Ingredient List', async () => {
    const largeIngredientList = [
      ...TEST_INGREDIENTS.VALID,
      'bánh phở', 'gừng', 'hành lá', 'rau thơm', 'ớt', 'chanh'
    ];

    const response = await makeAuthenticatedRequest(
      `${config.apiUrl}/suggestions/ai`,
      {
        method: 'POST',
        body: JSON.stringify({
          ingredients: largeIngredientList,
          preferences: {
            cuisine_type: 'vietnamese',
            meal_type: 'dinner'
          }
        })
      },
      testUser.accessToken!
    );

    expect(response.ok).toBe(true);
    const result = await response.json();
    
    expect(result.recipes.length).toBeGreaterThan(0);
    
    // With more ingredients, should get more diverse recipes
    expect(result.stats.total_recipes).toBeGreaterThanOrEqual(3);
    
    // Check recipe diversity
    const cookingMethods = new Set(result.recipes.map((r: any) => r.cooking_method));
    expect(cookingMethods.size).toBeGreaterThan(1);
  }, TIMEOUTS.AI_GENERATION);

  test('AI Suggestions with Minimal Ingredient List', async () => {
    const minimalIngredients = TEST_INGREDIENTS.VALID.slice(0, 2);

    const response = await makeAuthenticatedRequest(
      `${config.apiUrl}/suggestions/ai`,
      {
        method: 'POST',
        body: JSON.stringify({
          ingredients: minimalIngredients,
          preferences: {
            cuisine_type: 'vietnamese'
          }
        })
      },
      testUser.accessToken!
    );

    expect(response.ok).toBe(true);
    const result = await response.json();
    
    // Should still return recipes even with minimal ingredients
    expect(result.recipes.length).toBeGreaterThan(0);
    
    // With fewer ingredients, might rely more on AI generation
    expect(result.stats.from_ai).toBeGreaterThanOrEqual(0);
  }, TIMEOUTS.AI_GENERATION);

  test('AI Suggestions Performance and Cost Tracking', async () => {
    const startTime = Date.now();
    
    const response = await makeAuthenticatedRequest(
      `${config.apiUrl}/suggestions/ai`,
      {
        method: 'POST',
        body: JSON.stringify({
          ingredients: TEST_INGREDIENTS.VALID,
          preferences: {
            cuisine_type: 'vietnamese',
            cooking_method: 'boil'
          }
        })
      },
      testUser.accessToken!
    );

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    expect(response.ok).toBe(true);
    const result = await response.json();
    
    // Performance check - should respond within reasonable time
    expect(responseTime).toBeLessThan(TIMEOUTS.AI_GENERATION);
    
    // Cost optimization check - should have DB/AI mix stats
    expect(result.stats).toMatchObject({
      from_database: expect.any(Number),
      from_ai: expect.any(Number),
      generation_time_ms: expect.any(Number)
    });
    
    // Log for cost analysis
    console.log('AI Suggestion Performance:', {
      responseTime,
      dbRecipes: result.stats.from_database,
      aiRecipes: result.stats.from_ai,
      generationTime: result.stats.generation_time_ms
    });
  }, TIMEOUTS.AI_GENERATION);

  test('AI Suggestions Error Handling', async () => {
    // Test with empty ingredients
    const emptyResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/suggestions/ai`,
      {
        method: 'POST',
        body: JSON.stringify({
          ingredients: [],
          preferences: {}
        })
      },
      testUser.accessToken!
    );

    expect(emptyResponse.status).toBe(400);
    
    // Test with invalid request format
    const invalidResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/suggestions/ai`,
      {
        method: 'POST',
        body: JSON.stringify({
          invalid_field: 'test'
        })
      },
      testUser.accessToken!
    );

    expect(invalidResponse.status).toBe(400);
  });
});