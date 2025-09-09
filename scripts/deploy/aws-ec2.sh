#!/bin/bash

# AWS EC2 Deployment Script
# Usage: ./aws-ec2.sh [staging|production]

set -e

ENVIRONMENT=${1:-production}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups"

echo "🚀 Starting deployment to AWS EC2 ($ENVIRONMENT)"

# Load environment variables
if [ "$ENVIRONMENT" = "production" ]; then
    source .env.production
    EC2_HOST=$AWS_EC2_HOST
    EC2_USER=$AWS_EC2_USER
else
    source .env.staging
    EC2_HOST=$AWS_EC2_STAGING_HOST
    EC2_USER=$AWS_EC2_STAGING_USER
fi

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf asb-deploy-$TIMESTAMP.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=*.log \
    --exclude=uploads \
    --exclude=backups \
    .

# Transfer files to EC2
echo "📤 Transferring files to EC2..."
scp -i ~/.ssh/aws-ec2.pem asb-deploy-$TIMESTAMP.tar.gz $EC2_USER@$EC2_HOST:/tmp/

# Deploy on EC2
echo "🔧 Deploying on EC2..."
ssh -i ~/.ssh/aws-ec2.pem $EC2_USER@$EC2_HOST << 'ENDSSH'
    # Stop existing services
    cd /opt/alice-semantic-bridge
    docker-compose -f docker-compose.prod.yml down
    
    # Backup current deployment
    sudo mkdir -p $BACKUP_DIR
    sudo tar -czf $BACKUP_DIR/backup-$TIMESTAMP.tar.gz .
    
    # Extract new deployment
    tar -xzf /tmp/asb-deploy-$TIMESTAMP.tar.gz
    
    # Update environment file
    cp .env.$ENVIRONMENT .env
    
    # Pull latest Docker images
    docker-compose -f docker-compose.prod.yml pull
    
    # Run database migrations
    docker-compose -f docker-compose.prod.yml run --rm app npm run migrate
    
    # Start services
    docker-compose -f docker-compose.prod.yml up -d
    
    # Health check
    sleep 30
    curl -f http://localhost:3001/api/health || exit 1
    
    # Clean up
    rm /tmp/asb-deploy-$TIMESTAMP.tar.gz
    docker system prune -f
    
    echo "✅ Deployment successful!"
ENDSSH

# Clean up local files
rm asb-deploy-$TIMESTAMP.tar.gz

echo "🎉 Deployment to AWS EC2 completed successfully!"