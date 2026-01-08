# Connector Agent Backend

Local development server for Connector Agent email find & verify.

## Quick Start

```bash
cd connector-agent-backend
npm install
npm start
```

Server runs on `http://localhost:8000`

## Endpoints

### API Key Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/keys/generate` | Generate new API key (one per user) |
| GET | `/api/keys/active` | Get active key metadata |
| DELETE | `/api/keys/:id` | Revoke API key |

### Email Operations

| Method | Path | Tokens | Description |
|--------|------|--------|-------------|
| GET | `/api/email/v2/quota` | - | Check token usage |
| POST | `/api/email/v2/find` | 5 | Find email by name + domain |
| POST | `/api/email/v2/verify` | 2 | Verify single email |
| POST | `/api/email/v2/find-bulk` | 5/row | Bulk find emails |
| POST | `/api/email/v2/verify-bulk` | 2/row | Bulk verify emails |

## Headers

All requests must include:

```
x-user-id: <user_id>
x-user-email: <user_email>
Authorization: Bearer <api_key>  (for email operations)
```

## Quota

- 20,000 tokens per user per month
- Resets monthly
- Cached results don't cost tokens

## Database

SQLite database stored in `./data/connector-agent.db`

## Development

```bash
npm run dev  # Watch mode with auto-restart
```
