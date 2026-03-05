# Setup Guide

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | v20+ | Install from nodejs.org |
| Git | Any | For source control |
| SAP NW RFC SDK | 7.50+ | From SAP Support Portal (S-user required) |
| SAP System | Any basis | RFC-capable (SM59) |

## 1. SAP NW RFC SDK

The SDK must be installed and its `lib` directory must be in the system PATH before installing `node-rfc`.

**Windows:**
1. Download `NWRFC_*.zip` from [SAP Support Portal](https://support.sap.com) → Software Downloads
2. Extract to `C:\nwrfcsdk\`
3. Add `C:\nwrfcsdk\lib` to your system PATH environment variable
4. Verify: `dir C:\nwrfcsdk\lib\sapnwrfc.dll` should show the file

On this server the SDK is already at `C:\nwrfcsdk` and `C:\nwrfcsdk\lib` is in the system PATH.

## 2. Clone and Install

```bash
git clone https://github.com/jamesruckstuhl/sap-dashboard.git
cd sap-dashboard
```

### Backend
```bash
cd backend
npm install
```

If `node-rfc` install fails (SDK not found), ensure `C:\nwrfcsdk\lib` is in PATH, then retry.

### Frontend
```bash
cd ../frontend
npm install
```

## 3. Configure Environment

```bash
cd backend
copy .env.example .env
```

Edit `.env`:

```env
NODE_ENV=development
PORT=3001
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-64-character-hex-key-here
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your-long-jwt-secret-here
JWT_EXPIRES_IN=8h
DB_PATH=./data/sap-dashboard.sqlite
# Set to false when connecting to real SAP systems
SAP_MOCK_MODE=true
CORS_ORIGIN=http://localhost:5173
```

## 4. Initialize Database

```bash
cd backend
npm run migrate
```

This creates the SQLite database at the `DB_PATH` location and seeds a default admin user:
- Username: `admin`
- Password: `Admin123!`

**Change this password immediately after first login.**

## 5. Enable WinRM on SAP Hosts

For each SAP Windows host where brtools will be run, execute on that host (as Administrator):

```powershell
# Enable WinRM with default settings
winrm quickconfig -y

# For HTTPS (recommended for production):
# Create self-signed cert and configure HTTPS listener
$cert = New-SelfSignedCertificate -DnsName "your-sap-hostname" -CertStoreLocation Cert:\LocalMachine\My
winrm create winrm/config/Listener?Address=*+Transport=HTTPS "@{Hostname=`"your-sap-hostname`";CertificateThumbprint=`"$($cert.Thumbprint)`"}"

# Open firewall
netsh advfirewall firewall add rule name="WinRM-HTTP" dir=in localport=5985 protocol=TCP action=allow
# For HTTPS:
netsh advfirewall firewall add rule name="WinRM-HTTPS" dir=in localport=5986 protocol=TCP action=allow
```

## 6. SAP User Setup

Create a dedicated RFC user in each SAP system (via SU01):

| Field | Value |
|---|---|
| User type | System |
| Required roles | `S_RFC_ALL` or custom role with RFC authorization |
| Required auth | `S_BTCH_ADM`, `S_ENQUEUE`, `S_UPDATE_ALL` |

The user should have **no dialog logon rights** (type = System).

## 7. Start the Application

### Development
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

Open: http://localhost:5173

### Production (Windows Service)
Use `pm2` or NSSM to run the backend as a Windows service:
```bash
npm install -g pm2
cd backend && pm2 start src/server.js --name sap-dashboard
pm2 startup
pm2 save
```

For the frontend, build and serve via IIS or any static file server:
```bash
cd frontend && npm run build
# Serve the dist/ folder
```

## 8. Add a SAP Instance

1. Log in to the dashboard at http://localhost:5173
2. Click **Manage Instances** → **Add Instance**
3. Fill in:
   - Name, Hostname, SID, System Number, Client
   - SAP Username + Password
   - WinRM Username + Password + Port (5985 default)
   - brtools path (e.g., `C:\usr\sap\SID\SYS\exe\uc\NTAMD64\brtools.exe`)
4. Click **Test Connection** to verify SAP RFC connectivity
5. Configure email alerts and daily report settings under **Settings**

## 9. Running Tests

```bash
cd backend
npm test
```

For E2E tests (requires both servers running):
```bash
# From repo root
npm run test:e2e
```
