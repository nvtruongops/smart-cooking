---
title: "Requirements"
menu:
  ai_dlc:
    parent: ai_dlc
    weight: 2
---
# Requirements Document - Smart Cooking MVP

## Introduction

Smart Cooking App là nền tảng ứng dụng nấu ăn thông minh sử dụng AI để cá nhân hóa gợi ý công thức dựa trên nguyên liệu có sẵn, tối ưu hóa việc sử dụng nguyên liệu để giảm lãng phí thực phẩm, và kết nối cộng đồng người yêu thích nấu ăn. Hệ thống sử dụng kiến trúc serverless trên AWS với chiến lược flexible mix giữa database và AI generation để tối ưu chi phí và chất lượng.

## Requirements

### Requirement 1: User Authentication & Profile Management

**User Story:** As a home cook, I want to create and manage my account with personal preferences, so that I can receive personalized recipe suggestions and track my cooking journey.

#### Acceptance Criteria

1. WHEN a user registers with email, password, username, and full name THEN the system SHALL validate email format, check password strength (min 8 characters), verify username uniqueness, and send verification email via Cognito
2. WHEN a user logs in with valid credentials THEN the system SHALL authenticate via Cognito and return JWT token with redirect to dashboard
3. WHEN a user updates their profile with full name, date of birth, gender, country, and avatar THEN the system SHALL validate date of birth (user >= 13 years old), gender enum (male, female, other), and country code
4. WHEN a user sets cooking preferences including preferred cooking methods, favorite cuisines, allergies, and dietary restrictions THEN the system SHALL save these preferences for AI personalization
5. IF a user provides invalid profile data THEN the system SHALL return specific validation errors with guidance

### Requirement 2: Ingredient Management System

**User Story:** As a user, I want to input and manage my available ingredients with validation and auto-correction, so that I can get accurate recipe suggestions based on what I actually have.

#### Acceptance Criteria

1. WHEN a user adds an ingredient by name THEN the system SHALL validate against master ingredients database with fuzzy search and auto-correction for similar matches
2. WHEN an ingredient is not found THEN the system SHALL provide suggestions for similar ingredients and log the invalid ingredient for admin review
3. WHEN a user views their ingredient list THEN the system SHALL display all ingredients with added timestamps sorted by most recent
4. WHEN a user removes an ingredient THEN the system SHALL delete it from their personal ingredient list
5. WHEN a user validates multiple ingredients in batch THEN the system SHALL return arrays of valid, invalid, corrected, and suggested ingredients
6. IF an invalid ingredient is reported 5 or more times THEN the system SHALL notify admin for review

### Requirement 3: AI Recipe Suggestion Engine

**User Story:** As a user, I want to receive personalized recipe suggestions based on my available ingredients and preferences, so that I can cook meals that match my taste and dietary needs while using what I have.

#### Acceptance Criteria

1. WHEN a user requests 1-5 recipe suggestions with minimum 2 ingredients THEN the system SHALL query approved recipes from database matching ingredients and categories, calculate gap between requested and available recipes, and generate remaining recipes using AI
2. WHEN generating AI suggestions THEN the system SHALL use user context including age, gender, country, preferred cooking methods, favorite cuisines, and allergies for personalization
3. WHEN user has allergies specified THEN the system SHALL absolutely avoid those ingredients in all suggestions
4. WHEN AI generation is requested THEN the system SHALL ensure category diversity (xào, canh, hấp, chiên) and complete within 60 seconds timeout
5. WHEN invalid ingredients are provided THEN the system SHALL log them to CloudWatch, provide alternative suggestions, and still generate recipes with valid ingredients
6. IF AI generation fails or times out THEN the system SHALL return database recipes only with appropriate error message

### Requirement 4: Cooking History & Rating System

**User Story:** As a user, I want to track my cooking history and rate recipes I've made, so that I can build a personal cookbook and help improve the community recipe database through my feedback.

#### Acceptance Criteria

1. WHEN a user starts cooking a recipe THEN the system SHALL create a cooking history entry with status 'cooking' and return history ID
2. WHEN a user completes cooking THEN the system SHALL update status to 'completed' and prompt for rating
3. WHEN a user rates a recipe with 1-5 stars and optional comment THEN the system SHALL save the rating, update recipe's average rating, and check for auto-approval
4. WHEN a recipe's average rating reaches 4.0 or higher THEN the system SHALL automatically set is_approved=true, is_public=true, and notify the user that their recipe was added to the database
5. WHEN a user views their cooking history THEN the system SHALL display all cooking sessions with recipe details, status, cook date, personal rating, and notes sorted by newest first
6. WHEN a user marks a recipe as favorite THEN the system SHALL update their cooking history and allow filtering by favorites

