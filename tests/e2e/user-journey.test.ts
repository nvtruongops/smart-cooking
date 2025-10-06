import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';
import { E2ETestSetup, TestUser, makeAuthenticatedRequest, waitFor, generateTestEmail } from './setup';
import { getTestConfig, TEST_INGREDIENTS, TEST_SCENARIOS, TIMEOUTS } from './config';

describe('E2E: Complete User Journey', () => {
  let testSetup: E2ETestSetup;
  let testUser: TestUser;
  let config: ReturnType<typeof getTestConfig>;

  beforeAll(async () => {
    config = getTestConfig(process.env.TEST_ENV || 'dev');
    testSetup = new E2ETestSetup(config);
    
    // Seed test data
    await testSetup.seedTestIngredients();
    await testSetup.seedTestRecipes();
    
    // Create and authenticate test user
    testUser = await testSetup.createTestUser(generateTestEmail());
    testUser = await testSetup.authenticateUser(testUser);
  }, TIMEOUTS.DATABASE_OPERATION * 3);

  afterAll(async () => {
    if (testUser) {
      await testSetup.cleanupTestUser(testUser);
    }
    await testSetup.cleanupTestData();
  });

  test('Step 1: User Registration and Profile Setup', async () => {
    // Verify user profile exists
    const profileResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/users/profile`,
      { method: 'GET' },
      testUser.accessToken!
    );

    expect(profileResponse.ok).toBe(true);
    const profile = await profileResponse.json();
    
    expect(profile).toMatchObject({
      user_id: testUser.userId,
      email: testUser.email,
      privacy_settings: expect.any(Object),
      preferences: expect.any(Object)
    });
  });

  test('Step 2: Ingredient Input and Validation', async () => {
    // Test ingredient validation with mixed valid/invalid ingredients
    const validationResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/ingredients/validate`,
      {
        method: 'POST',
        body: JSON.stringify({
          ingredients: TEST_INGREDIENTS.MIXED
        })
      },
      testUser.accessToken!
    );

    expect(validationResponse.ok).toBe(true);
    const validation = await validationResponse.json() as any;
    
    expect(validation).toHaveProperty('results');
    expect(Array.isArray(validation.results)).toBe(true);
    expect(validation.results.length).toBe(TEST_INGREDIENTS.MIXED.length);
    
    // Check that valid ingredients are marked as valid
    const validResults = validation.results.filter((r: any) => r.is_valid);
    expect(validResults.length).toBeGreaterThan(0);
  });

  test('Step 3: AI Recipe Suggestions', async () => {
    // Request AI suggestions with valid ingredients
    const suggestionsResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/suggestions/ai`,
      {
        method: 'POST',
        body: JSON.stringify({
          ingredients: TEST_INGREDIENTS.VALID,
          preferences: {
            cuisine_type: 'vietnamese',
            cooking_method: 'stir_fry',
            meal_type: 'lunch'
          }
        })
      },
      testUser.accessToken!
    );

    expect(suggestionsResponse.ok).toBe(true);
    const suggestions = await suggestionsResponse.json() as any;
    
    expect(suggestions).toHaveProperty('recipes');
    expect(Array.isArray(suggestions.recipes)).toBe(true);
    expect(suggestions.recipes.length).toBeGreaterThan(0);
    
    // Verify recipe structure
    const recipe = suggestions.recipes[0];
    expect(recipe).toMatchObject({
      recipe_id: expect.any(String),
      title: expect.any(String),
      ingredients: expect.any(Array),
      instructions: expect.any(Array),
      cooking_method: expect.any(String)
    });

    // Store recipe for next steps
    testUser.testRecipeId = recipe.recipe_id;
  }, TIMEOUTS.AI_GENERATION);

  test('Step 4: Start Cooking Session', async () => {
    if (!testUser.testRecipeId) {
      throw new Error('No recipe ID from previous test');
    }

    const cookingResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/cooking/start`,
      {
        method: 'POST',
        body: JSON.stringify({
          recipe_id: testUser.testRecipeId,
          ingredients_used: TEST_INGREDIENTS.VALID.slice(0, 3)
        })
      },
      testUser.accessToken!
    );

    expect(cookingResponse.ok).toBe(true);
    const session = await cookingResponse.json() as any;
    
    expect(session).toMatchObject({
      session_id: expect.any(String),
      recipe_id: testUser.testRecipeId,
      status: 'cooking',
      started_at: expect.any(String)
    });

    testUser.sessionId = session.session_id;
  });

  test('Step 5: Complete Cooking and Rate Recipe', async () => {
    if (!testUser.sessionId) {
      throw new Error('No session ID from previous test');
    }

    // Complete cooking session
    const completeResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/cooking/${testUser.sessionId}/complete`,
      {
        method: 'PUT',
        body: JSON.stringify({
          notes: 'Delicious recipe! Easy to follow instructions.'
        })
      },
      testUser.accessToken!
    );

    expect(completeResponse.ok).toBe(true);
    const completedSession = await completeResponse.json() as any;
    expect(completedSession.status).toBe('completed');

    // Rate the recipe
    const rating = 4.5;
    const ratingResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/cooking/${testUser.sessionId}/rate`,
      {
        method: 'POST',
        body: JSON.stringify({
          rating: rating,
          review: 'Great recipe, will cook again!'
        })
      },
      testUser.accessToken!
    );

    expect(ratingResponse.ok).toBe(true);
    const ratingResult = await ratingResponse.json() as any;
    expect(ratingResult.rating).toBe(rating);
  });

  test('Step 6: View Cooking History', async () => {
    // Get cooking history
    const historyResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/cooking/history`,
      { method: 'GET' },
      testUser.accessToken!
    );

    expect(historyResponse.ok).toBe(true);
    const history = await historyResponse.json() as any;
    
    expect(history).toHaveProperty('sessions');
    expect(Array.isArray(history.sessions)).toBe(true);
    expect(history.sessions.length).toBeGreaterThan(0);
    
    // Find our test session
    const testSession = history.sessions.find((s: any) => s.session_id === testUser.sessionId);
    expect(testSession).toBeDefined();
    expect(testSession.status).toBe('completed');
    expect(testSession.rating).toBe(4.5);
  });
});