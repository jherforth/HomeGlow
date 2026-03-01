FROM node:24
WORKDIR /app

# Accept PORT and TZ as build arguments with defaults
ARG PORT=5000
ARG TZ=America/New_York

# Set as environment variables for runtime
ENV PORT=$PORT
ENV TZ=$TZ

# Install SQLite3 dependencies with GPG error handling
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get update --allow-insecure-repositories || apt-get update && \
    apt-get install -y --allow-unauthenticated libsqlite3-dev python3 make g++

COPY package*.json ./
RUN npm install -g npm@latest
RUN npm install || { echo 'npm install failed'; exit 1; }
RUN npm rebuild better-sqlite3 --build-from-source

COPY . .
RUN mkdir -p /app/uploads/users /app/widgets && chmod -R 777 /app/uploads /app/widgets

# Expose the port
EXPOSE ${PORT}

CMD ["node", "index.js"]
