#!/bin/bash
# Alice Semantic Bridge - Project Cleanup Script
# This script removes temporary files and organizes the project structure

echo "🧹 Alice Semantic Bridge - Project Cleanup"
echo "========================================="

# Create backup directory
BACKUP_DIR=".backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR/configs"
mkdir -p "$BACKUP_DIR/scripts"
mkdir -p "$BACKUP_DIR/docs"

# Function to safely remove files
safe_remove() {
    local pattern=$1
    local desc=$2
    echo "Removing $desc..."
    for file in $pattern; do
        if [ -f "$file" ]; then
            mv "$file" "$BACKUP_DIR/" 2>/dev/null && echo "  ✓ Moved $file to backup"
        fi
    done
}

# Function to consolidate files
consolidate() {
    local pattern=$1
    local target=$2
    local desc=$3
    echo "Consolidating $desc..."
    for file in $pattern; do
        if [ -f "$file" ]; then
            mv "$file" "$BACKUP_DIR/$target/" 2>/dev/null && echo "  ✓ Moved $file to backup"
        fi
    done
}

echo ""
echo "📁 Creating backup at: $BACKUP_DIR"
echo ""

# Remove temporary test files
safe_remove "test-*.bat" "test batch files"
safe_remove "test-*.js" "test JavaScript files"
safe_remove "test-*.mjs" "test module files"
safe_remove "test-*.sh" "test shell scripts"

# Remove fix scripts
safe_remove "fix-*.bat" "fix batch files"
safe_remove "fix-*.js" "fix JavaScript files"

# Remove duplicate claude desktop configs
safe_remove "claude_desktop_step*.json" "claude desktop step configs"
safe_remove "claude_desktop_minimal.json" "claude desktop minimal config"
safe_remove "claude_desktop_fixed.json" "claude desktop fixed configs"
safe_remove "claude_desktop_working.json" "claude desktop working config"

# Consolidate setup scripts
consolidate "setup-*.bat" "scripts" "setup scripts"
consolidate "quick-*.bat" "scripts" "quick scripts"
consolidate "restart-*.bat" "scripts" "restart scripts"
consolidate "install-*.bat" "scripts" "install scripts"

# Consolidate migration scripts
consolidate "migrate-*.js" "scripts" "migration scripts"

# Consolidate MCP configs
consolidate "*-mcp-server.js" "configs" "MCP server configs"
consolidate "*-cli-config.json" "configs" "CLI configs"

# Consolidate documentation
consolidate "*_MCP_*.md" "docs" "MCP documentation"
consolidate "AGENT_*.md" "docs" "Agent documentation"
consolidate "PHASE*.md" "docs" "Phase documentation"
consolidate "*_STATUS.md" "docs" "Status documentation"

# Remove other temporary files
safe_remove "*.zip" "zip archives"
safe_remove "check-*.js" "check scripts"
safe_remove "sync-*.bat" "sync scripts"
safe_remove "update-*.bat" "update scripts"

# Clean up .env variants (keeping only .env and .env.example)
if [ -f ".env.luwi" ] || [ -f ".env.asemb" ] || [ -f ".env.production" ]; then
    echo "Backing up environment variants..."
    mv .env.luwi "$BACKUP_DIR/configs/" 2>/dev/null
    mv .env.asemb "$BACKUP_DIR/configs/" 2>/dev/null
    mv .env.production "$BACKUP_DIR/configs/" 2>/dev/null
fi

# Create organized structure
echo ""
echo "📂 Creating organized structure..."
mkdir -p scripts/setup 2>/dev/null
mkdir -p scripts/deploy 2>/dev/null
mkdir -p scripts/utils 2>/dev/null
mkdir -p docs/archive 2>/dev/null

# Create consolidated files
echo ""
echo "📝 Creating consolidated documentation..."

# Create main setup script
cat > scripts/setup.sh << 'EOF'
#!/bin/bash
# Alice Semantic Bridge - Main Setup Script

echo "🚀 Alice Semantic Bridge Setup"
echo "=============================="

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Setup database
echo "🗄️ Setting up database..."
node scripts/setup-db.js

# Initialize Redis
echo "🔴 Initializing Redis..."
node scripts/init-shared-memory.js

# Run migrations
echo "🔄 Running migrations..."
node scripts/migrate.js

echo "✅ Setup complete!"
EOF

chmod +x scripts/setup.sh

# Create .gitignore if not exists or update it
echo ""
echo "📝 Updating .gitignore..."
cat >> .gitignore << 'EOF'

# Temporary files
test-*.bat
test-*.js
test-*.mjs
test-*.sh
fix-*.bat
fix-*.js
setup-*.bat
check-*.js
migrate-*.js
*-mcp-server.js
*-cli-config.json

# Backup directories
.backup-*

# Environment files (except .env.example)
.env.*
!.env.example
!.env.test

# IDE directories
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Logs and temp files
*.log
*.tmp
.migration-progress.json
.full-migration-progress.json

# Build outputs
dist/
build/
coverage/

# Dependencies
node_modules/
venv/
EOF

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📊 Summary:"
echo "  - Backup created at: $BACKUP_DIR"
echo "  - Temporary files moved to backup"
echo "  - Documentation consolidated"
echo "  - Project structure organized"
echo ""
echo "💡 Next steps:"
echo "  1. Review files in $BACKUP_DIR"
echo "  2. Delete backup after confirming nothing important was removed"
echo "  3. Run 'git status' to see changes"
echo "  4. Commit the cleaned project structure"
