#!/bin/bash

# DigitalOcean Droplet Deployment Script
# Usage: ./digitalocean.sh [staging|production]

set -e

ENVIRONMENT=${1:-production}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🌊 Starting deployment to DigitalOcean ($ENVIRONMENT)"

# Load environment variables
if [ "$ENVIRONMENT" = "production" ]; then
    source .env.production
    DROPLET_IP=$DO_DROPLET_IP
    DROPLET_USER=$DO_DROPLET_USER
else
    source .env.staging
    DROPLET_IP=$DO_STAGING_IP
    DROPLET_USER=$DO_STAGING_USER
fi

# Install doctl if not present
if ! command -v doctl &> /dev/null; then
    echo "📦 Installing DigitalOcean CLI..."
    wget https://github.com/digitalocean/doctl/releases/download/v1.92.0/doctl-1.92.0-linux-amd64.tar.gz
    tar xf doctl-1.92.0-linux-amd64.tar.gz
    sudo mv doctl /usr/local/bin
    rm doctl-1.92.0-linux-amd64.tar.gz
fi

# Authenticate with DigitalOcean
doctl auth init --access-token $DIGITALOCEAN_TOKEN

# Create snapshot before deployment
echo "📸 Creating droplet snapshot..."
doctl compute droplet-action snapshot $DIGITALOCEAN_DROPLET_ID \
    --snapshot-name "asb-backup-$TIMESTAMP" --wait

# Build Docker images
echo "🐳 Building Docker images..."
docker build -t asb-app:$TIMESTAMP .
docker tag asb-app:$TIMESTAMP registry.digitalocean.com/asb/app:$TIMESTAMP
docker tag asb-app:$TIMESTAMP registry.digitalocean.com/asb/app:latest

# Push to DigitalOcean Container Registry
echo "📤 Pushing to Container Registry..."
doctl registry login
docker push registry.digitalocean.com/asb/app:$TIMESTAMP
docker push registry.digitalocean.com/asb/app:latest

# Deploy to Droplet
echo "🔧 Deploying to Droplet..."
ssh $DROPLET_USER@$DROPLET_IP << ENDSSH
    # Navigate to project directory
    cd /opt/alice-semantic-bridge
    
    # Pull latest code
    git pull origin main
    
    # Update environment file
    cp .env.$ENVIRONMENT .env
    
    # Pull latest images from registry
    docker login registry.digitalocean.com
    docker pull registry.digitalocean.com/asb/app:latest
    
    # Stop existing containers
    docker-compose -f docker-compose.prod.yml down
    
    # Update docker-compose to use new image
    sed -i 's|image: .*app.*|image: registry.digitalocean.com/asb/app:latest|' docker-compose.prod.yml
    
    # Start services
    docker-compose -f docker-compose.prod.yml up -d
    
    # Run migrations
    docker-compose -f docker-compose.prod.yml exec -T app npm run migrate
    
    # Health check
    sleep 30
    curl -f http://localhost:3001/api/health || exit 1
    
    # Clean up old images
    docker image prune -f
    
    echo "✅ Deployment successful!"
ENDSSH

# Configure firewall rules
echo "🔒 Configuring firewall..."
doctl compute firewall create \
    --name asb-firewall \
    --inbound-rules "protocol:tcp,ports:80,sources:0.0.0.0/0 protocol:tcp,ports:443,sources:0.0.0.0/0 protocol:tcp,ports:22,sources:0.0.0.0/0" \
    --outbound-rules "protocol:tcp,ports:all,destinations:0.0.0.0/0 protocol:udp,ports:all,destinations:0.0.0.0/0" \
    --droplet-ids $DIGITALOCEAN_DROPLET_ID \
    || echo "Firewall already exists"

# Setup monitoring
echo "📊 Setting up monitoring..."
doctl monitoring alert create \
    --type droplet_cpu \
    --description "High CPU usage on ASB droplet" \
    --compare GreaterThan \
    --value 80 \
    --window 5m \
    --entities $DIGITALOCEAN_DROPLET_ID \
    --emails alerts@asb.example.com \
    || echo "Alert already exists"

echo "🎉 DigitalOcean deployment completed successfully!"
echo "🌐 Access your application at: http://$DROPLET_IP"