# Claude Code Frontend Development Sandbox
FROM node:18-alpine

# Set working directory
WORKDIR /workspace

# Install essential tools
RUN apk add --no-cache \
    git \
    curl \
    bash \
    openssh-client

# Install global npm packages
RUN npm install -g \
    typescript \
    @types/node \
    @types/react \
    create-next-app \
    vercel \
    pnpm

# Create sandbox user (non-root)
RUN addgroup -g 1001 -S claude && \
    adduser -u 1001 -S claude -G claude

# Set up workspace directories
RUN mkdir -p /workspace/frontend /workspace/.claude/logs /workspace/shared && \
    chown -R claude:claude /workspace

# Copy sandbox configuration
COPY .claude/sandbox-config.json /workspace/.claude/

# Environment variables
ENV NODE_ENV=development \
    SANDBOX_MODE=true \
    AGENT_NAME=claude \
    AGENT_ROLE=frontend \
    NEXT_TELEMETRY_DISABLED=1

# Switch to sandbox user
USER claude

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD node -e "console.log('Claude sandbox healthy')" || exit 1

# Default command
CMD ["bash"]
