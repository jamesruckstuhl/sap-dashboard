# SAP Monitoring Dashboard

A web-based dashboard to monitor and administer multiple SAP instances from a single interface. Replicates the look and feel of core SAP transactions: **ST04** (tablespace), **SM37** (background jobs), **SM12** (enqueue locks), and **SM14** (failed updates).

## Features

- **Multi-instance management** — add/remove SAP systems, store credentials securely
- **Tablespace monitoring (ST04-style)** — usage bars, percentage/MB thresholds, email alerts, brtools integration via WinRM
- **Background job monitoring (SM37-style)** — failed job list, date filter, view logs, rerun jobs, daily email report
- **Enqueue lock management (SM12-style)** — view and selectively delete locks
- **Failed update management (SM14-style)** — view and delete failed updates
- **Secure credential storage** — all SAP and OS credentials encrypted with AES-256-GCM at rest
- **Email alerts** — configurable per instance, supports threshold-based and scheduled reports

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3 + Knex) |
| Frontend | React 18 + Vite + Tailwind CSS |
| SAP connectivity | node-rfc (SAP NW RFC SDK) |
| OS remote execution | node-winrm (WinRM/PowerShell) |
| Email | Nodemailer |
| Scheduling | node-cron |
| Testing | Vitest + Supertest + Playwright |

## Quick Start

See [docs/SETUP.md](docs/SETUP.md) for full setup instructions.

```bash
# Clone and install
git clone https://github.com/jamesruckstuhl/sap-dashboard.git
cd sap-dashboard/backend
npm install
cp .env.example .env
# Edit .env with your ENCRYPTION_KEY and JWT_SECRET
npm run migrate
npm start

# In another terminal
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173 — default credentials: `admin` / `Admin123!`

## Security

- All SAP and WinRM credentials encrypted with AES-256-GCM before database storage
- Dashboard login uses bcryptjs (12 rounds)
- JWT authentication with 8-hour expiry
- Rate limiting on all endpoints
- See [SECURITY.md](SECURITY.md) for the full security policy

## License

Private — internal use only.
