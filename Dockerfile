FROM node:22-alpine

# Better-sqlite3 needs build tools on Alpine
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Ensure DB is persistent (handled by docker-compose volume)
EXPOSE 4001

CMD ["node", "server.js"]
