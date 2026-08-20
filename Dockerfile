FROM node:20-alpine

WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

COPY package.json ./
RUN npm install --production

COPY . .

ENV PORT=80
EXPOSE 80

CMD ["node", "server.js"]
