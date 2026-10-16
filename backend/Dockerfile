# 备选部署方式。Render 直接用 Node runtime 就行，这个文件是给
# Fly.io / 自己的服务器 / 云托管平台用的。
FROM node:24-alpine

WORKDIR /app

# 先只拷依赖清单，这样改业务代码不会让依赖层缓存失效
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# 只有 package-lock.json 存在时 npm ci 才可用；
# 如果你删了 lock 文件，把上面那行换成 npm install --omit=dev
CMD ["npm", "start"]
