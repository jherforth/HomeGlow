# ---- Builder: install production dependencies ----
# The C++ toolchain lives only in this stage. better-sqlite3 ships prebuilt
# binaries for linux amd64/arm64 (glibc), so `npm ci` normally downloads a
# binary and compiles nothing; the toolchain is the automatic fallback for
# platforms without a prebuild.
FROM node:24-slim AS builder
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- Runtime ----
FROM node:24-slim
WORKDIR /app

# tzdata: chore scheduling depends on the TZ env var. Node's bundled ICU covers
# JS Date/Intl on its own, but the OS zoneinfo db is ~3MB of insurance for
# anything else that reads /usr/share/zoneinfo.
RUN apt-get update && \
    apt-get install -y --no-install-recommends tzdata && \
    rm -rf /var/lib/apt/lists/*

# Accept PORT and TZ as build arguments with defaults
ARG PORT=5000
ARG TZ=America/New_York
ARG BACKEND_VERSION=dev
ARG BACKEND_GIT_COMMIT=
ARG BACKEND_GITHUB_REPOSITORY=jherforth/HomeGlow

# Set as environment variables for runtime
ENV NODE_ENV=production
ENV PORT=$PORT
ENV TZ=$TZ
ENV APP_VERSION=$BACKEND_VERSION
ENV BACKEND_VERSION=$BACKEND_VERSION
ENV BACKEND_GIT_COMMIT=$BACKEND_GIT_COMMIT
ENV BACKEND_GITHUB_REPOSITORY=$BACKEND_GITHUB_REPOSITORY

COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/uploads/users /app/widgets && chmod -R 777 /app/uploads /app/widgets

# Expose the port
EXPOSE ${PORT}

CMD ["node", "index.js"]
