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

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration template
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Replace placeholders with actual values
RUN sed -i "s|REPLACE_FRONTEND_PORT|${FRONTEND_PORT}|g" /etc/nginx/conf.d/default.conf.template && \
    sed -i "s|REPLACE_BACKEND_SERVICE|${BACKEND_SERVICE}:${BACKEND_PORT}|g" /etc/nginx/conf.d/default.conf.template && \
    mv /etc/nginx/conf.d/default.conf.template /etc/nginx/conf.d/default.conf

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${FRONTEND_PORT}/ || exit 1

EXPOSE ${FRONTEND_PORT}

CMD ["nginx", "-g", "daemon off;"]
