# Task 21: Chuyển từ Amplify sang Docker Deployment

**Status**: 🟡 In Progress  
**Date**: October 7, 2025  
**Priority**: HIGH

---

## 📋 Tổng quan

Sau 14 lần thử deploy trên AWS Amplify đều thất bại với lỗi 404, quyết định chuyển sang **AWS App Runner** với Docker container.

---

## ✅ Đã hoàn thành

### 1. Infrastructure Backend (100%)
- ✅ DynamoDB: `smart-cooking-data-prod` (ACTIVE)
- ✅ Cognito: `ap-southeast-1_Vnu4kcJin` (3 test users)
- ✅ Lambda: 12 functions deployed
- ✅ API Gateway: https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/
- ✅ Bedrock AI: Claude 3 Haiku available
- ✅ Database: Seeded 508 Vietnamese ingredients

### 2. Docker Configuration (100%)
- ✅ `frontend/Dockerfile` - Multi-stage build cho Next.js
- ✅ `frontend/.dockerignore` - Optimize build size
- ✅ Local test successful: `http://localhost:3000`

### 3. Deployment Scripts (100%)
- ✅ `scripts/deploy-app-runner.ps1` - Local Docker build + ECR push
- ✅ `scripts/deploy-codebuild.ps1` - Cloud-based build
- ✅ `scripts/create-app-runner-service.ps1` - Service provisioning
- ✅ `buildspec-docker.yml` - CodeBuild config

### 4. AI Enhancements (100%)
- ✅ Enhanced Bedrock prompt với fuzzy ingredient matching
- ✅ Support input without diacritics (ca ro → cá rô)
- ✅ Dynamic cuisine based on user country

---

## ❌ Vấn đề chưa giải quyết

### 1. Frontend Issues (CRITICAL)

#### A. Ingredient Validation Bug
**Problem**: Nút "Tìm công thức với AI" không hoạt động  
**Root Cause**: 
- Real-time validation set status = 'invalid'
- Button disabled khi status !== 'valid'
- Code mới đã commit nhưng Docker container chưa rebuild đúng

**Attempted Fixes**:
- ❌ Disabled `enableRealTimeValidation={false}` 
- ❌ Set all status to 'pending'
- ⚠️ Docker build cache issue - code mới chưa được deploy

**Files Modified**:
- `frontend/components/ingredients/IngredientBatchValidator.tsx`
- `frontend/app/ingredients/page.tsx`

#### B. Other Tab Errors
**Problem**: Nhiều lỗi khi vào các tab khác (chưa kiểm tra chi tiết)  
**Status**: Chưa investigate

### 2. Backend Lambda Issues

#### TypeScript Build Failed
**Problem**: Lambda ai-suggestion không build được  
**Error**: 
```
lambda/shared/performance-metrics.ts: error TS1005: ';' expected
```

**Affected Files**:
- `lambda/ai-suggestion/bedrock-client.ts` - Enhanced prompt ✅
- `lambda/ai-suggestion/index.ts` - Skip validation ✅
- `lambda/ai-suggestion/tsconfig.json` - Fixed rootDir ✅
- ⚠️ Build failed, chưa deploy lên AWS

### 3. Deployment Not Complete

**AWS App Runner**: Chưa deploy  
**Reason**: Chưa chạy deployment script

---

## 🔧 Cần làm tiếp

### Priority 1: Fix Frontend (URGENT)

1. **Rebuild Docker image đúng cách**
   ```powershell
   cd frontend
   docker rm -f smart-cooking-test
   docker build --no-cache -t smart-cooking-nextjs .
   docker run -d -p 3000:3000 --name smart-cooking-test `
     -e NEXT_PUBLIC_API_URL=https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/ `
     smart-cooking-nextjs
   ```

2. **Test ingredient submit button**
   - Input: ca ro, hanh la, rau mui
   - Verify: Button "Tìm công thức với AI" clickable
   - Expected: Navigate to AI suggestions page

3. **Investigate other tab errors**
   - Check: Dashboard, Profile, Recipes, etc.
   - Fix errors one by one

### Priority 2: Fix Backend Lambda

1. **Fix TypeScript errors**
   ```bash
   cd lambda/shared
   # Fix performance-metrics.ts syntax errors
   ```

2. **Build và deploy Lambda**
   ```bash
   cd lambda/ai-suggestion
   npm run build
   # Deploy qua CDK hoặc SAM
   ```

