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
ARG BACKEND_SERVICE=homeglow-backend:${BACKEND_PORT}

# Set environment variables for build
ENV VITE_OPENWEATHER_API_KEY=$VITE_OPENWEATHER_API_KEY
ENV VITE_REACT_APP_API_URL=$VITE_REACT_APP_API_URL

# Build the application
RUN npm run build

# Production stage with Nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy unified nginx configuration (same for dev and prod!)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Accept backend service as build arg for API proxy configuration
ARG BACKEND_SERVICE=homeglow-backend:${BACKEND_PORT}

# Update nginx config with correct backend service
RUN sed -i "s|homeglow-backend:${BACKEND_PORT}|${BACKEND_SERVICE}|g" /etc/nginx/conf.d/default.conf

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${FRONTEND_PORT}/ || exit 1

EXPOSE ${FRONTEND_PORT}

CMD ["nginx", "-g", "daemon off;"]
