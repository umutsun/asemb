#!/bin/bash

# Alice Semantic Bridge Deployment Script

set -e

echo "🚀 Starting deployment process..."

# Environment setup
export NODE_ENV=production

# Pull latest code
echo "📦 Pulling latest code from GitHub..."
git pull origin main

# Backend deployment
echo "🔧 Setting up backend..."
cd backend
npm ci --production
npm run build
pm2 restart asb-backend || pm2 start dist/server.js --name asb-backend

# Frontend deployment  
echo "🎨 Building frontend..."
cd ../frontend
npm ci
npm run build
pm2 restart asb-frontend || pm2 start npm --name asb-frontend -- start

# API deployment
echo "🌐 Setting up API..."
cd ../api
npm ci --production
pm2 restart asb-api || pm2 start server.js --name asb-api

# Database migrations
echo "💾 Running database migrations..."
cd ../backend
npm run migrate

# Nginx configuration
echo "🔧 Configuring Nginx..."
sudo cp ../nginx.conf /etc/nginx/sites-available/alice-semantic-bridge
sudo ln -sf /etc/nginx/sites-available/alice-semantic-bridge /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Redis check
echo "🔴 Checking Redis..."
redis-cli ping

# Health check
echo "✅ Running health checks..."
sleep 5
curl -f http://localhost:3000/health || exit 1
curl -f http://localhost:3001/api/health || exit 1

echo "✨ Deployment completed successfully!"
pm2 save
pm2 list