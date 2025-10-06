import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';
import { E2ETestSetup, TestUser, makeAuthenticatedRequest, waitFor, generateTestEmail } from './setup';
import { getTestConfig, TEST_RECIPES, TIMEOUTS } from './config';

describe('E2E: Auto-Approval System', () => {
  let testSetup: E2ETestSetup;
  let testUsers: TestUser[] = [];
  let config: ReturnType<typeof getTestConfig>;
  const AUTO_APPROVAL_THRESHOLD = 4.0;
  const MIN_RATINGS_FOR_APPROVAL = 3;

  beforeAll(async () => {
    config = getTestConfig(process.env.TEST_ENV || 'dev');
    testSetup = new E2ETestSetup(config);
    
    await testSetup.seedTestIngredients();
    await testSetup.seedTestRecipes();
    
    // Create multiple test users for rating scenarios
    for (let i = 0; i < 5; i++) {
      const user = await testSetup.createTestUser(generateTestEmail());
      const authenticatedUser = await testSetup.authenticateUser(user);
      testUsers.push(authenticatedUser);
    }
  }, TIMEOUTS.DATABASE_OPERATION * 6);

  afterAll(async () => {
    for (const user of testUsers) {
      await testSetup.cleanupTestUser(user);
    }
    await testSetup.cleanupTestData();
  });

  test('Recipe Auto-Approval with High Ratings', async () => {
    const recipeId = TEST_RECIPES.PENDING_APPROVAL.id;
    
    // Check initial recipe status (should not be approved)
    const initialResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/recipes/${recipeId}`,
      { method: 'GET' },
      testUsers[0].accessToken!
    );
    
    expect(initialResponse.ok).toBe(true);
    const initialRecipe = await initialResponse.json();
    expect(initialRecipe.is_approved).toBe(false);

    // Have multiple users cook and rate the recipe highly
    const highRatings = [4.5, 4.2, 4.8]; // Average: 4.5 (above threshold)
    
    for (let i = 0; i < highRatings.length; i++) {
      const user = testUsers[i];
      
      // Start cooking session
      const cookingResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/cooking/start`,
        {
          method: 'POST',
          body: JSON.stringify({
            recipe_id: recipeId,
            ingredients_used: TEST_RECIPES.PENDING_APPROVAL.ingredients
          })
        },
        user.accessToken!
      );
      
      expect(cookingResponse.ok).toBe(true);
      const session = await cookingResponse.json();
      
      // Complete cooking
      await makeAuthenticatedRequest(
        `${config.apiUrl}/cooking/${session.session_id}/complete`,
        {
          method: 'PUT',
          body: JSON.stringify({ notes: `Test cooking session ${i + 1}` })
        },
        user.accessToken!
      );
      
      // Rate the recipe
      const ratingResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/cooking/${session.session_id}/rate`,
        {
          method: 'POST',
          body: JSON.stringify({
            rating: highRatings[i],
            review: `Great recipe! Rating ${i + 1}`
          })
        },
        user.accessToken!
      );
      
      expect(ratingResponse.ok).toBe(true);
    }

    // Wait for auto-approval to trigger
    await waitFor(async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/recipes/${recipeId}`,
        { method: 'GET' },
        testUsers[0].accessToken!
      );
      
      if (!response.ok) return false;
      
      const recipe = await response.json();
      return recipe.is_approved === true && recipe.average_rating >= AUTO_APPROVAL_THRESHOLD;
    }, TIMEOUTS.DATABASE_OPERATION);

    // Verify final state
    const finalResponse = await makeAuthenticatedRequest(
      `${config.apiUrl}/recipes/${recipeId}`,
      { method: 'GET' },
      testUsers[0].accessToken!
    );
    
    const finalRecipe = await finalResponse.json();
    expect(finalRecipe.is_approved).toBe(true);
    expect(finalRecipe.average_rating).toBeGreaterThanOrEqual(AUTO_APPROVAL_THRESHOLD);
    expect(finalRecipe.rating_count).toBeGreaterThanOrEqual(MIN_RATINGS_FOR_APPROVAL);
  }, TIMEOUTS.DATABASE_OPERATION * 4);
}  test
('Recipe NOT Auto-Approved with Low Ratings', async () => {
    // Create a new test recipe for this scenario
    const testRecipeId = 'test-recipe-low-ratings';
    
    // Add test recipe to database (not approved)
    await testSetup.dynamodb.send(new (await import('@aws-sdk/client-dynamodb')).PutItemCommand({
      TableName: config.tableName,
      Item: (await import('@aws-sdk/util-dynamodb')).marshall({
        PK: `RECIPE#${testRecipeId}`,
        SK: 'METADATA',
        entity_type: 'RECIPE',
        recipe_id: testRecipeId,
        title: 'Test Recipe for Low Ratings',
        description: 'Test recipe that should not be auto-approved',
        cuisine_type: 'vietnamese',
        cooking_method: 'stir_fry',
        meal_type: 'lunch',
        ingredients: ['thịt bò', 'cà chua'],
        instructions: ['Step 1', 'Step 2'],
        is_approved: false,
        average_rating: 0,
        rating_count: 0,
        cook_count: 0,
        favorite_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        GSI1PK: 'RECIPE',
        GSI1SK: 'vietnamese#stir_fry#lunch',
        GSI2PK: 'RECIPE_POPULAR',
        GSI2SK: `000#${new Date().toISOString()}`
      })
    }));

    // Have users rate the recipe below threshold
    const lowRatings = [3.0, 2.5, 3.5]; // Average: 3.0 (below 4.0 threshold)
    
    for (let i = 0; i < lowRatings.length; i++) {
      const user = testUsers[i];
      
      // Start and complete cooking session
      const cookingResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/cooking/start`,
        {
          method: 'POST',
          body: JSON.stringify({
            recipe_id: testRecipeId,
            ingredients_used: ['thịt bò', 'cà chua']
          })
        },
        user.accessToken!
      );
      
      const session = await cookingResponse.json();
      
      await makeAuthenticatedRequest(
        `${config.apiUrl}/cooking/${session.session_id}/complete`,
        { method: 'PUT', body: JSON.stringify({ notes: 'Completed' }) },
        user.accessToken!
      );
      
      // Rate with low score
      await makeAuthenticatedRequest(
        `${config.apiUrl}/cooking/${session.session_id}/rate`,
        {
          method: 'POST',
          body: JSON.stringify({
            rating: lowRatings[i],
            review: `Low rating test ${i + 1}`
          })
        },
        user.accessToken!
      );
    }

    // Wait a bit and verify recipe is NOT auto-approved
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const response = await makeAuthenticatedRequest(
      `${config.apiUrl}/recipes/${testRecipeId}`,
      { method: 'GET' },
      testUsers[0].accessToken!
    );
    
    const recipe = await response.json();
    expect(recipe.is_approved).toBe(false);
    expect(recipe.average_rating).toBeLessThan(AUTO_APPROVAL_THRESHOLD);
    
    // Cleanup test recipe
    await testSetup.dynamodb.send(new (await import('@aws-sdk/client-dynamodb')).DeleteItemCommand({
      TableName: config.tableName,
      Key: (await import('@aws-sdk/util-dynamodb')).marshall({
        PK: `RECIPE#${testRecipeId}`,
        SK: 'METADATA'
      })
    }));
  });

  test('Auto-Approval Edge Cases', async () => {
    // Test case: Exactly at threshold
    const edgeRecipeId = 'test-recipe-edge-case';
    
    // Create edge case recipe
    await testSetup.dynamodb.send(new (await import('@aws-sdk/client-dynamodb')).PutItemCommand({
      TableName: config.tableName,
      Item: (await import('@aws-sdk/util-dynamodb')).marshall({
        PK: `RECIPE#${edgeRecipeId}`,
        SK: 'METADATA',
        entity_type: 'RECIPE',
        recipe_id: edgeRecipeId,
        title: 'Edge Case Recipe',
        description: 'Recipe exactly at approval threshold',
        cuisine_type: 'vietnamese',
        cooking_method: 'boil',
        meal_type: 'dinner',
        ingredients: ['gạo', 'tỏi'],
        instructions: ['Boil rice', 'Add garlic'],
        is_approved: false,
        average_rating: 0,
        rating_count: 0,
        cook_count: 0,
        favorite_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        GSI1PK: 'RECIPE',
        GSI1SK: 'vietnamese#boil#dinner',
        GSI2PK: 'RECIPE_POPULAR',
        GSI2SK: `000#${new Date().toISOString()}`
      })
    }));

    // Rate exactly at threshold: 4.0, 4.0, 4.0 = 4.0 average
    const thresholdRatings = [4.0, 4.0, 4.0];
    
    for (let i = 0; i < thresholdRatings.length; i++) {
      const user = testUsers[i + 2]; // Use different users
      
      const cookingResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/cooking/start`,
        {
          method: 'POST',
          body: JSON.stringify({
            recipe_id: edgeRecipeId,
            ingredients_used: ['gạo', 'tỏi']
          })
        },
        user.accessToken!
      );
      
      const session = await cookingResponse.json();
      
      await makeAuthenticatedRequest(
        `${config.apiUrl}/cooking/${session.session_id}/complete`,
        { method: 'PUT', body: JSON.stringify({ notes: 'Edge case test' }) },
        user.accessToken!
      );
      
      await makeAuthenticatedRequest(
        `${config.apiUrl}/cooking/${session.session_id}/rate`,
        {
          method: 'POST',
          body: JSON.stringify({
            rating: thresholdRatings[i],
            review: `Threshold test ${i + 1}`
          })
        },
        user.accessToken!
      );
    }

    // Should be approved (>= 4.0)
    await waitFor(async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/recipes/${edgeRecipeId}`,
        { method: 'GET' },
        testUsers[0].accessToken!
      );
      
      if (!response.ok) return false;
      const recipe = await response.json();
      return recipe.is_approved === true;
    }, TIMEOUTS.DATABASE_OPERATION);

    // Cleanup
    await testSetup.dynamodb.send(new (await import('@aws-sdk/client-dynamodb')).DeleteItemCommand({
      TableName: config.tableName,
      Key: (await import('@aws-sdk/util-dynamodb')).marshall({
        PK: `RECIPE#${edgeRecipeId}`,
        SK: 'METADATA'
      })
    }));
  });
});