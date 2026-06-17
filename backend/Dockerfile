FROM node:22-alpine

WORKDIR /app

# 国内阿里云主机走官方 dl-cdn 路由不稳，且 apk 无读超时，一次断连会永久挂起构建。
# 换阿里云镜像源，并加超时，保证下载失败能快速重试而非死等。
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache --timeout 30 font-noto-cjk

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
