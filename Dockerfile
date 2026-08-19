# Dockerfile - 微信云托管部署用
# 云托管会自动识别这个文件并构建镜像，不用你手动操作
FROM node:20-alpine

WORKDIR /app

# 先拷依赖清单，利用 Docker 缓存加速构建
COPY package.json ./
RUN npm install --omit=dev

# 再拷业务代码
COPY . .

# 云托管默认把流量打到容器 80 端口，让服务监听 80
ENV PORT=80
EXPOSE 80

CMD ["node", "server.js"]
