FROM node:22-alpine@sha256:ab07539e0988b63558ff621f5fbe1077054c39d9809112974fb79993949d41cd

WORKDIR /app

# 国内阿里云主机走官方 dl-cdn 路由不稳，且 apk 无读超时，一次断连会永久挂起构建。
# 换阿里云镜像源，并加超时，保证下载失败能快速重试而非死等。
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache --timeout 30 font-noto-cjk

COPY package*.json ./
# npm 同样走国内镜像。lockfile 里 resolved 指向 registry.npmjs.org，
# --replace-registry-host=npmjs（npm>=9.5 的默认值，显式写出防止默认变动）会把 tarball 地址改写到镜像源。
RUN npm ci --omit=dev --registry=https://registry.npmmirror.com --replace-registry-host=npmjs

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
