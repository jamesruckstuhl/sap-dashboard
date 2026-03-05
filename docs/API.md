# API Reference

Base URL: `http://localhost:3001/api`

All endpoints except `/auth/login` require `Authorization: Bearer <token>` header.

---

## Authentication

### POST /auth/login
```json
// Request
{ "username": "admin", "password": "Admin123!" }

// Response 200
{ "token": "eyJ...", "user": { "id": 1, "username": "admin", "role": "admin" } }

// Response 401
{ "error": "Invalid credentials" }
```

### GET /auth/me
```json
// Response 200
{ "id": 1, "username": "admin", "role": "admin" }
```

---

## SAP Instances

### GET /instances
```json
// Response 200
[{
  "id": 1, "name": "PRD", "hostname": "sap-prd-01",
  "sysnr": "00", "client": "100", "sid": "PRD",
  "description": "Production", "brtools_path": "C:\\...\\brtools.exe",
  "created_at": "2025-03-01T10:00:00Z"
}]
```

### POST /instances
```json
// Request
{
  "name": "PRD", "hostname": "sap-prd-01", "sysnr": "00",
  "client": "100", "sid": "PRD", "description": "Production",
  "brtools_path": "C:\\...\\brtools.exe",
  "sap_user": "RFC_USER", "sap_password": "secret",
  "winrm_user": "DOMAIN\\svcacct", "winrm_password": "secret",
  "winrm_port": 5985, "winrm_use_ssl": false
}
// Response 201: { "id": 1, ...instance fields (no passwords) }
```

### GET /instances/:id
```json
// Response 200: instance object (no passwords)
```

### PUT /instances/:id
Same body as POST, all fields optional.

### DELETE /instances/:id
```json
// Response 204 No Content
```

### POST /instances/:id/test-connection
```json
// Response 200
{ "success": true, "message": "Connected to PRD (100) successfully" }
// Response 200 (failure)
{ "success": false, "message": "Connection refused: check hostname and sysnr" }
```

---

## Tablespace (ST04-style)

### GET /tablespace/:instanceId
```json
// Response 200
[{
  "tablespace": "PSAPSR3", "type": "PERMANENT",
  "total_mb": 20480, "used_mb": 17408, "free_mb": 3072,
  "used_pct": 85.0, "status": "ONLINE"
}]
```

### POST /tablespace/:instanceId/brtools
```json
// Request
{ "tablespace": "PSAPSR3", "size_gb": 5 }

// Response 200
{ "output": "BRTOOLS V7.40...\nExtending tablespace PSAPSR3 by 5120 MB...\nSuccessfully extended." }
```

---

## Background Jobs (SM37-style)

### GET /jobs/:instanceId
Query params: `dateFrom` (YYYYMMDD), `dateTo` (YYYYMMDD), `status` (default: ABRT), `jobname`
```json
// Response 200
[{
  "jobname": "RSUSR006", "jobcount": "12345678",
  "status": "ABRT", "sdlstrtdt": "20250301", "sdlstrttm": "020000",
  "enddate": "20250301", "endtime": "020153",
  "username": "BATCHUSR", "duration": 113
}]
```

### POST /jobs/:instanceId/rerun
```json
// Request
{ "jobname": "RSUSR006", "jobcount": "12345678" }
// Response 200
{ "success": true, "new_jobcount": "12345999" }
```

### GET /jobs/:instanceId/log
Query: `jobname`, `jobcount`
```json
// Response 200
{ "log": "Job started...\nStep 1 complete...\nError: ..." }
```

---

## Enqueue Locks (SM12-style)

### GET /locks/:instanceId
```json
// Response 200
[{
  "object": "ENNLFN", "name1": "000CLIENT000", "name2": "",
  "guname": "USER1", "logname": "USER1",
  "repid": "SAPMV45A", "mode": "E",
  "time": "143022", "date": "20250304"
}]
```

### DELETE /locks/:instanceId
```json
// Request
{ "locks": [{ "object": "ENNLFN", "name1": "000CLIENT000", "name2": "", "guname": "USER1" }] }
// Response 200
{ "deleted": 1, "failed": 0 }
```

---

## Failed Updates (SM14-style)

### GET /updates/:instanceId
```json
// Response 200
[{
  "vbkey": "A1B2C3D4E5F6", "tcode": "VA01",
  "uname": "SALESUSR", "mandt": "100",
  "vbdate": "20250304", "vbtime": "091234",
  "errmess": "ABAP runtime error: GETWA_NOT_ASSIGNED"
}]
```

### DELETE /updates/:instanceId
```json
// Request
{ "vbkeys": ["A1B2C3D4E5F6", "B2C3D4E5F6A1"] }
// Response 200
{ "deleted": 2, "failed": 0 }
```

---

## Settings

### GET /settings/:instanceId/email
```json
// Response 200
{
  "smtp_host": "mail.company.com", "smtp_port": 587,
  "smtp_user": "alerts@company.com", "from_address": "sap-alerts@company.com",
  "alert_emails": ["admin@company.com", "basis@company.com"],
  "report_time": "06:00", "report_enabled": true,
  "tablespace_pct_threshold": 85, "tablespace_mb_threshold": 500
}
```

### PUT /settings/:instanceId/email
Same structure as GET response, plus optional `smtp_password` to update it.
```json
// Response 200: updated config (no smtp_password)
```
