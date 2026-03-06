'use strict';

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../../db/database');
const { decrypt } = require('../crypto/cryptoService');

const isMockMode = () => process.env.SAP_MOCK_MODE === 'true';

// PowerShell script — NO user-controlled data is interpolated into the body.
// All runtime values are passed as named PowerShell parameters via spawn()
// arguments, which the OS delivers directly to PowerShell without shell
// parsing, eliminating script injection risk.
const PS_SCRIPT = [
  'param(',
  '  [string]$ComputerName,',
  '  [string]$WinRmUser,',
  '  [string]$WinRmPassword,',
  '  [int]$Port,',
  '  [bool]$UseSSL,',
  '  [string]$BrtoolsPath,',
  '  [string]$Tablespace,',
  '  [int]$SizeMb',
  ')',
  "$ErrorActionPreference = 'Stop'",
  '$secPass = ConvertTo-SecureString $WinRmPassword -AsPlainText -Force',
  '$credential = New-Object System.Management.Automation.PSCredential($WinRmUser, $secPass)',
  '$sessionOpts = New-PSSessionOption -SkipCACheck -SkipCNCheck',
  '$result = Invoke-Command `',
  '  -ComputerName $ComputerName `',
  '  -Port $Port `',
  '  -Credential $credential `',
  '  -UseSSL:$UseSSL `',
  '  -SessionOption $sessionOpts `',
  '  -ScriptBlock {',
  '    param($brtoolsExe, $ts, $mb)',
  '    & $brtoolsExe -f tsextend -t $ts -s $mb 2>&1',
  '  } -ArgumentList $BrtoolsPath, $Tablespace, $SizeMb',
  '$result',
].join('\r\n');

/**
 * Runs brtools via PowerShell Invoke-Command (WinRM) on the remote SAP host.
 *
 * @param {number} instanceId
 * @param {string} tablespace  e.g. 'PSAPSR3' — must match /^[A-Z0-9_]{1,30}$/
 * @param {number} sizeGb      e.g. 5
 * @returns {Promise<string>} brtools console output
 */
async function runBrtools(instanceId, tablespace, sizeGb) {
  if (isMockMode()) {
    return generateMockOutput(tablespace, sizeGb);
  }

  // CRIT-2 fix: await both DB queries
  const instance = await db('sap_instances').where({ id: instanceId }).first();
  if (!instance) throw Object.assign(new Error(`Instance ${instanceId} not found`), { status: 404 });

  const cred = await db('instance_credentials').where({ instance_id: instanceId }).first();
  if (!cred) throw new Error(`No credentials for instance ${instanceId}`);
  if (!cred.winrm_user || !cred.encrypted_winrm_password) {
    throw new Error('WinRM credentials not configured for this instance');
  }

  // Use per-password iv/authTag (winrm_iv / winrm_auth_tag)
  const winrmPassword = decrypt({
    iv: cred.winrm_iv,
    authTag: cred.winrm_auth_tag,
    encrypted: cred.encrypted_winrm_password,
  });

  const port = cred.winrm_port || 5985;
  const useSSL = cred.winrm_use_ssl === 1;
  const brtoolsPath = instance.brtools_path || 'brtools';
  const sizeMb = Math.round(sizeGb * 1024);

  const scriptPath = path.join(os.tmpdir(), `brtools_${uuidv4()}.ps1`);
  fs.writeFileSync(scriptPath, PS_SCRIPT, { encoding: 'utf8' });

  try {
    return await runPsScript(scriptPath, {
      ComputerName: instance.hostname,
      WinRmUser: cred.winrm_user,
      WinRmPassword: winrmPassword,
      Port: String(port),
      UseSSL: useSSL ? 'true' : 'false',
      BrtoolsPath: brtoolsPath,
      Tablespace: tablespace,
      SizeMb: String(sizeMb),
    });
  } finally {
    try { fs.unlinkSync(scriptPath); } catch (_) { /* best-effort cleanup */ }
  }
}

/**
 * Executes a .ps1 file with named parameters as separate OS arguments.
 * spawn() never invokes a shell, so values cannot be interpreted as code.
 */
function runPsScript(scriptPath, params) {
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
  for (const [key, value] of Object.entries(params)) {
    args.push(`-${key}`, value);
  }

  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', args);
    const stdout = [];
    const stderr = [];
    ps.stdout.on('data', (d) => stdout.push(d.toString()));
    ps.stderr.on('data', (d) => stderr.push(d.toString()));
    ps.on('close', (code) => {
      const out = stdout.join('').trim();
      const err = stderr.join('').trim();
      const combined = [out, err].filter(Boolean).join('\n');
      if (code === 0) resolve(combined);
      else reject(new Error(`PowerShell exited ${code}: ${combined}`));
    });
    ps.on('error', reject);
  });
}

function generateMockOutput(tablespace, sizeGb) {
  const sizeMb = Math.round(sizeGb * 1024);
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const suffix = Date.now().toString().slice(-4);
  return [
    `BR0801I BRTOOLS 7.40 (40)`,
    `BR0805I Start of BRTOOLS processing: befuuzlf.tse ${ts}`,
    `BR0484I BRTOOLS log file: C:\\oracle\\${tablespace}\\sapcheck\\befuuzlf.tse`,
    ``,
    `BR0280I BRTOOLS time stamp: ${ts}`,
    `BR0370I Drive C:\\ - free: 12345 MB, needed: ${sizeMb} MB`,
    `BR0374I Extending tablespace ${tablespace} by ${sizeMb} MB`,
    `BR0376I Adding datafile: C:\\oracle\\${tablespace}\\sapdata1\\${tablespace}.data${suffix}`,
    ``,
    `BR0280I BRTOOLS time stamp: ${ts}`,
    `BR0332I Tablespace ${tablespace} extended successfully by ${sizeMb} MB`,
    `BR0806I End of BRTOOLS processing: befuuzlf.tse ${ts}`,
    `BR0804I BRTOOLS terminated successfully with return code 0`,
  ].join('\n');
}

module.exports = { runBrtools };
