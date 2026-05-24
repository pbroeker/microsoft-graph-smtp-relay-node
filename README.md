# Microsoft Graph SMTP Relay (Node.js)

Node.js implementation of an SMTP relay that forwards emails through Microsoft Graph API.

This is a port of the [Python version](https://github.com/ggpwnkthx/microsoft-graph-smtp-relay) using TypeScript with some improvements to work with ERP Next.

## Quick Start

```bash
cp .env.sample .env
# Edit .env with your Azure credentials
npm install
npm run build
npm start
```

## Docker

```bash
docker build -t microsoft-graph-smtp-relay-node .
docker run -d --name smtp-relay-node \
  -p 25:25 \
  --env-file .env \
  microsoft-graph-smtp-relay-node
```

## Development

```bash
npm run dev
```

## Test

```bash
npm test
```
