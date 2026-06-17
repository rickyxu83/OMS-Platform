FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache font-noto-cjk

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
