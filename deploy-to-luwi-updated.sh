#!/bin/bash
# Deploy ASB to luwi.dev Server
# Server: 91.99.229.96
# n8n: https://n8n.luwi.dev

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Deploying ASB to luwi.dev server...${NC}"

# Configuration
SERVER_IP="91.99.229.96"
SERVER_USER="root"
REMOTE_PATH="/opt/alice-semantic-bridge"
LOCAL_BUILD_DIR="./dist"

# Step 1: Build the project locally
echo -e "${BLUE}📦 Building project...${NC}"
npm install
npm run build

# Step 2: Prepare deployment package
echo -e "${BLUE}📋 Preparing deployment package...${NC}"
rm -rf deploy-package
mkdir -p deploy-package

# Copy necessary files
cp -r dist deploy-package/
cp -r api deploy-package/
cp -r dashboard deploy-package/
cp -r scripts deploy-package/
cp package.json deploy-package/
cp package-lock.json deploy-package/
cp .env.luwi deploy-package/.env
cp docker-compose.luwi.yml deploy-package/docker-compose.yml

# Step 3: Create remote setup script
cat > deploy-package/setup-remote.sh << 'EOF'
#!/bin/bash
set -e

echo "Setting up ASB on remote server..."

# Install dependencies if needed
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install Redis if not present
if ! command -v redis-cli &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y redis-server
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
fi

# Create necessary directories
mkdir -p /opt/alice-semantic-bridge/{logs,backups,data}

# Install Node.js dependencies
cd /opt/alice-semantic-bridge
npm install --production

# Setup PostgreSQL database (if not exists)
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -tc "SELECT 1 FROM pg_database WHERE datname = 'asemb'" | grep -q 1 || \
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -c "CREATE DATABASE asemb;"

# Enable pgvector extension
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d asemb -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run database migrations
if [ -f scripts/init-db.sql ]; then
    PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d asemb < scripts/init-db.sql
fi

# Setup systemd service for API
sudo tee /etc/systemd/system/asb-api.service > /dev/null << 'SERVICE'
[Unit]
Description=Alice Semantic Bridge API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/alice-semantic-bridge/api
Environment="NODE_ENV=production"
EnvironmentFile=/opt/alice-semantic-bridge/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=append:/opt/alice-semantic-bridge/logs/api.log
StandardError=append:/opt/alice-semantic-bridge/logs/api-error.log

[Install]
WantedBy=multi-user.target
SERVICE

# Reload systemd and start service
sudo systemctl daemon-reload
sudo systemctl enable asb-api
sudo systemctl restart asb-api

echo "ASB setup completed on remote server!"
EOF

chmod +x deploy-package/setup-remote.sh

# Step 4: Create docker-compose for luwi server
cat > deploy-package/docker-compose.yml << 'EOF'
version: '3.8'

services:
  # API Service (connects to existing PostgreSQL)
  api:
    build: ./api
    container_name: asb-api
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      POSTGRES_HOST: 91.99.229.96
      REDIS_HOST: redis
    env_file:
      - .env
    ports:
      - "3000:3000"
    volumes:
      - ./logs:/app/logs
      - ./workspaces:/workspaces
    depends_on:
      - redis
    networks:
      - asb-network

  # Local Redis for caching
  redis:
    image: redis:7-alpine
    container_name: asb-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - asb-network

  # Dashboard (Nginx)
  dashboard:
    image: nginx:alpine
    container_name: asb-dashboard
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./dashboard:/usr/share/nginx/html
      - ./nginx/dashboard.conf:/etc/nginx/conf.d/default.conf
    networks:
      - asb-network

volumes:
  redis_data:
    driver: local

networks:
  asb-network:
    driver: bridge
EOF

# Step 5: Create n8n node installation script
cat > deploy-package/install-n8n-node.sh << 'EOF'
#!/bin/bash
set -e

echo "Installing ASB node in n8n..."

# Find n8n custom nodes directory
N8N_CUSTOM_DIR="/root/.n8n/nodes"
if [ -d "/home/node/.n8n/nodes" ]; then
    N8N_CUSTOM_DIR="/home/node/.n8n/nodes"
fi

# Create custom nodes directory if not exists
mkdir -p "$N8N_CUSTOM_DIR"

# Copy the built node
cp -r /opt/alice-semantic-bridge/dist/* "$N8N_CUSTOM_DIR/"

echo "ASB node installed. Please restart n8n to load the new node."
EOF

chmod +x deploy-package/install-n8n-node.sh

# Step 6: Create Nginx config for dashboard
mkdir -p deploy-package/nginx
cat > deploy-package/nginx/dashboard.conf << 'EOF'
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Step 7: Update dashboard configuration for remote server
sed -i "s|http://localhost:3000|http://${SERVER_IP}:3000|g" deploy-package/dashboard/dashboard.js

# Step 8: Create deployment archive
echo -e "${BLUE}📦 Creating deployment archive...${NC}"
tar -czf asb-deploy.tar.gz -C deploy-package .

# Step 9: Transfer to server
echo -e "${BLUE}📤 Transferring to server...${NC}"
scp asb-deploy.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/

# Step 10: Execute deployment on server
echo -e "${BLUE}🔧 Executing deployment on server...${NC}"
ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
set -e

# Create directory and extract
mkdir -p /opt/alice-semantic-bridge
cd /opt/alice-semantic-bridge
tar -xzf /tmp/asb-deploy.tar.gz

# Load environment variables
set -a
source .env
set +a

# Run setup script
./setup-remote.sh

# Install n8n node
./install-n8n-node.sh

# Start services with docker-compose (optional)
# docker-compose up -d

# Or use systemd service (already started by setup script)

# Check service status
systemctl status asb-api

echo "Deployment completed!"
ENDSSH

# Step 11: Cleanup
rm -rf deploy-package asb-deploy.tar.gz

echo -e "${GREEN}✅ Deployment to luwi.dev completed!${NC}"
echo -e "${BLUE}📋 Access Information:${NC}"
echo -e "  API: http://${SERVER_IP}:3000"
echo -e "  Dashboard: http://${SERVER_IP}:8080"
echo -e "  n8n: https://n8n.luwi.dev"
echo
echo -e "${YELLOW}⚠️  Next Steps:${NC}"
echo -e "  1. Update .env.luwi with your actual credentials"
echo -e "  2. Restart n8n to load the ASB node"
echo -e "  3. Configure firewall to allow ports 3000 and 8080"
echo -e "  4. Set up SSL certificates for production use"