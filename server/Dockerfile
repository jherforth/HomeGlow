FROM node:24
WORKDIR /app
COPY package*.json ./
RUN npm install -g npm@latest
RUN npm install
COPY . .
RUN mkdir -p /app/uploads/users
EXPOSE 5000
CMD ["node", "index.js"]