FROM node:22-slim

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --production

COPY dist/ .

ENV SMTP_RELAY_HOSTNAME=0.0.0.0

EXPOSE 25 587

CMD ["node", "index.js"]
