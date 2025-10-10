/**
 * Check latest session details
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const client = new DynamoDBClient({ region: 'ap-southeast-1' });
const sessionId = 'f201c2e8-72bd-443b-91ad-2198fdacee1a';

async function checkSession() {
  console.log(`🔍 Checking session: ${sessionId}\n`);

  const command = new ScanCommand({
    TableName: 'smart-cooking-data-dev',
    FilterExpression: 'session_id = :sid',
    ExpressionAttributeValues: {
      ':sid': { S: sessionId }
    }
  });

  const result = await client.send(command);
  
  if (!result.Items || result.Items.length === 0) {
    console.log('❌ Session not found!');
    return;
  }

  const session = unmarshall(result.Items[0]);
  
  console.log('✅ Session found!\n');
  console.log('Basic Info:');
  console.log(`  session_id: ${session.session_id}`);
  console.log(`  recipe_id: ${session.recipe_id}`);
  console.log(`  recipe_title: ${session.recipe_title || 'N/A'}`);
  console.log(`  status: ${session.status}`);
  console.log(`  rating: ${session.rating || 'N/A'}`);
  console.log('');
  
  console.log('Recipe Details:');
  console.log(`  Has recipe_ingredients: ${!!session.recipe_ingredients}`);
  console.log(`  Has recipe_instructions: ${!!session.recipe_instructions}`);
  console.log(`  Has recipe_cooking_method: ${!!session.recipe_cooking_method}`);
  
  if (session.recipe_ingredients) {
    console.log(`  Ingredients count: ${session.recipe_ingredients.length}`);
    console.log(`  First ingredient: ${JSON.stringify(session.recipe_ingredients[0])}`);
  }
  
  if (session.recipe_instructions) {
    console.log(`  Instructions count: ${session.recipe_instructions.length}`);
    console.log(`  First instruction: ${JSON.stringify(session.recipe_instructions[0])}`);
  }
}

checkSession().catch(console.error);
