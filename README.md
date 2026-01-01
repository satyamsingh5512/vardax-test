# Firewall Gate

Minimal firewall test page UI for Vercel deployment.

## API Contract

The frontend expects `POST /api/firewall-check` with:

```json
// Request body
{ "path": "/", "clientHint": "test" }

// Allowed response (HTTP 200)
{ "allowed": true, "message": "Access granted", "redirect": "/app" }

// Blocked response (HTTP 200)
{ "allowed": false, "message": "Blocked by firewall: reason" }
```

## Development

```bash
npm install
npm run dev
```

The included mock API randomly allows/blocks requests for testing. Replace `app/api/firewall-check/route.ts` with your actual implementation.
# vardax-test
