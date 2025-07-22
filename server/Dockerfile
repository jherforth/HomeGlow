FROM node:24
WORKDIR /app
# Install SQLite3 dependencies
RUN apt-get update && apt-get install -y libsqlite3-dev
COPY package*.json ./
RUN npm install -g npm@latest
RUN npm install || { echo 'npm install failed'; exit 1; }
COPY . .
RUN mkdir -p /app/uploads/users /app/widgets && chmod -R 777 /app/uploads /app/widgets
EXPOSE 5000
CMD ["node", "index.js"]