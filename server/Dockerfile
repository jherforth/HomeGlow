FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p /app/uploads/users
EXPOSE 5000
CMD ["node", "index.js"]