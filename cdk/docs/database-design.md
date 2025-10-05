# DynamoDB Single-Table Design

## Overview

The Smart Cooking MVP uses a single DynamoDB table design to optimize costs and performance. The table `smart-cooking-data-{environment}` stores all entities using a hierarchical key structure.

## Table Structure

### Primary Keys
- **PK (Partition Key)**: Entity type + ID (e.g., `USER#uuid-123`, `RECIPE#uuid-456`)
- **SK (Sort Key)**: Sub-entity type + timestamp/ID (e.g., `PROFILE`, `COOKING#2025-01-20T15:30:00Z#uuid-789`)

### Global Secondary Indexes (GSI)

#### GSI1: User-Based Queries
- **GSI1PK**: Entity owner (e.g., `USER#uuid-123`, `CATEGORY#meat`)
- **GSI1SK**: Timestamp or secondary sort key
- **Use Cases**: User's recipes, cooking history, favorites

#### GSI2: Search & Discovery
- **GSI2PK**: Category or filter (e.g., `METHOD#stir-fry`, `INGREDIENT#SEARCH`)
- **GSI2SK**: Composite sort key (e.g., `NAME#thit-ga`, `RATING#4.5#2025-01-20`)
- **Use Cases**: Recipe search, ingredient validation, discovery

#### GSI3: Time-Based Queries
- **GSI3PK**: Time-based grouping (e.g., `RECENT#2025-01`, `TRENDING#weekly`)
- **GSI3SK**: Timestamp or popularity score
- **Use Cases**: Recent activities, trending recipes, analytics

## Entity Patterns

### User Profile
```
PK: USER#<user_id>
SK: PROFILE
GSI1PK: USER#<user_id>
GSI1SK: PROFILE
```

### User Preferences
```
PK: USER#<user_id>
SK: PREFERENCES
GSI1PK: USER#<user_id>
GSI1SK: PREFERENCES
```

### Master Ingredients
```
PK: INGREDIENT#<ingredient_id>
SK: METADATA
GSI2PK: INGREDIENT#SEARCH
GSI2SK: NAME#<normalized_name>
```

### Recipe Metadata
```
PK: RECIPE#<recipe_id>
SK: METADATA
GSI1PK: USER#<user_id>
GSI2PK: METHOD#<cooking_method>
GSI2SK: RATING#<avg_rating>#<created_at>
```

### Cooking History
```
PK: USER#<user_id>
SK: COOKING#<cook_date>#<history_id>
GSI1PK: USER#<user_id>#FAVORITE (if favorite)
GSI3PK: RECENT#<year-month>
GSI3SK: <cook_date>
```

## TTL Configuration

The table uses TTL (Time To Live) for automatic cleanup:
- **AI Suggestions**: 90 days retention
- **Temporary Sessions**: 24 hours retention
- **Old Notifications**: 30 days retention

## Features Enabled

- ✅ **Pay-per-request billing**: Cost-effective for MVP
- ✅ **Point-in-time recovery**: Enabled for production
- ✅ **Encryption at rest**: AWS managed keys
- ✅ **DynamoDB Streams**: For real-time processing
- ✅ **CloudWatch integration**: Monitoring and logging

## Access Patterns

1. **Get user profile**: Query PK=USER#<id>, SK=PROFILE
2. **Get user's cooking history**: Query PK=USER#<id>, SK begins_with COOKING#
3. **Search recipes by method**: Query GSI2 where GSI2PK=METHOD#<method>
4. **Find ingredient by name**: Query GSI2 where GSI2PK=INGREDIENT#SEARCH, GSI2SK=NAME#<name>
5. **Get user's favorites**: Query GSI1 where GSI1PK=USER#<id>#FAVORITE
6. **Get recent activities**: Query GSI3 where GSI3PK=RECENT#<year-month>

## Cost Optimization

- Single table reduces costs compared to multiple tables
- On-demand billing scales with usage
- TTL automatically cleans up temporary data
- Efficient GSI design minimizes storage costs