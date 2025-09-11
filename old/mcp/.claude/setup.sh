#!/bin/bash
# Claude Code Sandbox Initialization Script

echo "🎨 Claude Code Frontend Sandbox Setup"
echo "====================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if frontend directory exists
if [ ! -d "./frontend" ]; then
    echo -e "${BLUE}Creating frontend directory...${NC}"
    mkdir -p ./frontend
fi

# Initialize Next.js project if not exists
if [ ! -f "./frontend/package.json" ]; then
    echo -e "${YELLOW}Initializing Next.js project...${NC}"
    cd frontend
    npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
    cd ..
else
    echo -e "${GREEN}✓ Next.js project already initialized${NC}"
fi

# Install additional dependencies
echo -e "${BLUE}Installing additional dependencies...${NC}"
cd frontend
npm install @radix-ui/react-accordion @radix-ui/react-alert-dialog \
  @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-label @radix-ui/react-select \
  @radix-ui/react-slot @radix-ui/react-tabs \
  @radix-ui/react-toast @radix-ui/react-tooltip \
  class-variance-authority clsx tailwind-merge \
  lucide-react recharts @tanstack/react-query \
  zustand socket.io-client framer-motion

# Install dev dependencies
npm install -D @types/node @types/react @types/react-dom \
  eslint-config-next prettier prettier-plugin-tailwindcss

# Setup shadcn/ui
echo -e "${BLUE}Setting up shadcn/ui...${NC}"
npx shadcn-ui@latest init -y

# Create directory structure
echo -e "${BLUE}Creating directory structure...${NC}"
mkdir -p src/{components,hooks,utils,lib,styles,app}
mkdir -p src/components/{ui,dashboard,common}

# Create basic configuration files
echo -e "${BLUE}Creating configuration files...${NC}"

# Tailwind config for dark mode
cat > tailwind.config.ts << 'EOF'
import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
EOF

cd ..

echo -e "${GREEN}✅ Claude Code Sandbox Setup Complete!${NC}"
echo ""
echo "To start development:"
echo "  1. Open VS Code: code .claude/claude.code-workspace"
echo "  2. Run: cd frontend && npm run dev"
echo "  3. Or use Docker: docker-compose -f docker-compose.sandbox.yml up claude-sandbox"
echo ""
echo "Happy coding! 🚀"
