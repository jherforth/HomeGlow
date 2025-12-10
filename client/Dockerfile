# File: client/Dockerfile
FROM node:24 AS build
WORKDIR /app
COPY package*.json ./
RUN npm install -g npm@latest
RUN npm install --production=false

# Add build arguments for environment variables
ARG VITE_OPENWEATHER_API_KEY
ENV VITE_OPENWEATHER_API_KEY=$VITE_OPENWEATHER_API_KEY

ARG VITE_REACT_APP_API_URL
ENV VITE_REACT_APP_API_URL=$VITE_REACT_APP_API_URL

COPY . .
RUN npm run build

FROM node:24-alpine AS production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY serve.json .
RUN npm install -g serve
EXPOSE 3001
CMD ["serve", "--cors", "-s", "dist", "-l", "3000"]
