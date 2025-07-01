FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install -g npm@latest
COPY . .
RUN mkdir -p /app/uploads/users
EXPOSE 5000
CMD ["node", "index.js"]