### Requirement 5: Recipe Database & Search

**User Story:** As a user, I want to browse and search approved recipes from the community database, so that I can discover new dishes and see detailed cooking instructions.

#### Acceptance Criteria

1. WHEN a user views recipe details THEN the system SHALL display title, description, cuisine type, cooking method, ingredients with quantities, step-by-step instructions, nutritional info, average rating, and approval status
2. WHEN a user searches recipes THEN the system SHALL search in title and description with filters for cuisine type, cooking method, and meal type, returning paginated results of approved recipes only
3. WHEN displaying search results THEN the system SHALL allow sorting by rating, created date, and popularity
4. WHEN a recipe is auto-approved through rating system THEN the system SHALL make it publicly searchable and viewable
5. IF no recipes match search criteria THEN the system SHALL suggest alternative search terms or broader filters

### Requirement 6: Master Ingredients Database

**User Story:** As a system administrator, I want to maintain a curated database of valid ingredients with fuzzy matching capabilities, so that users can input ingredients naturally while maintaining data quality.

#### Acceptance Criteria

1. WHEN the system validates an ingredient THEN it SHALL check against master ingredients database with exact match first, then fuzzy search for similar matches
2. WHEN fuzzy search finds similar ingredients THEN the system SHALL suggest auto-correction with confidence score
3. WHEN an invalid ingredient is reported multiple times THEN the system SHALL flag it for admin review to potentially add to master database
4. WHEN master ingredients database is updated THEN the system SHALL maintain Vietnamese and English names for each ingredient
5. IF an ingredient has multiple variations or spellings THEN the system SHALL normalize to the canonical form

### Requirement 7: System Performance & Reliability

**User Story:** As a user, I want the application to be fast, reliable, and available when I need to cook, so that I can have a smooth cooking experience without technical interruptions.

#### Acceptance Criteria

1. WHEN a user makes API requests (non-AI) THEN the system SHALL respond within 500ms for 95% of requests
2. WHEN AI recipe generation is requested THEN the system SHALL complete within 5 seconds per recipe with loading indicators shown
3. WHEN the system experiences high load THEN it SHALL auto-scale serverless functions to maintain performance
4. WHEN system errors occur THEN the system SHALL log to CloudWatch, maintain <1% error rate, and provide graceful error messages to users
5. WHEN the system is operational THEN it SHALL maintain 99.5% uptime monthly with monitoring and alerting in place

### Requirement 8: Data Privacy & Security

**User Story:** As a user, I want my personal data to be secure and used transparently for AI personalization, so that I can trust the system with my information while getting personalized experiences.

#### Acceptance Criteria

1. WHEN AI generates suggestions THEN it SHALL use only age, gender, country, cooking preferences, cuisines, and allergies for personalization, never using email, full name, or address
2. WHEN user data is stored THEN the system SHALL encrypt all data at rest and in transit using AWS managed encryption
3. WHEN users access the system THEN all API calls SHALL be authenticated via Cognito JWT tokens with proper authorization
4. WHEN API requests are made THEN the system SHALL validate and sanitize all inputs to prevent injection attacks
5. IF a user wants to delete their account THEN the system SHALL provide data deletion capability in compliance with GDPR requirements

### Requirement 9: Cost Optimization & Scalability

**User Story:** As a product owner, I want the system to operate cost-effectively while scaling with user growth, so that the business remains sustainable as it grows.

#### Acceptance Criteria

1. WHEN the system serves 1,000 users THEN the monthly operational cost SHALL remain under $160 with budget alarms at $140
2. WHEN recipe suggestions are requested THEN the system SHALL use flexible mix strategy, prioritizing database recipes over AI generation to reduce costs
3. WHEN database coverage grows THEN the system SHALL automatically reduce AI generation costs by 30-70% through increased database usage
4. WHEN system usage increases THEN serverless architecture SHALL auto-scale without manual intervention
5. IF costs exceed budget thresholds THEN the system SHALL trigger alerts and implement cost-saving measures like caching and rate limiting

## Social Features Requirements

### FR-SF-01: Privacy & Access Control

**User Story:** As a user, I want to control the visibility of my personal information, recipes, and cooking activities, so that I can share as much or as little as I'm comfortable with.

