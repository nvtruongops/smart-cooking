/**
 * Complete Database Seeding Script
 * Seeds all entities: Users, Recipes, Posts, Friends, Ratings, etc.
 * 
 * Usage: 
 * ts-node scripts/seed-complete-database.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const TABLE_NAME = 'smart-cooking-data-prod';
const REGION = 'ap-southeast-1';

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

// Helper function to batch write items
async function batchWrite(items: any[]) {
  const chunks: any[][] = [];
  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    const params = {
      RequestItems: {
        [TABLE_NAME]: chunk.map(item => ({
          PutRequest: { Item: item }
        }))
      }
    };

    try {
      await docClient.send(new BatchWriteCommand(params));
      console.log(`✅ Batch written: ${chunk.length} items`);
    } catch (error) {
      console.error('❌ Batch write error:', error);
      throw error;
    }
  }
}

// Generate timestamp
function now() {
  return new Date().toISOString();
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

// ============================================================================
// 1. SEED USER PROFILES
// ============================================================================

async function seedUsers() {
  console.log('\n📝 Seeding Users...');
  
  const users = [
    {
      user_id: '492a159c-3011-700d-cfcc-78fa1c55e328', // nvtruongops@gmail.com
      email: 'nvtruongops@gmail.com',
      username: 'nvtruongops',
      full_name: 'Nguyen Van Truong',
      avatar_url: 'https://d6grpgvslabt3.cloudfront.net/avatars/492a159c-3011-700d-cfcc-78fa1c55e328/avatar.png',
      role: 'admin'
    },
    {
      user_id: '59da256c-4001-705c-bcc6-3b4f5c9ca3e0', // admin@smartcooking.com
      email: 'admin@smartcooking.com',
      username: 'admin',
      full_name: 'System Admin',
      role: 'admin'
    },
    {
      user_id: '09aa952c-7041-706f-7f13-14d90d30b817', // test-user-1
      email: 'test-user-1@smartcooking.com',
      username: 'test_user_1',
      full_name: 'Test User One',
      role: 'user'
    },
    {
      user_id: '897a95ec-a091-7078-6e1d-8732c49a5287', // test-user-2
      email: 'test-user-2@smartcooking.com',
      username: 'test_user_2',
      full_name: 'Test User Two',
      role: 'user'
    },
    {
      user_id: '696a352c-8071-70c7-3b13-794997e1af65', // test-user-3
      email: 'test-user-3@smartcooking.com',
      username: 'test_user_3',
      full_name: 'Test User Three',
      role: 'user'
    }
  ];

  const items: any[] = [];

  for (const user of users) {
    // User Profile
    items.push({
      PK: `USER#${user.user_id}`,
      SK: 'PROFILE',
      entity_type: 'USER_PROFILE',
      user_id: user.user_id,
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      avatar_url: user.avatar_url || '',
      date_of_birth: '1990-01-01',
      gender: 'male',
      country: 'Vietnam',
      role: user.role,
      is_active: true,
      created_at: daysAgo(30),
      updated_at: now(),
      last_login: now(),
      GSI1PK: `ROLE#${user.role}`,
      GSI1SK: `USER#${daysAgo(30)}`
    });

    // User Preferences
    items.push({
      PK: `USER#${user.user_id}`,
      SK: 'PREFERENCES',
      entity_type: 'USER_PREFERENCES',
      dietary_restrictions: [],
      allergies: [],
      favorite_cuisines: ['Vietnamese', 'Asian'],
      preferred_cooking_methods: ['stir-fry', 'steam', 'soup'],
      preferred_recipe_count: 3,
      spice_level: 'medium',
      created_at: daysAgo(30),
      updated_at: now()
    });

    // Privacy Settings
    items.push({
      PK: `USER#${user.user_id}`,
      SK: 'PRIVACY',
      entity_type: 'PRIVACY_SETTINGS',
      profile_visibility: 'public',
      email_visibility: 'private',
      date_of_birth_visibility: 'friends',
      gender_visibility: 'public',
      country_visibility: 'public',
      recipes_visibility: 'public',
      ingredients_visibility: 'friends',
      preferences_visibility: 'friends',
      created_at: daysAgo(30),
      updated_at: now()
    });
  }

  await batchWrite(items);
  console.log(`✅ Created ${users.length} users with profiles, preferences, and privacy settings`);
  
  return users;
}

// ============================================================================
// 2. SEED USER INGREDIENTS
// ============================================================================

async function seedUserIngredients(users: any[]) {
  console.log('\n🥕 Seeding User Ingredients...');

  const ingredients = [
    { name: 'Thịt gà', normalized: 'thit ga' },
    { name: 'Cà chua', normalized: 'ca chua' },
    { name: 'Hành tây', normalized: 'hanh tay' },
    { name: 'Tỏi', normalized: 'toi' },
    { name: 'Gừng', normalized: 'gung' },
    { name: 'Sả', normalized: 'sa' },
    { name: 'Ớt', normalized: 'ot' },
    { name: 'Dầu ăn', normalized: 'dau an' },
    { name: 'Nước mắm', normalized: 'nuoc mam' },
    { name: 'Đường', normalized: 'duong' }
  ];

  const items: any[] = [];

  // Add ingredients to first 3 users
  for (const user of users.slice(0, 3)) {
    const userIngredients = ingredients.slice(0, Math.floor(Math.random() * 5) + 5);
    
    for (const ing of userIngredients) {
      items.push({
        PK: `USER#${user.user_id}`,
        SK: `INGREDIENT#${ing.normalized}`,
        entity_type: 'USER_INGREDIENT',
        ingredient_id: uuidv4(),
        ingredient_name: ing.name,
        normalized_name: ing.normalized,
        added_at: daysAgo(Math.floor(Math.random() * 20))
      });
    }
  }

  await batchWrite(items);
  console.log(`✅ Added ${items.length} user ingredients`);
}

// ============================================================================
// 3. SEED RECIPES
// ============================================================================

async function seedRecipes(users: any[]) {
  console.log('\n🍲 Seeding Recipes...');

  const recipes = [
    {
      title: 'Gà xào sả ớt',
      normalized_title: 'ga xao sa ot',
      description: 'Món gà xào thơm ngon với sả và ớt',
      cuisine_type: 'Vietnamese',
      cooking_method: 'stir-fry',
      meal_type: 'main',
      prep_time_minutes: 15,
      cook_time_minutes: 20,
      servings: 2,
      calories_per_serving: 350,
      ingredients: [
        { name: 'Thịt gà', quantity: '300g', unit: 'gram' },
        { name: 'Sả', quantity: '3 cây', unit: 'stick' },
        { name: 'Ớt', quantity: '5 trái', unit: 'piece' },
        { name: 'Tỏi', quantity: '3 tép', unit: 'clove' }
      ],
      instructions: [
        { step_number: 1, description: 'Ướp gà với sả ớt', duration: '10 phút' },
        { step_number: 2, description: 'Xào gà cho chín vàng', duration: '15 phút' },
        { step_number: 3, description: 'Nêm gia vị và hoàn thành', duration: '5 phút' }
      ]
    },
    {
      title: 'Cá kho tộ',
      normalized_title: 'ca kho to',
      description: 'Món cá kho đậm đà truyền thống',
      cuisine_type: 'Vietnamese',
      cooking_method: 'braising',
      meal_type: 'main',
      prep_time_minutes: 20,
      cook_time_minutes: 40,
      servings: 4,
      calories_per_serving: 280,
      ingredients: [
        { name: 'Cá basa', quantity: '500g', unit: 'gram' },
        { name: 'Đường', quantity: '2 thìa', unit: 'tablespoon' },
        { name: 'Nước mắm', quantity: '3 thìa', unit: 'tablespoon' },
        { name: 'Tỏi', quantity: '5 tép', unit: 'clove' }
      ],
      instructions: [
        { step_number: 1, description: 'Làm nước màu với đường', duration: '10 phút' },
        { step_number: 2, description: 'Kho cá với nước màu', duration: '30 phút' },
        { step_number: 3, description: 'Thu nhỏ lửa đến khi cá ngấm', duration: '10 phút' }
      ]
    },
    {
      title: 'Phở gà',
      normalized_title: 'pho ga',
      description: 'Món phở gà thơm ngon bổ dưỡng',
      cuisine_type: 'Vietnamese',
      cooking_method: 'soup',
      meal_type: 'main',
      prep_time_minutes: 30,
      cook_time_minutes: 60,
      servings: 4,
      calories_per_serving: 420,
      ingredients: [
        { name: 'Gà ta', quantity: '1 con', unit: 'whole' },
        { name: 'Bánh phở', quantity: '400g', unit: 'gram' },
        { name: 'Gừng', quantity: '50g', unit: 'gram' },
        { name: 'Hành tây', quantity: '2 củ', unit: 'piece' }
      ],
      instructions: [
        { step_number: 1, description: 'Luộc gà và lấy nước dùng', duration: '40 phút' },
        { step_number: 2, description: 'Nấu nước dùng với gia vị', duration: '20 phút' },
        { step_number: 3, description: 'Trụng bánh phở và bày bát', duration: '10 phút' }
      ]
    },
    {
      title: 'Bún chả Hà Nội',
      normalized_title: 'bun cha ha noi',
      description: 'Đặc sản Hà Nội với chả nướng thơm lừng',
      cuisine_type: 'Vietnamese',
      cooking_method: 'grilling',
      meal_type: 'main',
      prep_time_minutes: 40,
      cook_time_minutes: 30,
      servings: 3,
      calories_per_serving: 450,
      ingredients: [
        { name: 'Thịt lợn ba rọi', quantity: '500g', unit: 'gram' },
        { name: 'Bún tươi', quantity: '300g', unit: 'gram' },
        { name: 'Nước mắm', quantity: '100ml', unit: 'ml' },
        { name: 'Đường', quantity: '50g', unit: 'gram' }
      ],
      instructions: [
        { step_number: 1, description: 'Ướp thịt với gia vị', duration: '30 phút' },
        { step_number: 2, description: 'Nướng chả trên than hoa', duration: '20 phút' },
        { step_number: 3, description: 'Pha nước chấm và trình bày', duration: '10 phút' }
      ]
    },
    {
      title: 'Canh chua cá',
      normalized_title: 'canh chua ca',
      description: 'Canh chua thanh mát đậm đà Nam Bộ',
      cuisine_type: 'Vietnamese',
      cooking_method: 'soup',
      meal_type: 'soup',
      prep_time_minutes: 15,
      cook_time_minutes: 25,
      servings: 4,
      calories_per_serving: 180,
      ingredients: [
        { name: 'Cá lóc', quantity: '400g', unit: 'gram' },
        { name: 'Cà chua', quantity: '3 trái', unit: 'piece' },
        { name: 'Dứa', quantity: '100g', unit: 'gram' },
        { name: 'Me', quantity: '50g', unit: 'gram' }
      ],
      instructions: [
        { step_number: 1, description: 'Nấu nước dùng với me và dứa', duration: '10 phút' },
        { step_number: 2, description: 'Cho cá và rau vào nấu', duration: '12 phút' },
        { step_number: 3, description: 'Nêm gia vị và cho rau thơm', duration: '3 phút' }
      ]
    }
  ];

  const items: any[] = [];
  const recipeIds: string[] = [];

  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    const recipeId = uuidv4();
    recipeIds.push(recipeId);
    
    // Assign to different users
    const userId = users[i % users.length].user_id;
    const createdAt = daysAgo(25 - i * 3);

    // Recipe Metadata
    items.push({
      PK: `RECIPE#${recipeId}`,
      SK: 'METADATA',
      entity_type: 'RECIPE',
      recipe_id: recipeId,
      user_id: userId,
      title: recipe.title,
      normalized_title: recipe.normalized_title,
      description: recipe.description,
      cuisine_type: recipe.cuisine_type,
      cooking_method: recipe.cooking_method,
      meal_type: recipe.meal_type,
      prep_time_minutes: recipe.prep_time_minutes,
      cook_time_minutes: recipe.cook_time_minutes,
      servings: recipe.servings,
      calories_per_serving: recipe.calories_per_serving,
      instructions: recipe.instructions,
      is_public: true,
      is_ai_generated: false,
      is_approved: true,
      approval_type: 'manual',
      average_rating: 4 + Math.random(),
      rating_count: Math.floor(Math.random() * 10) + 5,
      ai_cache_hit_count: 0,
      created_at: createdAt,
      updated_at: createdAt,
      approved_at: createdAt,
      GSI1PK: `USER#${userId}`,
      GSI1SK: `RECIPE#${createdAt}`,
      GSI2PK: `METHOD#${recipe.cooking_method}`,
      GSI2SK: `RECIPE#${createdAt}`
    });

    // Recipe Ingredients
    recipe.ingredients.forEach((ing, idx) => {
      items.push({
        PK: `RECIPE#${recipeId}`,
        SK: `INGREDIENT#${String(idx + 1).padStart(3, '0')}`,
        entity_type: 'RECIPE_INGREDIENT',
        ingredient_name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        is_optional: false
      });
    });
  }

  await batchWrite(items);
  console.log(`✅ Created ${recipes.length} recipes with ${recipes.reduce((sum, r) => sum + r.ingredients.length, 0)} ingredients`);
  
  return recipeIds;
}

// ============================================================================
// 4. SEED FRIENDSHIPS
// ============================================================================

async function seedFriendships(users: any[]) {
  console.log('\n👥 Seeding Friendships...');

  const items: any[] = [];
  
  // User 1 (nvtruongops) friends with users 2, 3, 4
  const friendships = [
    { user1: users[0], user2: users[1] },
    { user1: users[0], user2: users[2] },
    { user1: users[0], user2: users[3] },
    { user1: users[1], user2: users[2] },
    { user1: users[2], user2: users[4] }
  ];

  for (const friendship of friendships) {
    const requestedAt = daysAgo(Math.floor(Math.random() * 20) + 5);
    const respondedAt = daysAgo(Math.floor(Math.random() * 5) + 1);

    // Forward direction
    items.push({
      PK: `USER#${friendship.user1.user_id}`,
      SK: `FRIEND#${friendship.user2.user_id}`,
      entity_type: 'FRIENDSHIP',
      friendship_id: uuidv4(),
      user_id: friendship.user1.user_id,
      friend_id: friendship.user2.user_id,
      status: 'accepted',
      requested_at: requestedAt,
      responded_at: respondedAt,
      GSI1PK: `USER#${friendship.user2.user_id}`,
      GSI1SK: `FRIEND#${friendship.user1.user_id}`
    });

    // Reverse direction (mutual friendship)
    items.push({
      PK: `USER#${friendship.user2.user_id}`,
      SK: `FRIEND#${friendship.user1.user_id}`,
      entity_type: 'FRIENDSHIP',
      friendship_id: uuidv4(),
      user_id: friendship.user2.user_id,
      friend_id: friendship.user1.user_id,
      status: 'accepted',
      requested_at: requestedAt,
      responded_at: respondedAt,
      GSI1PK: `USER#${friendship.user1.user_id}`,
      GSI1SK: `FRIEND#${friendship.user2.user_id}`
    });
  }

  await batchWrite(items);
  console.log(`✅ Created ${friendships.length} friendships (${items.length} records)`);
}

// ============================================================================
// 5. SEED COOKING HISTORY & RATINGS
// ============================================================================

async function seedCookingHistoryAndRatings(users: any[], recipeIds: string[]) {
  console.log('\n📜 Seeding Cooking History & Ratings...');

  const items: any[] = [];
  const usedRatingKeys = new Set<string>();

  // Create cooking history for users
  for (let i = 0; i < 8; i++) {
    const user = users[i % users.length];
    const recipeId = recipeIds[i % recipeIds.length];
    const historyId = uuidv4();
    const cookDate = daysAgo(Math.floor(Math.random() * 15) + 1 + i); // Add i to avoid duplicate timestamps
    const rating = Math.floor(Math.random() * 2) + 4; // 4-5 stars

    // Cooking History
    items.push({
      PK: `USER#${user.user_id}`,
      SK: `COOKING#${cookDate}#${historyId}`,
      entity_type: 'COOKING_HISTORY',
      history_id: historyId,
      user_id: user.user_id,
      recipe_id: recipeId,
      suggestion_id: null,
      status: 'completed',
      personal_rating: rating,
      personal_notes: 'Rất ngon!',
      is_favorite: Math.random() > 0.5,
      cook_date: cookDate,
      created_at: cookDate,
      updated_at: cookDate,
      GSI1PK: Math.random() > 0.5 ? `USER#${user.user_id}#FAVORITE` : `USER#${user.user_id}`,
      GSI1SK: `COOKING#${cookDate}`
    });

    // Recipe Rating - avoid duplicates
    const ratingKey = `RECIPE#${recipeId}#RATING#${user.user_id}`;
    if (!usedRatingKeys.has(ratingKey)) {
      usedRatingKeys.add(ratingKey);
      items.push({
        PK: `RECIPE#${recipeId}`,
        SK: `RATING#${user.user_id}`,
        entity_type: 'RECIPE_RATING',
        rating_id: uuidv4(),
        recipe_id: recipeId,
        user_id: user.user_id,
        history_id: historyId,
        rating: rating,
        comment: ['Ngon tuyệt!', 'Rất hợp khẩu vị!', 'Sẽ nấu lại!'][Math.floor(Math.random() * 3)],
        is_verified_cook: true,
        created_at: cookDate,
        updated_at: cookDate,
        GSI1PK: `USER#${user.user_id}`,
        GSI1SK: `RATING#${cookDate}`
      });
    }
  }

  await batchWrite(items);
  console.log(`✅ Created ${items.filter(i => i.entity_type === 'COOKING_HISTORY').length} cooking histories with ${items.filter(i => i.entity_type === 'RECIPE_RATING').length} ratings`);
}

// ============================================================================
// 6. SEED POSTS, COMMENTS & REACTIONS
// ============================================================================

async function seedPostsCommentsReactions(users: any[], recipeIds: string[]) {
  console.log('\n📱 Seeding Posts, Comments & Reactions...');

  const items: any[] = [];
  const postIds: string[] = [];

  // Create posts
  for (let i = 0; i < 5; i++) {
    const user = users[i % users.length];
    const recipeId = recipeIds[i % recipeIds.length];
    const postId = uuidv4();
    postIds.push(postId);
    const createdAt = daysAgo(Math.floor(Math.random() * 10) + 1 + i);

    items.push({
      PK: `POST#${postId}`,
      SK: 'METADATA',
      entity_type: 'POST',
      post_id: postId,
      user_id: user.user_id,
      recipe_id: recipeId,
      content: ['Vừa nấu xong món này!', 'Rất ngon, gia đình rất thích!', 'Lần đầu làm nhưng khá thành công!'][i % 3],
      images: [],
      is_public: true,
      likes_count: Math.floor(Math.random() * 20) + 5,
      comments_count: Math.floor(Math.random() * 5) + 1,
      created_at: createdAt,
      updated_at: createdAt,
      GSI1PK: `USER#${user.user_id}`,
      GSI1SK: `POST#${createdAt}`,
      GSI3PK: 'FEED#PUBLIC',
      GSI3SK: `POST#${createdAt}`
    });
  }

  // Create comments
  for (let postIdx = 0; postIdx < postIds.length; postIdx++) {
    const postId = postIds[postIdx];
    const commentCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < commentCount; i++) {
      const commenter = users[(postIdx + i + 1) % users.length];
      const commentDate = daysAgo(Math.floor(Math.random() * 5) + postIdx);
      const commentId = uuidv4();

      items.push({
        PK: `POST#${postId}`,
        SK: `COMMENT#${commentDate}#${commentId}`,
        entity_type: 'COMMENT',
        comment_id: commentId,
        post_id: postId,
        user_id: commenter.user_id,
        parent_comment_id: null,
        content: ['Trông ngon quá!', 'Để mình thử làm món này!', 'Hay ghê!'][i % 3],
        created_at: commentDate,
        updated_at: commentDate,
        GSI1PK: `USER#${commenter.user_id}`,
        GSI1SK: `COMMENT#${commentDate}`
      });
    }
  }

  // Create reactions - avoid duplicates
  const usedReactionKeys = new Set<string>();
  for (let postIdx = 0; postIdx < postIds.length; postIdx++) {
    const postId = postIds[postIdx];
    const reactionCount = Math.min(Math.floor(Math.random() * 3) + 2, users.length);
    for (let i = 0; i < reactionCount; i++) {
      const reactor = users[(postIdx + i) % users.length];
      const reactionKey = `POST#${postId}#REACTION#${reactor.user_id}`;
      
      if (!usedReactionKeys.has(reactionKey)) {
        usedReactionKeys.add(reactionKey);
        const reactionDate = daysAgo(Math.floor(Math.random() * 5) + postIdx);

        items.push({
          PK: `POST#${postId}`,
          SK: `REACTION#${reactor.user_id}`,
          entity_type: 'REACTION',
          reaction_id: uuidv4(),
          user_id: reactor.user_id,
          target_type: 'post',
          target_id: postId,
          reaction_type: 'like',
          created_at: reactionDate,
          GSI1PK: `USER#${reactor.user_id}`,
          GSI1SK: `REACTION#${reactionDate}`
        });
      }
    }
  }

  await batchWrite(items);
  const postCount = items.filter(i => i.entity_type === 'POST').length;
  const commentCount = items.filter(i => i.entity_type === 'COMMENT').length;
  const reactionCount = items.filter(i => i.entity_type === 'REACTION').length;
  console.log(`✅ Created ${postCount} posts with ${commentCount} comments and ${reactionCount} reactions`);
}

// ============================================================================
// 7. SEED NOTIFICATIONS
// ============================================================================

async function seedNotifications(users: any[]) {
  console.log('\n🔔 Seeding Notifications...');

  const items: any[] = [];

  // Create notifications for first 2 users
  for (let i = 0; i < 10; i++) {
    const recipient = users[i % 2];
    const actor = users[(i + 1) % users.length];
    const createdAt = daysAgo(Math.floor(Math.random() * 5));
    const isRead = Math.random() > 0.5;

    items.push({
      PK: `USER#${recipient.user_id}`,
      SK: `NOTIFICATION#${createdAt}#${uuidv4()}`,
      entity_type: 'NOTIFICATION',
      notification_id: uuidv4(),
      user_id: recipient.user_id,
      actor_id: actor.user_id,
      type: ['comment', 'like', 'friend_request'][i % 3],
      target_type: 'post',
      target_id: uuidv4(),
      content: `${actor.full_name} ${['commented on', 'liked', 'sent friend request to'][i % 3]} your post`,
      is_read: isRead,
      created_at: createdAt,
      GSI1PK: isRead ? `USER#${recipient.user_id}` : `USER#${recipient.user_id}#UNREAD`,
      GSI1SK: `NOTIFICATION#${createdAt}`
    });
  }

  await batchWrite(items);
  console.log(`✅ Created ${items.length} notifications`);
}

// ============================================================================
// 8. SEED AI SUGGESTIONS
// ============================================================================

async function seedAISuggestions(users: any[], recipeIds: string[]) {
  console.log('\n🤖 Seeding AI Suggestions...');

  const items: any[] = [];

  for (let i = 0; i < 3; i++) {
    const user = users[i];
    const createdAt = daysAgo(Math.floor(Math.random() * 10));
    const selectedRecipes = recipeIds.slice(0, 3);

    items.push({
      PK: `USER#${user.user_id}`,
      SK: `SUGGESTION#${createdAt}`,
      entity_type: 'AI_SUGGESTION',
      suggestion_id: uuidv4(),
      user_id: user.user_id,
      recipe_ids: selectedRecipes,
      cache_ids: [],
      prompt_text: 'Gợi ý món với gà, cà chua, hành',
      ingredients_used: ['thit ga', 'ca chua', 'hanh tay'],
      requested_recipe_count: 3,
      recipes_from_db: 2,
      recipes_from_ai: 1,
      invalid_ingredients: [],
      ai_response: {},
      was_from_cache: false,
      was_accepted: true,
      feedback_rating: 5,
      feedback_comment: 'Gợi ý rất hay!',
      created_at: createdAt
    });
  }

  await batchWrite(items);
  console.log(`✅ Created ${items.length} AI suggestions`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('🚀 Starting Complete Database Seeding...');
  console.log(`📊 Target Table: ${TABLE_NAME}`);
  console.log(`🌍 Region: ${REGION}\n`);

  try {
    // 1. Seed Users (Profiles, Preferences, Privacy)
    const users = await seedUsers();

    // 2. Seed User Ingredients
    await seedUserIngredients(users);

    // 3. Seed Recipes
    const recipeIds = await seedRecipes(users);

    // 4. Seed Friendships
    await seedFriendships(users);

    // 5. Seed Cooking History & Ratings
    await seedCookingHistoryAndRatings(users, recipeIds);

    // 6. Seed Posts, Comments & Reactions
    await seedPostsCommentsReactions(users, recipeIds);

    // 7. Seed Notifications
    await seedNotifications(users);

    // 8. Seed AI Suggestions
    await seedAISuggestions(users, recipeIds);

    console.log('\n✅ ========================================');
    console.log('✅ DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('✅ ========================================\n');

    console.log('📊 Summary:');
    console.log(`   👥 Users: ${users.length}`);
    console.log(`   🍲 Recipes: ${recipeIds.length}`);
    console.log(`   👥 Friendships: Multiple connections`);
    console.log(`   📜 Cooking History: 8 sessions`);
    console.log(`   ⭐ Ratings: 8 ratings`);
    console.log(`   📱 Posts: 5 posts`);
    console.log(`   💬 Comments: Multiple comments`);
    console.log(`   ❤️  Reactions: Multiple likes`);
    console.log(`   🔔 Notifications: 10 notifications`);
    console.log(`   🤖 AI Suggestions: 3 suggestions\n`);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run the script
main();
