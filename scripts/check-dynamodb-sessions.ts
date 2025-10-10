/**
 * Check DynamoDB sessions directly
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const client = new DynamoDBClient({ region: 'ap-southeast-1' });

async function checkSessions() {
  console.log('🔍 Checking DynamoDB sessions...\n');

  const command = new ScanCommand({
    TableName: 'smart-cooking-data-dev',
    FilterExpression: 'contains(SK, :sk)',
    ExpressionAttributeValues: {
      ':sk': { S: 'SESSION' }
    }
  });

  const result = await client.send(command);
  
  console.log(`✅ Found ${result.Count} sessions\n`);

  if (result.Items) {
    result.Items.forEach((item, index) => {
      const session = unmarshall(item);
      console.log(`${index + 1}. Session:`);
      console.log(`   PK: ${session.PK}`);
      console.log(`   SK: ${session.SK}`);
      console.log(`   session_id: ${session.session_id}`);
      console.log(`   recipe_id: ${session.recipe_id}`);
      console.log(`   status: ${session.status}`);
      console.log(`   started_at: ${session.started_at}`);
      console.log(`   completed_at: ${session.completed_at || 'N/A'}`);
      console.log(`   rating: ${session.rating || 'N/A'}`);
      console.log('');
    });
  }
}

checkSessions().catch(console.error);
