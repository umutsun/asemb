#!/bin/bash

# Railway Deployment Script
# Usage: ./railway.sh [staging|production]

set -e

ENVIRONMENT=${1:-staging}

echo "🚂 Starting deployment to Railway ($ENVIRONMENT)"

# Install Railway CLI if not present
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Load environment variables
if [ "$ENVIRONMENT" = "production" ]; then
    source .env.production
    PROJECT_ID=$RAILWAY_PROJECT_ID
    ENV_ID=$RAILWAY_PRODUCTION_ENV_ID
else
    source .env.staging
    PROJECT_ID=$RAILWAY_PROJECT_ID
    ENV_ID=$RAILWAY_STAGING_ENV_ID
fi

# Login to Railway
echo "🔐 Logging in to Railway..."
railway login --browserless

# Link project
railway link $PROJECT_ID

# Set environment
railway environment $ENV_ID

# Deploy backend
echo "🚀 Deploying backend to Railway..."
railway up --detach

# Deploy n8n nodes
echo "📦 Building n8n nodes..."
npm run build
railway run npm run deploy:n8n

# Run migrations
echo "🗄️ Running database migrations..."
railway run npm run migrate

# Health check
echo "🏥 Running health check..."
sleep 60
DEPLOYMENT_URL=$(railway status --json | jq -r '.deployment.url')
curl -f https://$DEPLOYMENT_URL/api/health || exit 1

echo "✅ Railway deployment successful!"
echo "🌐 Deployment URL: https://$DEPLOYMENT_URL"

# Deploy frontend to Vercel (if production)
if [ "$ENVIRONMENT" = "production" ]; then
    echo "🎨 Deploying frontend to Vercel..."
    cd dashboard
    vercel --prod --token=$VERCEL_TOKEN
    cd ..
fi

echo "🎉 Deployment completed successfully!"