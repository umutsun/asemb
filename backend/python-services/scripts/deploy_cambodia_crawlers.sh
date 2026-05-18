#!/bin/bash
# Deploy Cambodia Crawlers to ASEANlex Server
# Usage: ./deploy_cambodia_crawlers.sh

SERVER="root@91.99.229.96"
PORT="2222"
APP_DIR="/mnt/volume-nbg1-1/apps/aseanlex"
CRAWLERS_DIR="$APP_DIR/backend/python-services/crawlers"

echo "=== Deploying Cambodia Crawlers to ASEANlex ==="
echo "Server: $SERVER:$PORT"
echo "Target: $CRAWLERS_DIR"
echo ""

# List of crawler files to deploy
CRAWLERS=(
    "cambodia_crawler_base.py"
    "odc_cambodia_crawler.py"
    "cdc_cambodia_crawler.py"
    "moc_cambodia_crawler.py"
    "khmersme_cambodia_crawler.py"
    "mlvt_cambodia_crawler.py"
    "gdi_cambodia_crawler.py"
    "gdt_cambodia_crawler.py"
    "gdce_cambodia_crawler.py"
    "acar_cambodia_crawler.py"
)

# Upload each crawler file
echo "Uploading crawler files..."
for crawler in "${CRAWLERS[@]}"; do
    echo "  - Uploading $crawler..."
    scp -P $PORT "backend/python-services/crawlers/$crawler" "$SERVER:$CRAWLERS_DIR/$crawler"
    if [ $? -eq 0 ]; then
        echo "    ✓ $crawler uploaded successfully"
    else
        echo "    ✗ Failed to upload $crawler"
        exit 1
    fi
done

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "To run crawlers, execute on the server:"
echo "  cd $APP_DIR"
echo "  python3 backend/python-services/crawlers/odc_crawler.py"
echo ""
echo "Or use the API:"
echo "  curl -X POST 'http://localhost:8087/api/v2/crawler/crawler-directories/odc_cambodia_crawler/script/run'"
