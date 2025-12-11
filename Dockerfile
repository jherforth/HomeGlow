# Multi-stage build for HomeGlow application
FROM node:24 AS client-build

# Build the client
WORKDIR /client
COPY client/package*.json ./
RUN npm install -g npm@latest
RUN npm install --production=false

# Build arguments for client environment variables
ARG VITE_OPENWEATHER_API_KEY
ARG VITE_REACT_APP_API_URL=/api
ENV VITE_OPENWEATHER_API_KEY=$VITE_OPENWEATHER_API_KEY
ENV VITE_REACT_APP_API_URL=$VITE_REACT_APP_API_URL

COPY client/ ./
RUN npm run build

# Production stage
FROM node:24

# Install SQLite3 dependencies
RUN apt-get update && apt-get install -y libsqlite3-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server files
COPY server/package*.json ./
RUN npm install -g npm@latest
RUN npm install --production || { echo 'npm install failed'; exit 1; }

# Install serve to host the client static files
RUN npm install -g serve

COPY server/ ./

# Copy built client files
COPY --from=client-build /client/dist ./client/dist

# Create necessary directories with proper permissions
RUN mkdir -p /app/data /app/uploads/users /app/widgets && \
    chmod -R 777 /app/data /app/uploads /app/widgets

# Environment variables
ENV NODE_ENV=production
ARG PORT=5000
ENV PORT=$PORT
ARG CLIENT_PORT=3000
ENV CLIENT_PORT=$CLIENT_PORT

EXPOSE ${PORT} ${CLIENT_PORT}

# Create startup script to run both client and server
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'serve -s /app/client/dist -l ${CLIENT_PORT} &' >> /app/start.sh && \
    echo 'node index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

CMD ["/app/start.sh"]
