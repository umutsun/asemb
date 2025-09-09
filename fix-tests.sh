#!/bin/bash
# Fix all test mocks for ASB project

echo "🔧 Fixing PostgreSQL mocks..."
find test -name "*.test.ts" -exec sed -i "s/jest.mock('pg'/jest.mock('pg', () => require('.\/mocks\/pg')/g" {} \;

echo "🔧 Installing ioredis-mock..."
npm install --save-dev ioredis-mock

echo "🔧 Creating mock directory..."
mkdir -p test/mocks

# Create pg mock
cat > test/mocks/pg.js << 'EOF'
module.exports = {
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn()
    }),
    end: jest.fn().mockResolvedValue(undefined)
  }))
};
EOF

# Create redis mock
cat > test/mocks/redis.js << 'EOF'
const Redis = require('ioredis-mock');
module.exports = Redis;
EOF

echo "✅ Test mocks fixed!"
echo "🧪 Running tests..."
npm test
