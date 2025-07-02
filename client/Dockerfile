# File: client/Dockerfile
FROM node:24 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install -g npm@latest
RUN npm install --production=false
COPY . .
RUN npm run build

FROM node:24-alpine AS production
WORKDIR /app
COPY --from=build /app/public/dist ./dist
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]