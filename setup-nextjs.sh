# Next.js Project Setup Script
# Run this to create proper Next.js structure

echo "🚀 Setting up Alice Semantic Bridge as Next.js 14 project..."

# Create Next.js app structure
mkdir -p app/api/search
mkdir -p app/api/embed
mkdir -p app/api/lightrag
mkdir -p app/api/monitoring
mkdir -p app/(tabs)/rag-query
mkdir -p app/(tabs)/knowledge-graph
mkdir -p app/(tabs)/entities
mkdir -p app/(tabs)/monitoring
mkdir -p components/rag
mkdir -p components/graph
mkdir -p components/entities
mkdir -p components/monitoring
mkdir -p lib
mkdir -p styles
mkdir -p public
mkdir -p tests/unit
mkdir -p tests/integration
mkdir -p tests/e2e

echo "✅ Folder structure created"

# Initialize package.json if not exists
if [ ! -f package.json ]; then
  npm init -y
  npm install next@14 react react-dom typescript @types/react @types/node
  npm install -D tailwindcss postcss autoprefixer @types/react-dom
  npm install lucide-react zustand @tanstack/react-query axios socket.io-client
  npm install react-flow-renderer d3 three @react-three/fiber framer-motion
  npx tailwindcss init -p
fi

echo "✅ Dependencies installed"

# Notify agents
asb-cli redis publish --channel asb:broadcast --value "Next.js project structure ready! Check PROJECT_INSTRUCTIONS.md"

echo "📝 Instructions available at:"
echo "- File: PROJECT_INSTRUCTIONS.md"
echo "- Redis: asb-cli redis get --key asb:project:instructions"
echo ""
echo "🎯 Agents can now start working on their assigned folders!"
