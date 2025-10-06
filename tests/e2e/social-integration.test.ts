/**
 * E2E Integration Tests for Social Features
 * Task 18.1: Execute social integration testing
 * 
 * Test Coverage:
 * 1. Friend request workflow (send → accept → friendship established)
 * 2. Privacy filtering (friends vs non-friends access control)
 * 3. Post creation → comment → reaction → notification flow
 * 4. Feed generation with mixed public and friends-only posts
 * 5. Notification delivery for all event types
 * 
 * Requirements: FR-SF-01 to FR-SF-04
 */

import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';
import { E2ETestSetup, TestUser, makeAuthenticatedRequest, waitFor, generateTestEmail } from './setup';
import { getTestConfig, TIMEOUTS } from './config';

describe('E2E: Social Features Integration', () => {
  let testSetup: E2ETestSetup;
  let userA: TestUser; // Primary test user
  let userB: TestUser; // Friend of userA
  let userC: TestUser; // Non-friend (for privacy testing)
  let config: ReturnType<typeof getTestConfig>;

  beforeAll(async () => {
    config = getTestConfig(process.env.TEST_ENV || 'dev');
    testSetup = new E2ETestSetup(config);
    
    // Create three test users for comprehensive testing
    userA = await testSetup.createTestUser(generateTestEmail());
    userA = await testSetup.authenticateUser(userA);
    
    userB = await testSetup.createTestUser(generateTestEmail());
    userB = await testSetup.authenticateUser(userB);
    
    userC = await testSetup.createTestUser(generateTestEmail());
    userC = await testSetup.authenticateUser(userC);
  }, TIMEOUTS.DATABASE_OPERATION * 5);

  afterAll(async () => {
    // Cleanup all test users
    if (userA) await testSetup.cleanupTestUser(userA);
    if (userB) await testSetup.cleanupTestUser(userB);
    if (userC) await testSetup.cleanupTestUser(userC);
    await testSetup.cleanupTestData();
  });

  describe('1. Friend Request Workflow', () => {
    let friendshipId: string;

    test('Should send friend request from User A to User B', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/friends/requests`,
        {
          method: 'POST',
          body: JSON.stringify({
            friend_id: userB.userId
          })
        },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
      const result = await response.json();
      
      expect(result).toMatchObject({
        friendship_id: expect.any(String),
        requester_id: userA.userId,
        addressee_id: userB.userId,
        status: 'PENDING',
        created_at: expect.any(String)
      });

      friendshipId = result.friendship_id;
    });

    test('User B should receive friend request notification', async () => {
      // Wait for notification to be created
      await waitFor(2000);

      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD`,
        { method: 'GET' },
        userB.accessToken!
      );

      expect(response.ok).toBe(true);
      const notifications = await response.json();
      
      expect(notifications.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'FRIEND_REQUEST',
            actor_id: userA.userId,
            is_read: false
          })
        ])
      );
    });

    test('User B should see pending friend request in requests list', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/friends/requests/received`,
        { method: 'GET' },
        userB.accessToken!
      );

      expect(response.ok).toBe(true);
      const requests = await response.json();
      
      expect(requests.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            friendship_id: friendshipId,
            requester_id: userA.userId,
            status: 'PENDING'
          })
        ])
      );
    });

    test('User B should accept friend request', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/friends/requests/${friendshipId}/accept`,
        { method: 'POST' },
        userB.accessToken!
      );

      expect(response.ok).toBe(true);
      const result = await response.json();
      
      expect(result).toMatchObject({
        friendship_id: friendshipId,
        status: 'ACCEPTED',
        accepted_at: expect.any(String)
      });
    });

    test('Friendship should be established bidirectionally', async () => {
      // Check User A's friend list
      const responseA = await makeAuthenticatedRequest(
        `${config.apiUrl}/friends`,
        { method: 'GET' },
        userA.accessToken!
      );

      expect(responseA.ok).toBe(true);
      const friendsA = await responseA.json();
      
      expect(friendsA.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: userB.userId,
            friendship_status: 'ACCEPTED'
          })
        ])
      );

      // Check User B's friend list
      const responseB = await makeAuthenticatedRequest(
        `${config.apiUrl}/friends`,
        { method: 'GET' },
        userB.accessToken!
      );

      expect(responseB.ok).toBe(true);
      const friendsB = await responseB.json();
      
      expect(friendsB.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: userA.userId,
            friendship_status: 'ACCEPTED'
          })
        ])
      );
    });

    test('User A should receive acceptance notification', async () => {
      await waitFor(2000);

      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD`,
        { method: 'GET' },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
      const notifications = await response.json();
      
      expect(notifications.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'FRIEND_REQUEST_ACCEPTED',
            actor_id: userB.userId,
            is_read: false
          })
        ])
      );
    });
  });

  describe('2. Privacy Filtering', () => {
    let publicPostId: string;
    let friendsOnlyPostId: string;

    beforeAll(async () => {
      // User A creates a public post
      const publicResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'This is a public post from User A',
            visibility: 'PUBLIC'
          })
        },
        userA.accessToken!
      );
      const publicPost = await publicResponse.json();
      publicPostId = publicPost.post_id;

      // User A creates a friends-only post
      const friendsResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'This is a friends-only post from User A',
            visibility: 'FRIENDS'
          })
        },
        userA.accessToken!
      );
      const friendsPost = await friendsResponse.json();
      friendsOnlyPostId = friendsPost.post_id;
    });

    test('Friend (User B) should see both public and friends-only posts', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/users/${userA.userId}/posts`,
        { method: 'GET' },
        userB.accessToken!
      );

      expect(response.ok).toBe(true);
      const posts = await response.json();
      
      // Should see both posts
      expect(posts.items.length).toBeGreaterThanOrEqual(2);
      
      const postIds = posts.items.map((p: any) => p.post_id);
      expect(postIds).toContain(publicPostId);
      expect(postIds).toContain(friendsOnlyPostId);
    });

    test('Non-friend (User C) should only see public posts', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/users/${userA.userId}/posts`,
        { method: 'GET' },
        userC.accessToken!
      );

      expect(response.ok).toBe(true);
      const posts = await response.json();
      
      // Should only see public post
      const postIds = posts.items.map((p: any) => p.post_id);
      expect(postIds).toContain(publicPostId);
      expect(postIds).not.toContain(friendsOnlyPostId);
    });

    test('Non-friend should receive 403 when accessing friends-only post directly', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts/${friendsOnlyPostId}`,
        { method: 'GET' },
        userC.accessToken!
      );

      expect(response.status).toBe(403);
      const error = await response.json();
      expect(error.message).toMatch(/privacy|permission|access/i);
    });

    test('Friend should access friends-only post directly', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts/${friendsOnlyPostId}`,
        { method: 'GET' },
        userB.accessToken!
      );

      expect(response.ok).toBe(true);
      const post = await response.json();
      expect(post.post_id).toBe(friendsOnlyPostId);
    });

    test('Post author should see privacy indicator in their posts', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/users/me/posts`,
        { method: 'GET' },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
      const posts = await response.json();
      
      const publicPost = posts.items.find((p: any) => p.post_id === publicPostId);
      expect(publicPost.visibility).toBe('PUBLIC');
      
      const friendsPost = posts.items.find((p: any) => p.post_id === friendsOnlyPostId);
      expect(friendsPost.visibility).toBe('FRIENDS');
    });
  });

  describe('3. Post → Comment → Reaction → Notification Flow', () => {
    let postId: string;
    let commentId: string;

    test('Step 1: User A creates a post', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'Just made an amazing dish! 🍳',
            visibility: 'PUBLIC',
            recipe_id: 'recipe-test-123'
          })
        },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
      const post = await response.json();
      
      expect(post).toMatchObject({
        post_id: expect.any(String),
        author_id: userA.userId,
        content: 'Just made an amazing dish! 🍳',
        visibility: 'PUBLIC',
        recipe_id: 'recipe-test-123',
        comment_count: 0,
        reaction_count: 0
      });

      postId = post.post_id;
    });

    test('Step 2: User B comments on the post', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts/${postId}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'Looks delicious! Can you share the recipe? 😋'
          })
        },
        userB.accessToken!
      );

      expect(response.ok).toBe(true);
      const comment = await response.json();
      
      expect(comment).toMatchObject({
        comment_id: expect.any(String),
        post_id: postId,
        author_id: userB.userId,
        content: 'Looks delicious! Can you share the recipe? 😋'
      });

      commentId = comment.comment_id;
    });

    test('Step 3: User A receives comment notification', async () => {
      await waitFor(2000);

      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD`,
        { method: 'GET' },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
      const notifications = await response.json();
      
      expect(notifications.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'POST_COMMENT',
            actor_id: userB.userId,
            target_type: 'POST',
            target_id: postId,
            is_read: false
          })
        ])
      );
    });

    test('Step 4: Post comment_count should increment', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts/${postId}`,
        { method: 'GET' },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
      const post = await response.json();
      expect(post.comment_count).toBe(1);
    });

    test('Step 5: User C reacts to the post', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts/${postId}/reactions`,
        {
          method: 'POST',
          body: JSON.stringify({
            reaction_type: 'LIKE'
          })
        },
        userC.accessToken!
      );

      expect(response.ok).toBe(true);
      const reaction = await response.json();
      
      expect(reaction).toMatchObject({
        post_id: postId,
        user_id: userC.userId,
        reaction_type: 'LIKE'
      });
    });

    test('Step 6: User A receives reaction notification', async () => {
      await waitFor(2000);

      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD`,
        { method: 'GET' },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
      const notifications = await response.json();
      
      expect(notifications.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'POST_REACTION',
            actor_id: userC.userId,
            target_type: 'POST',
            target_id: postId,
            metadata: expect.objectContaining({
              reaction_type: 'LIKE'
            })
          })
        ])
      );
    });

    test('Step 7: Post reaction_count should increment', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts/${postId}`,
        { method: 'GET' },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
      const post = await response.json();
      expect(post.reaction_count).toBe(1);
    });

    test('Step 8: User A reacts to User B\'s comment', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/comments/${commentId}/reactions`,
        {
          method: 'POST',
          body: JSON.stringify({
            reaction_type: 'HEART'
          })
        },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
    });

    test('Step 9: User B receives comment reaction notification', async () => {
      await waitFor(2000);

      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD`,
        { method: 'GET' },
        userB.accessToken!
      );

      expect(response.ok).toBe(true);
      const notifications = await response.json();
      
      expect(notifications.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'COMMENT_REACTION',
            actor_id: userA.userId,
            target_type: 'COMMENT',
            target_id: commentId,
            metadata: expect.objectContaining({
              reaction_type: 'HEART'
            })
          })
        ])
      );
    });
  });

  describe('4. Feed Generation with Mixed Privacy', () => {
    beforeAll(async () => {
      // Create various posts with different visibility settings
      
      // User A: Public post
      await makeAuthenticatedRequest(
        `${config.apiUrl}/posts`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'Public post from User A',
            visibility: 'PUBLIC'
          })
        },
        userA.accessToken!
      );

      // User A: Friends-only post
      await makeAuthenticatedRequest(
        `${config.apiUrl}/posts`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'Friends-only post from User A',
            visibility: 'FRIENDS'
          })
        },
        userA.accessToken!
      );

      // User B: Public post
      await makeAuthenticatedRequest(
        `${config.apiUrl}/posts`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'Public post from User B',
            visibility: 'PUBLIC'
          })
        },
        userB.accessToken!
      );

      // User C: Public post
      await makeAuthenticatedRequest(
        `${config.apiUrl}/posts`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'Public post from User C',
            visibility: 'PUBLIC'
          })
        },
        userC.accessToken!
      );

      await waitFor(2000); // Wait for posts to be indexed
    });

    test('User A should see own posts and friend\'s posts in feed', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/feed?limit=20`,
        { method: 'GET' },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
      const feed = await response.json();
      
      // Should contain:
      // - User A's own posts (both public and friends-only)
      // - User B's posts (friend)
      // - User C's public posts (not a friend, so only public)
      
      expect(feed.items.length).toBeGreaterThan(0);
      
      const authors = new Set(feed.items.map((p: any) => p.author_id));
      expect(authors).toContain(userA.userId); // Own posts
      expect(authors).toContain(userB.userId); // Friend's posts
      expect(authors).toContain(userC.userId); // Public posts
    });

    test('User B should see friend\'s posts and public posts', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/feed?limit=20`,
        { method: 'GET' },
        userB.accessToken!
      );

      expect(response.ok).toBe(true);
      const feed = await response.json();
      
      const authors = new Set(feed.items.map((p: any) => p.author_id));
      expect(authors).toContain(userA.userId); // Friend
      expect(authors).toContain(userB.userId); // Self
      expect(authors).toContain(userC.userId); // Public posts
      
      // Should see User A's friends-only post
      const userAPosts = feed.items.filter((p: any) => p.author_id === userA.userId);
      const friendsOnlyPost = userAPosts.find((p: any) => p.visibility === 'FRIENDS');
      expect(friendsOnlyPost).toBeDefined();
    });

    test('User C should NOT see friends-only posts in feed', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/feed?limit=20`,
        { method: 'GET' },
        userC.accessToken!
      );

      expect(response.ok).toBe(true);
      const feed = await response.json();
      
      // Should only see public posts
      const allPostsPublic = feed.items.every((p: any) => 
        p.visibility === 'PUBLIC' || p.author_id === userC.userId
      );
      expect(allPostsPublic).toBe(true);
    });

    test('Feed should be ordered by created_at (newest first)', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/feed?limit=20`,
        { method: 'GET' },
        userA.accessToken!
      );

      expect(response.ok).toBe(true);
      const feed = await response.json();
      
      // Verify descending order
      for (let i = 0; i < feed.items.length - 1; i++) {
        const current = new Date(feed.items[i].created_at).getTime();
        const next = new Date(feed.items[i + 1].created_at).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    test('Feed should support pagination', async () => {
      const firstPage = await makeAuthenticatedRequest(
        `${config.apiUrl}/feed?limit=2`,
        { method: 'GET' },
        userA.accessToken!
      );

      expect(firstPage.ok).toBe(true);
      const page1 = await firstPage.json();
      
      expect(page1.items.length).toBeLessThanOrEqual(2);
      expect(page1).toHaveProperty('nextToken');

      if (page1.nextToken) {
        const secondPage = await makeAuthenticatedRequest(
          `${config.apiUrl}/feed?limit=2&nextToken=${encodeURIComponent(page1.nextToken)}`,
          { method: 'GET' },
          userA.accessToken!
        );

        expect(secondPage.ok).toBe(true);
        const page2 = await secondPage.json();
        
        // Ensure no duplicate posts
        const page1Ids = new Set(page1.items.map((p: any) => p.post_id));
        const page2Ids = page2.items.map((p: any) => p.post_id);
        const duplicates = page2Ids.filter((id: string) => page1Ids.has(id));
        expect(duplicates.length).toBe(0);
      }
    });
  });

  describe('5. Notification Delivery for All Event Types', () => {
    let testPostId: string;
    let testCommentId: string;

    beforeAll(async () => {
      // Clear existing notifications
      const notifs = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications`,
        { method: 'GET' },
        userA.accessToken!
      );
      const notifData = await notifs.json();
      
      // Mark all as read
      for (const notif of notifData.items) {
        await makeAuthenticatedRequest(
          `${config.apiUrl}/notifications/${notif.notification_id}/read`,
          { method: 'POST' },
          userA.accessToken!
        );
      }

      // Create test post for notifications
      const postResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'Test post for notifications',
            visibility: 'PUBLIC'
          })
        },
        userA.accessToken!
      );
      const post = await postResponse.json();
      testPostId = post.post_id;
    });

    test('FRIEND_REQUEST notification should be delivered', async () => {
      // Create new user to send fresh friend request
      const newUser = await testSetup.createTestUser(generateTestEmail());
      const authenticatedUser = await testSetup.authenticateUser(newUser);
      
      await makeAuthenticatedRequest(
        `${config.apiUrl}/friends/requests`,
        {
          method: 'POST',
          body: JSON.stringify({ friend_id: userA.userId })
        },
        authenticatedUser.accessToken!
      );

      await waitFor(2000);

      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD`,
        { method: 'GET' },
        userA.accessToken!
      );

      const notifications = await response.json();
      const friendRequestNotif = notifications.items.find(
        (n: any) => n.type === 'FRIEND_REQUEST' && n.actor_id === authenticatedUser.userId
      );

      expect(friendRequestNotif).toBeDefined();
      expect(friendRequestNotif).toMatchObject({
        type: 'FRIEND_REQUEST',
        actor_id: authenticatedUser.userId,
        is_read: false
      });

      // Cleanup
      await testSetup.cleanupTestUser(authenticatedUser);
    });

    test('POST_COMMENT notification should be delivered', async () => {
      await makeAuthenticatedRequest(
        `${config.apiUrl}/posts/${testPostId}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({ content: 'Test comment for notification' })
        },
        userB.accessToken!
      );

      await waitFor(2000);

      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD`,
        { method: 'GET' },
        userA.accessToken!
      );

      const notifications = await response.json();
      const commentNotif = notifications.items.find(
        (n: any) => n.type === 'POST_COMMENT' && n.target_id === testPostId
      );

      expect(commentNotif).toBeDefined();
      expect(commentNotif).toMatchObject({
        type: 'POST_COMMENT',
        actor_id: userB.userId,
        target_type: 'POST',
        target_id: testPostId
      });
    });

    test('POST_REACTION notification should be delivered', async () => {
      await makeAuthenticatedRequest(
        `${config.apiUrl}/posts/${testPostId}/reactions`,
        {
          method: 'POST',
          body: JSON.stringify({ reaction_type: 'LIKE' })
        },
        userC.accessToken!
      );

      await waitFor(2000);

      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD`,
        { method: 'GET' },
        userA.accessToken!
      );

      const notifications = await response.json();
      const reactionNotif = notifications.items.find(
        (n: any) => n.type === 'POST_REACTION' && n.actor_id === userC.userId
      );

      expect(reactionNotif).toBeDefined();
      expect(reactionNotif.metadata).toMatchObject({
        reaction_type: 'LIKE'
      });
    });

    test('Notifications should support UNREAD filter', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD`,
        { method: 'GET' },
        userA.accessToken!
      );

      const notifications = await response.json();
      const allUnread = notifications.items.every((n: any) => n.is_read === false);
      expect(allUnread).toBe(true);
    });

    test('Marking notification as read should work', async () => {
      const notifResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD&limit=1`,
        { method: 'GET' },
        userA.accessToken!
      );

      const notifData = await notifResponse.json();
      if (notifData.items.length > 0) {
        const notificationId = notifData.items[0].notification_id;

        const markReadResponse = await makeAuthenticatedRequest(
          `${config.apiUrl}/notifications/${notificationId}/read`,
          { method: 'POST' },
          userA.accessToken!
        );

        expect(markReadResponse.ok).toBe(true);

        // Verify it's marked as read
        const verifyResponse = await makeAuthenticatedRequest(
          `${config.apiUrl}/notifications/${notificationId}`,
          { method: 'GET' },
          userA.accessToken!
        );

        const updatedNotif = await verifyResponse.json();
        expect(updatedNotif.is_read).toBe(true);
      }
    });

    test('Batch marking all notifications as read should work', async () => {
      const markAllResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications/read-all`,
        { method: 'POST' },
        userA.accessToken!
      );

      expect(markAllResponse.ok).toBe(true);

      // Verify no unread notifications remain
      await waitFor(1000);
      
      const verifyResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/notifications?filter=UNREAD`,
        { method: 'GET' },
        userA.accessToken!
      );

      const notifications = await verifyResponse.json();
      expect(notifications.items.length).toBe(0);
    });
  });

  describe('6. Edge Cases and Error Handling', () => {
    test('Should prevent duplicate friend requests', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/friends/requests`,
        {
          method: 'POST',
          body: JSON.stringify({ friend_id: userB.userId })
        },
        userA.accessToken!
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toMatch(/already|exists|duplicate/i);
    });

    test('Should prevent self-friending', async () => {
      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/friends/requests`,
        {
          method: 'POST',
          body: JSON.stringify({ friend_id: userA.userId })
        },
        userA.accessToken!
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toMatch(/yourself|self/i);
    });

    test('Should prevent commenting on inaccessible posts', async () => {
      // Create friends-only post as User A
      const postResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: 'Friends only!',
            visibility: 'FRIENDS'
          })
        },
        userA.accessToken!
      );
      const post = await postResponse.json();

      // User C (non-friend) tries to comment
      const commentResponse = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts/${post.post_id}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({ content: 'Should not work' })
        },
        userC.accessToken!
      );

      expect(commentResponse.status).toBe(403);
    });

    test('Should handle empty feed gracefully', async () => {
      // Create new user with no friends and no posts
      const newUser = await testSetup.createTestUser(generateTestEmail());
      const authenticatedUser = await testSetup.authenticateUser(newUser);

      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/feed`,
        { method: 'GET' },
        authenticatedUser.accessToken!
      );

      expect(response.ok).toBe(true);
      const feed = await response.json();
      expect(feed.items).toEqual([]);
      expect(feed.nextToken).toBeUndefined();

      await testSetup.cleanupTestUser(authenticatedUser);
    });

    test('Should validate post content length', async () => {
      const longContent = 'a'.repeat(10001); // Assuming 10k char limit

      const response = await makeAuthenticatedRequest(
        `${config.apiUrl}/posts`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: longContent,
            visibility: 'PUBLIC'
          })
        },
        userA.accessToken!
      );

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toMatch(/length|long|limit/i);
    });
  });
});
