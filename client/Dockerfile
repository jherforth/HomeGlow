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

# Set environment variables for build
ENV VITE_OPENWEATHER_API_KEY=$VITE_OPENWEATHER_API_KEY
ENV VITE_REACT_APP_API_URL=$VITE_REACT_APP_API_URL

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
