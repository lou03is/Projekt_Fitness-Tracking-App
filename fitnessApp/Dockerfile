FROM node:16

RUN apt-get update && apt-get install -y redis-tools

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

COPY public/ public/

EXPOSE 3000

CMD ["node", "server.js"]
