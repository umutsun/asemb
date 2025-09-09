#!/bin/bash
# ASEMB Quick Deploy Script for n8n.luwi.dev

echo "🚀 ASEMB n8n.luwi.dev Deployment Script"
echo "======================================="

# Configuration
SERVER="n8n.luwi.dev"
SERVER_USER="your-username"  # Update this
NODE_DIR="/home/node/.n8n/nodes"
DEPLOY_NAME="n8n-nodes-alice-semantic-bridge"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Build
echo -e "${YELLOW}Step 1: Building project...${NC}"
npm run build:prod
if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed! Exiting...${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build successful${NC}"

# Step 2: Create deployment package
echo -e "${YELLOW}Step 2: Creating deployment package...${NC}"
mkdir -p deploy-temp
cp -r dist deploy-temp/
cp package.json deploy-temp/
cp README.md deploy-temp/
tar -czf ${DEPLOY_NAME}.tar.gz -C deploy-temp .
rm -rf deploy-temp
echo -e "${GREEN}✓ Package created: ${DEPLOY_NAME}.tar.gz${NC}"

# Step 3: Upload to server
echo -e "${YELLOW}Step 3: Uploading to ${SERVER}...${NC}"
scp ${DEPLOY_NAME}.tar.gz ${SERVER_USER}@${SERVER}:/tmp/
if [ $? -ne 0 ]; then
    echo -e "${RED}Upload failed! Check your SSH connection.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Upload successful${NC}"

# Step 4: Install on server
echo -e "${YELLOW}Step 4: Installing on server...${NC}"
ssh ${SERVER_USER}@${SERVER} << 'ENDSSH'
    # Check if n8n is running in Docker or PM2
    if docker ps | grep -q n8n; then
        echo "Installing in Docker container..."
        CONTAINER=$(docker ps --format "{{.Names}}" | grep n8n | head -1)
        docker cp /tmp/${DEPLOY_NAME}.tar.gz ${CONTAINER}:/tmp/
        docker exec ${CONTAINER} bash -c "
            cd ${NODE_DIR} &&
            mkdir -p ${DEPLOY_NAME} &&
            cd ${DEPLOY_NAME} &&
            tar -xzf /tmp/${DEPLOY_NAME}.tar.gz &&
            npm install --production &&
            echo '✓ Node installed successfully'
        "
        docker restart ${CONTAINER}
    else
        echo "Installing in local n8n..."
        cd ${NODE_DIR}
        mkdir -p ${DEPLOY_NAME}
        cd ${DEPLOY_NAME}
        tar -xzf /tmp/${DEPLOY_NAME}.tar.gz
        npm install --production
        
        # Restart n8n
        if command -v pm2 &> /dev/null; then
            pm2 restart n8n
        else
            systemctl restart n8n
        fi
    fi
    
    # Cleanup
    rm -f /tmp/${DEPLOY_NAME}.tar.gz
ENDSSH

echo -e "${GREEN}✓ Installation complete${NC}"

# Step 5: Verify
echo -e "${YELLOW}Step 5: Verifying installation...${NC}"
echo "Please check:"
echo "1. Open https://n8n.luwi.dev"
echo "2. Search for 'Alice' in nodes panel"
echo "3. Test with example workflow"

# Cleanup local
rm -f ${DEPLOY_NAME}.tar.gz

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
