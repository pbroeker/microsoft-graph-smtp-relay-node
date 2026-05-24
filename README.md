# Microsoft Graph SMTP Relay (Node.js)

An SMTP server that accepts mail from your ERP Next Application and delivers it through the [Microsoft Graph API](https://learn.microsoft.com/en-us/graph/api/user-sendmail). Clients talk SMTP; outbound mail uses an Azure app registration and Graph.

This is a TypeScript port of the [Python version](https://github.com/ggpwnkthx/microsoft-graph-smtp-relay), with changes aimed at [ERPNext](https://erpnext.com/) and similar stacks that expect a local SMTP relay instead of direct Graph integration. Changes inckude possible usage of TLS and adding of test coverage.

## Why use this relay?

- **SMTP-only apps** — Configure ERPNext, cron jobs, or legacy software with a normal SMTP host/port; no Graph SDK in the app.
- **Microsoft 365 sending** — Mail is sent as the authenticated mailbox via Graph, using app credentials you control in Azure.
- **Network control** — Restrict who may connect with `ALLOWED_IPS` (CIDR list).
- **Hooks** — Optional JavaScript middleware in `MIDDLEWARE_DIR` for `before_auth` / `after_auth` and message handling events.

## Plain vs TLS mode

The relay supports two listening profiles, selected with **`SMTP_AUTH_METHOD`**:

| Mode | `SMTP_AUTH_METHOD` | Default port | TLS on the wire | Required TLS env vars |
|------|-------------------|--------------|-----------------|------------------------|
| **Plain** | `plain` (default) | `25` | No server TLS; STARTTLS is not advertised | — |
| **TLS** | `tls` | `587` | Server presents a certificate; clients should use TLS (e.g. SMTPS / port 587) | `TLS_KEY_PATH`, `TLS_CERT_PATH` |

Any value other than `tls` (including unset or empty) is treated as **plain**.

Override the listen port anytime with **`SMTP_RELAY_PORT`** (for example, plain on `2525` behind a reverse proxy, or TLS on `465`).

### Plain mode (default)

Typical for Docker on port 25 or a trusted internal network. SMTP clients connect without TLS to the relay; the relay still uses HTTPS to Microsoft Graph.

```env
SMTP_AUTH_METHOD=plain
SMTP_RELAY_HOSTNAME=0.0.0.0
SMTP_RELAY_PORT=25
```

Startup requires `CLIENT_ID` and `CLIENT_SECRET` (and `TENANT_ID` for token acquisition). TLS certificate paths are not required.

### TLS mode

Use when clients must connect over TLS (common for ERPNext “Use TLS” / port 587 setups). Point the relay at a key and certificate file on disk (self-signed for lab, or CA-issued for production).

```env
SMTP_AUTH_METHOD=tls
SMTP_RELAY_HOSTNAME=0.0.0.0
SMTP_RELAY_PORT=587
TLS_KEY_PATH=/path/to/key.pem
TLS_CERT_PATH=/path/to/cert.pem
```

Startup also requires `TLS_KEY_PATH` and `TLS_CERT_PATH` to be set and readable. Generate test certs for local development, for example:

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

Clients should use `secure: true` (or equivalent) and may need to trust your CA or disable certificate verification in dev only.

### Switching modes

1. Set `SMTP_AUTH_METHOD` to `plain` or `tls`.
2. Adjust `SMTP_RELAY_PORT` if you are not using the defaults (`25` / `587`).
3. For TLS mode, set `TLS_KEY_PATH` and `TLS_CERT_PATH`.
4. Update your SMTP client (host, port, “Use TLS”, credentials) to match.
5. Restart the relay.

Example **ERPNext** (illustrative): internal relay hostname, port `587`, enable TLS, and the same `SMTP_AUTH_USER` / `SMTP_AUTH_PASS` as in `.env`.

| Variable | Description |
|----------|-------------|
| `TENANT_ID` | Azure AD tenant ID |
| `CLIENT_ID` | App registration (client) ID |
| `CLIENT_SECRET` | App registration client secret |
| `SMTP_AUTH_METHOD` | `plain` or `tls` (see above) |
| `SMTP_RELAY_HOSTNAME` | Bind address (default `0.0.0.0`) |
| `SMTP_RELAY_PORT` | Listen port (defaults by mode if unset) |
| `SMTP_AUTH_USER` / `SMTP_AUTH_PASS` | SMTP AUTH credentials clients must send |
| `TLS_KEY_PATH` / `TLS_CERT_PATH` | PEM key and cert (required in TLS mode) |
| `ALLOWED_IPS` | Comma-separated CIDRs; empty = allow all |
| `SAVE_TO_SENT` | Save sent items via Graph (default `false`) |
| `SOFT_DELETE` | Soft-delete behavior for Graph operations |
| `ALLOW_SEND_INCOMPLETE` | Allow sending with incomplete message data |
| `MIDDLEWARE_DIR` | Directory of optional middleware modules |
| `LOG_LEVEL` | Pino log level (e.g. `info`, `debug`) |

Azure app registration needs appropriate **Microsoft Graph** application permissions (e.g. `Mail.Send`) and admin consent; the sent-from address must be a mailbox your app is allowed to use.

## Quick start

```bash
cp .env.sample .env
# Edit .env: Azure credentials, SMTP_AUTH_METHOD, auth user/pass, TLS paths if needed
npm install
npm run build
npm start
```

## Docker

**Plain mode** (port 25):

```bash
docker build -t microsoft-graph-smtp-relay-node .
docker run -d --name smtp-relay-node \
  -p 25:25 \
  --env-file .env \
  microsoft-graph-smtp-relay-node
```

**TLS mode** — mount certificates and expose 587:

```bash
docker run -d --name smtp-relay-node \
  -p 587:587 \
  -v /path/to/certs:/certs:ro \
  -e SMTP_AUTH_METHOD=tls \
  -e TLS_KEY_PATH=/certs/key.pem \
  -e TLS_CERT_PATH=/certs/cert.pem \
  --env-file .env \
  microsoft-graph-smtp-relay-node
```

See `examples/docker-compose.yaml` for a compose skeleton.

## Development

```bash
npm run dev
```

## Test

```bash
npm test
```

Send a manual test message (uses settings from `.env` / environment):

```bash
npm run test:client
```
