# Frontend - Smart Cooking

Next.js frontend application with static export and Cognito authentication.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your AWS Cognito settings:
- `NEXT_PUBLIC_AWS_REGION`: Your AWS region
- `NEXT_PUBLIC_COGNITO_USER_POOL_ID`: Your Cognito User Pool ID
- `NEXT_PUBLIC_COGNITO_CLIENT_ID`: Your Cognito App Client ID
- `NEXT_PUBLIC_API_URL`: Your API Gateway URL

## Development

Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build for Production

Build the application for static export:
```bash
npm run build
```

The static files will be generated in the `out/` directory.

## Deploy to S3

The `out/` directory can be deployed to S3 for static hosting:
```bash
aws s3 sync out/ s3://your-bucket-name --delete
```

## Features

- **Authentication**: Cognito user authentication with JWT
- **Login/Register**: User sign-up and sign-in pages with validation
- **Profile Management**: User profile with password change
- **Protected Routes**: Client-side route protection
- **Static Export**: Full static site generation for S3 hosting

## Project Structure

```
frontend/
├── app/                    # Next.js app directory
│   ├── dashboard/         # Protected dashboard page
│   ├── login/            # Login page
│   ├── profile/          # Profile management page
│   ├── register/         # Registration page
│   └── layout.tsx        # Root layout with AuthProvider
├── components/           # React components
│   └── ProtectedRoute.tsx
├── contexts/            # React contexts
│   └── AuthContext.tsx  # Authentication context
├── lib/                # Utilities
│   ├── auth.ts        # Cognito authentication service
│   └── config.ts      # App configuration
└── public/            # Static assets
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