### Priority 3: Deploy to AWS App Runner

**Option A: Local Build + Push**
```powershell
.\scripts\deploy-app-runner.ps1 `
  -Region ap-southeast-1 `
  -ServiceName smart-cooking-prod
```

**Option B: Cloud Build (CodeBuild)**
```powershell
.\scripts\deploy-codebuild.ps1 `
  -Region ap-southeast-1 `
  -ProjectName smart-cooking-docker-build
```

---

## 📊 Timeline

| Date | Activity | Status |
|------|----------|--------|
| Oct 6 | Amplify attempts #1-14 | ❌ All 404 |
| Oct 6 | Docker setup | ✅ Complete |
| Oct 6 | AI prompt enhancement | ✅ Complete |
| Oct 7 | Database seed 508 ingredients | ✅ Complete |
| Oct 7 | Frontend validation fix | 🟡 Code committed, Docker not rebuilt |
| Oct 7 | Backend Lambda fix | ❌ Build failed |
| Pending | Docker rebuild | TODO |
| Pending | Test all features | TODO |
| Pending | Deploy App Runner | TODO |

---

## 🐛 Known Issues Log

### Issue #1: Amplify 404 (ABANDONED)
- **Attempts**: 14 deployments
- **Status**: All builds SUCCEED, all serve 404
- **Root Cause**: Amplify WEB/WEB_COMPUTE không support Next.js 15 App Router với dynamic routes
- **Decision**: Chuyển sang App Runner

### Issue #2: Ingredient Button Disabled
- **Status**: 🟡 In Progress
- **Commits**: e5160fb, 81eb668
- **Problem**: Docker container running old code
- **Next**: Rebuild without cache

### Issue #3: Lambda Build Failed
- **Status**: ❌ Blocked
- **Error**: TypeScript syntax error in shared/performance-metrics.ts
- **Impact**: Cannot deploy enhanced AI prompt
- **Workaround**: AI prompt hiện tại vẫn hoạt động (đã deploy trước đó)

---

## 💾 Commits History (Recent)

```
81eb668 - fix: Disable real-time validation to enable submit button
e5160fb - feat: AI-first ingredient flow - skip validation
bd7d82c - test: Add AI fuzzy matching test script
4a08d9e - feat: Enhance AI prompt for flexible ingredient matching
96123a4 - feat: Add Docker and AWS App Runner deployment configuration
```

---

## 📝 Notes

### Why Abandon Amplify?
1. 14 deployments all resulted in 404
2. Next.js 15 App Router incompatible with Amplify WEB platform
3. WEB_COMPUTE requires deploy-manifest.json (adapter incompatible)
4. Static export incompatible with dynamic routes + client components

### Why App Runner?
1. Full Docker control
2. Works with any Node.js app
3. Auto-scaling
4. Simpler than ECS/EKS
5. Built-in load balancing

### Docker Strategy
- Multi-stage build: deps → builder → runner
- Standalone output mode
- Alpine Linux base (minimal size)
- Port 3000 exposed

---

## 🎯 Success Criteria

- [ ] Frontend deployed on App Runner
- [ ] All tabs working without errors
- [ ] Ingredient submit button works
- [ ] AI suggestion returns recipes
- [ ] Users can input without diacritics
- [ ] Database has 508 ingredients
- [ ] Backend Lambda deployed with enhanced prompt

---

## 📞 Contacts & Resources

**API Endpoint**: https://h5qdriw2jh.execute-api.ap-southeast-1.amazonaws.com/prod/  
**Cognito Pool**: ap-southeast-1_Vnu4kcJin  
**Region**: ap-southeast-1  
**Docker Image**: smart-cooking-nextjs:latest  

**Test Users**:
- testuser1@example.com / Test123!@#
- testuser2@example.com / Test123!@#
- testuser3@example.com / Test123!@#

---

## 🔄 Next Actions

1. **IMMEDIATE**: Rebuild Docker container với code mới
2. **SHORT TERM**: Fix remaining frontend errors
3. **SHORT TERM**: Deploy Lambda với enhanced prompt
4. **MEDIUM TERM**: Deploy to AWS App Runner production
5. **LONG TERM**: Custom domain + SSL certificate

---

**Last Updated**: October 7, 2025  
**Updated By**: GitHub Copilot  
**Next Review**: After Docker rebuild
