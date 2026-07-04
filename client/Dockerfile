# Multi-stage build for optimized production image.
# --platform=$BUILDPLATFORM: the Vite build output (dist/) is architecture-
# independent static files, so the builder always runs natively on the build
# host instead of under QEMU emulation — only the nginx runtime stage below is
# built per target architecture (amd64/arm64).
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (devDependencies included — Vite is needed for the build)
RUN npm ci --no-audit --no-fund

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_OPENWEATHER_API_KEY
ARG VITE_REACT_APP_API_URL
ARG VITE_APP_VERSION=dev
ARG VITE_GIT_COMMIT=
ARG VITE_GITHUB_REPOSITORY=jherforth/HomeGlow
ARG BACKEND_PORT=5000
ARG FRONTEND_PORT=3000

# Set environment variables for build
ENV VITE_OPENWEATHER_API_KEY=$VITE_OPENWEATHER_API_KEY
ENV VITE_REACT_APP_API_URL=$VITE_REACT_APP_API_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_GIT_COMMIT=$VITE_GIT_COMMIT
ENV VITE_GITHUB_REPOSITORY=$VITE_GITHUB_REPOSITORY

# Build the application
RUN npm run build

# Production stage with Nginx
FROM nginx:alpine

# Accept build arguments for dynamic configuration
ARG FRONTEND_PORT=3000
ARG BACKEND_SERVICE=homeglow-backend
ARG BACKEND_PORT=5000

# Set as environment variables for runtime
ENV FRONTEND_PORT=$FRONTEND_PORT
ENV BACKEND_SERVICE=$BACKEND_SERVICE
ENV BACKEND_PORT=$BACKEND_PORT

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration template
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Create entrypoint script to substitute variables at runtime
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'set -e' >> /docker-entrypoint.sh && \
    echo 'echo "Configuring Nginx with:"' >> /docker-entrypoint.sh && \
    echo 'echo "  FRONTEND_PORT=${FRONTEND_PORT}"' >> /docker-entrypoint.sh && \
    echo 'echo "  BACKEND_SERVICE=${BACKEND_SERVICE}"' >> /docker-entrypoint.sh && \
    echo 'echo "  BACKEND_PORT=${BACKEND_PORT}"' >> /docker-entrypoint.sh && \
    echo 'envsubst "\$FRONTEND_PORT \$BACKEND_SERVICE \$BACKEND_PORT" < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo 'echo "Generated nginx config:"' >> /docker-entrypoint.sh && \
    echo 'cat /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo 'echo "Testing nginx configuration..."' >> /docker-entrypoint.sh && \
    echo 'nginx -t' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

EXPOSE ${FRONTEND_PORT}

ENTRYPOINT ["/docker-entrypoint.sh"]
