# File: client/Dockerfile
FROM node:24 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install -g npm@latest
RUN npm install --production=false
COPY . .
# --- ADDED DIAGNOSTIC LINES BELOW ---
RUN ls -F /app/ # List contents of /app to see if .env is there
RUN cat /app/.env || echo ".env not found or empty" # Print .env content, or a message if not found
# --- END DIAGNOSTIC LINES ---
RUN npm run build

FROM node:24-alpine AS production
WORKDIR /app
COPY --from=build /app/public/dist ./dist
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
