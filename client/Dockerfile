FROM node:24
WORKDIR /app
COPY package*.json ./
RUN npm install -g npm@latest
COPY . .
EXPOSE 3000
CMD ["npm", "start"]