#### Acceptance Criteria

1. WHEN a user configures privacy settings THEN they SHALL be able to set visibility levels (public/friends/private) for profile, email, date of birth, recipes, ingredients, and preferences
2. WHEN another user views my profile THEN the system SHALL filter displayed data based on my privacy settings and our friendship status
3. WHEN privacy is set to "friends" THEN only users with accepted friendship SHALL see the protected data
4. WHEN privacy is set to "private" THEN only the user themselves SHALL see their own data
5. IF privacy settings are not configured THEN the system SHALL apply secure defaults (profile: public, personal data: private)

### FR-SF-02: Friends & Social Connections

**User Story:** As a user, I want to send and accept friend requests to connect with other home cooks, so that I can build my cooking community and share experiences with people I know.

#### Acceptance Criteria

1. WHEN a user sends a friend request THEN the system SHALL create a pending friendship record and notify the recipient
2. WHEN a user receives a friend request THEN they SHALL be able to accept, reject, or ignore it
3. WHEN a friendship is accepted THEN both users SHALL appear in each other's friends list with bidirectional access
4. WHEN a user views their friends list THEN they SHALL see accepted friends with filtering options (all/pending/accepted)
5. IF a user tries to send duplicate friend requests THEN the system SHALL prevent it and show existing request status

### FR-SF-03: Social Feed & Posts

**User Story:** As a user, I want to share my cooking experiences, view friends' cooking activities, and engage through comments and reactions, so that I can participate in a vibrant cooking community.

#### Acceptance Criteria

1. WHEN a user creates a post THEN they SHALL be able to add text content, images, and link to a recipe with privacy level selection (public/friends)
2. WHEN a user views their feed THEN the system SHALL display posts from friends and public posts in reverse chronological order
3. WHEN a user comments on a post THEN the system SHALL save the comment, increment comment count, and notify the post owner
4. WHEN a user reacts to a post or comment THEN the system SHALL record the reaction (like, love, wow), update counts, and notify the owner
5. IF a user deletes their post THEN the system SHALL remove the post and all associated comments and reactions

### FR-SF-04: Notifications

**User Story:** As a user, I want to receive timely notifications about social interactions and important events, so that I can stay connected with my cooking community.

#### Acceptance Criteria

1. WHEN a user receives a friend request, comment, like, or mention THEN the system SHALL create a notification with appropriate content
2. WHEN a recipe is auto-approved through ratings THEN the system SHALL notify the recipe creator
3. WHEN a user views notifications THEN they SHALL see unread notifications highlighted with the ability to mark as read
4. WHEN notifications are older than 30 days THEN the system SHALL automatically delete them using DynamoDB TTL
5. IF a user clicks a notification THEN the system SHALL navigate to the relevant target (post, recipe, profile) and mark notification as read

## Deployment & Infrastructure Requirements

### Requirement 10: Build & Deployment Automation

**User Story:** As a DevOps engineer, I want automated build and deployment pipelines for both frontend and backend, so that we can deploy updates quickly and reliably.

#### Acceptance Criteria

1. WHEN code is pushed to GitHub THEN the CI/CD pipeline SHALL automatically run tests, build, and deploy to the appropriate environment (dev/staging/prod based on branch)
2. WHEN frontend builds complete THEN the system SHALL upload static files to S3, invalidate CloudFront cache, and verify deployment health
3. WHEN backend Lambda functions are updated THEN the system SHALL package code, deploy via CDK, and run smoke tests
4. WHEN deployment fails THEN the system SHALL send alerts, maintain previous version, and provide rollback capability
5. IF health checks fail after deployment THEN the system SHALL automatically trigger rollback to previous stable version

### Requirement 11: Production Readiness

**User Story:** As a product owner, I want the production environment to be properly configured with monitoring, security, and scalability, so that the application is reliable and secure for end users.

#### Acceptance Criteria

1. WHEN the application is deployed to production THEN it SHALL use production-grade DynamoDB with point-in-time recovery and automated backups
2. WHEN users access the application THEN it SHALL be served via custom domain with valid SSL certificate and CloudFront CDN
3. WHEN the application is under attack THEN AWS WAF SHALL protect against common threats (SQL injection, XSS, rate limiting)
4. WHEN issues occur in production THEN CloudWatch alarms SHALL trigger notifications to the team within 5 minutes
5. IF the production deployment is updated THEN a full end-to-end test suite SHALL verify all critical user flows before go-live