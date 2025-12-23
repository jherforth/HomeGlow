# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for build)
RUN npm install

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_OPENWEATHER_API_KEY
ARG VITE_REACT_APP_API_URL
ARG BACKEND_PORT=5000
ARG FRONTEND_PORT=3000

# Set environment variables for build
ENV VITE_OPENWEATHER_API_KEY=$VITE_OPENWEATHER_API_KEY
ENV VITE_REACT_APP_API_URL=$VITE_REACT_APP_API_URL

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
ENV BACKEND_PORT=$BACKEND_PORT

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration template
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Create entrypoint script to substitute variables at runtime
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'set -e' >> /docker-entrypoint.sh && \
    echo 'echo "Configuring Nginx with FRONTEND_PORT=${FRONTEND_PORT} and BACKEND_PORT=${BACKEND_PORT}"' >> /docker-entrypoint.sh && \
    echo 'envsubst "\$FRONTEND_PORT \$BACKEND_SERVICE \$BACKEND_PORT" < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo 'cat /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

# Add healthcheck with environment variable
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD sh -c 'wget --no-verbose --tries=1 --spider http://localhost:${FRONTEND_PORT}/ || exit 1'

EXPOSE ${FRONTEND_PORT}

ENTRYPOINT ["/docker-entrypoint.sh"]
