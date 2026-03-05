# CLAUDE.md — SAP Monitoring Dashboard

## Project Overview
Web dashboard for monitoring and administering multiple SAP instances (Windows Server / Oracle DB). Replicates ST04, SM37, SM12, SM14 transactions. Backend: Node.js/Express/SQLite. Frontend: React/Vite/Tailwind.

## Repository Layout
```
sap-dashboard/
├── backend/          Node.js Express API (port 3001)
│   ├── src/
│   │   ├── routes/       Express routers
│   │   ├── controllers/  Request handlers
│   │   ├── services/
│   │   │   ├── sap/      node-rfc connector + mock mode
│   │   │   ├── crypto/   AES-256-GCM encrypt/decrypt
│   │   │   ├── email/    Nodemailer + HTML templates
│   │   │   ├── scheduler/ node-cron daily reports
│   │   │   └── brtools/  WinRM executor for brtools
│   │   ├── db/           Knex + SQLite setup + migrations
│   │   └── middleware/   JWT auth, rate-limit, validation
│   └── tests/            Vitest unit + integration
├── frontend/         React 18 + Vite + Tailwind (port 5173)
│   └── src/
│       ├── components/   Feature UI components
│       ├── pages/        Route pages
│       ├── hooks/        Custom React hooks
│       ├── store/        Zustand state
│       └── services/     Axios API client
└── docs/             API.md, SETUP.md
```

## Development Commands
```bash
# Backend
cd backend && npm run dev        # Start with file watch
cd backend && npm test           # Run Vitest tests
cd backend && npm run migrate    # Run DB migrations

# Frontend
cd frontend && npm run dev       # Vite dev server
cd frontend && npm run build     # Production build
cd frontend && npm test          # Run tests

# Full E2E
npm run test:e2e                 # Playwright (from root)
```

## Key Conventions
- **CommonJS** (`require/module.exports`) in backend — no ESM
- **Tailwind** utility classes in frontend — no separate CSS files
- **express-validator** on every POST/PUT route — no exceptions
- **Knex query builder** for all DB queries — never raw string SQL
- **Credentials never logged** — `console.log` on objects containing passwords is a bug
- **Credentials never returned in API responses** — strip in controller before responding

## Environment Variables (backend/.env)
| Variable | Purpose |
|---|---|
| `ENCRYPTION_KEY` | 32-char hex key for AES-256-GCM credential encryption |
| `JWT_SECRET` | Secret for JWT signing |
| `JWT_EXPIRES_IN` | Token expiry (default: 8h) |
| `DB_PATH` | SQLite file path |
| `SAP_MOCK_MODE` | `true` to use fixture data instead of live SAP RFC |
| `PORT` | API port (default: 3001) |

## SAP Mock Mode
Set `SAP_MOCK_MODE=true` in `.env` to run without a live SAP connection. All RFC calls return data from `backend/tests/fixtures/sapMockData.js`. Use this for development and testing.

## NW RFC SDK Location
The SAP NW RFC SDK is installed at `C:\nwrfcsdk`. The lib path (`C:\nwrfcsdk\lib`) is already in the system PATH. node-rfc uses this automatically.

## WinRM for brtools
brtools runs on the SAP Windows hosts via WinRM. Each SAP instance has its own WinRM credentials (stored encrypted). WinRM must be enabled on the SAP host:
```
winrm quickconfig
```
Default port: 5985 (HTTP) or 5986 (HTTPS).

## Credential Encryption
All SAP passwords and WinRM passwords are encrypted before DB storage:
```javascript
const { encrypt, decrypt } = require('./services/crypto/cryptoService');
const { iv, authTag, encrypted } = encrypt(plaintextPassword);
// Store iv, authTag, encrypted in DB
// Retrieve and decrypt:
const plain = decrypt({ iv, authTag, encrypted });
```

## Security Rules
1. Never hardcode credentials or keys
2. Never log objects that may contain passwords
3. Never return credential fields in API responses
4. Always validate input with express-validator before processing
5. Always check JWT before any authenticated route handler

## Testing
- Unit tests in `backend/tests/unit/` — test services in isolation
- Integration tests in `backend/tests/integration/` — test REST endpoints with Supertest
- SAP_MOCK_MODE=true is always used in tests
- E2E tests in `tests/e2e/` — Playwright browser tests

## Git Branching (GitFlow)
- `main` — production only, protected
- `develop` — integration, all feature PRs target here
- `feature/NAME` — cut from develop
- `hotfix/NAME` — cut from main for critical fixes
- Merge to develop first, then release/* → main

## Default Login
- Username: `admin`
- Password: `Admin123!`
- Change immediately in production.
