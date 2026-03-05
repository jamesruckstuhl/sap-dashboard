# Security Policy

## Credential Storage

All SAP credentials and WinRM/OS credentials are encrypted at rest using **AES-256-GCM** before being stored in the SQLite database. The master encryption key lives exclusively in the `.env` file, which is listed in `.gitignore` and must never be committed.

### Key Management
- Generate a strong random key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Store only in `.env` on the server
- Rotate quarterly by re-encrypting all stored credentials
- Back up `.env` separately from the database

### What is Encrypted
| Field | Location | Method |
|---|---|---|
| SAP password | `instance_credentials.encrypted_sap_password` | AES-256-GCM |
| WinRM password | `instance_credentials.encrypted_winrm_password` | AES-256-GCM |
| SMTP password | `instance_email_config.encrypted_smtp_password` | AES-256-GCM |
| Dashboard passwords | `dashboard_users.password_hash` | bcryptjs (12 rounds) |

## Authentication

- Dashboard access requires a JWT token (8-hour expiry)
- Login endpoint is rate-limited to 5 attempts per 15 minutes per IP
- Default admin password (`Admin123!`) **must** be changed on first login in production

## Transport Security

- Backend API runs on HTTP by default for local/intranet use
- For production, place behind a reverse proxy (IIS, nginx) with TLS/HTTPS
- WinRM connections to SAP hosts can use HTTPS (port 5986) — configure `winrm_use_ssl=true` per instance

## Network Exposure

This application is designed for **internal network use only**. Do not expose the API or frontend directly to the public internet.

## WinRM Security

- WinRM credentials are stored encrypted in the database
- Use dedicated service accounts with minimal permissions for WinRM access
- Enable HTTPS for WinRM (`winrm set winrm/config/listener?Address=*+Transport=HTTPS`) in production
- Restrict WinRM access to only the dashboard server IP via Windows Firewall

## SAP RFC Security

- Use a dedicated RFC-only SAP user (role: `S_RFC` with minimal authorizations)
- Do not use SAP DDIC, SAP* or basis admin accounts for RFC connections
- Required SAP authorizations: `S_RFC`, `S_BTCH_ADM`, `S_ENQUEUE`, `S_UPDATE`

## Reporting a Vulnerability

Do not open a public GitHub issue for security vulnerabilities. Contact the system owner directly with:
1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if known)

## Dependency Updates

Run `npm audit` regularly and update dependencies promptly when security fixes are released:
```bash
cd backend && npm audit
cd frontend && npm audit
```
