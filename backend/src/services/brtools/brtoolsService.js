'use strict';

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../../db/database');
const { decrypt } = require('../crypto/cryptoService');

const isMockMode = () => process.env.SAP_MOCK_MODE === 'true';

/**
 * Runs brtools via PowerShell Invoke-Command (WinRM) on the remote SAP Windows host.
 * Credentials are passed via a temp script file — never in process arguments.
 *
 * @param {number} instanceId
 * @param {string} tablespace  e.g. 'PSAPSR3'
 * @param {number} sizeGb      e.g. 5
 * @returns {Promise<string>} brtools console output
 */
async function runBrtools(instanceId, tablespace, sizeGb) {
  if (isMockMode()) {
    return generateMockOutput(tablespace, sizeGb);
  }

  const instance = db('sap_instances').where({ id: instanceId }).first();
  if (!instance) throw Object.assign(new Error(`Instance ${instanceId} not found`), { status: 404 });

  const cred = db('instance_credentials').where({ instance_id: instanceId }).first();
  if (!cred) throw new Error(`No credentials for instance ${instanceId}`);
  if (!cred.winrm_user || !cred.encrypted_winrm_password) {
    throw new Error('WinRM credentials not configured for this instance');
  }

  const winrmPassword = decrypt({
    iv: cred.iv,
    authTag: cred.auth_tag,
    encrypted: cred.encrypted_winrm_password,
  });

  const port = cred.winrm_port || 5985;
  const useSSL = cred.winrm_use_ssl === 1;
  const brtoolsPath = instance.brtools_path || 'brtools';
  const sizeMb = Math.round(sizeGb * 1024);

  // Write a temp script — credentials never appear in process args
  const scriptId = uuidv4();
  const scriptPath = path.join(os.tmpdir(), `brtools_${scriptId}.ps1`);

  const psScript = `
$ErrorActionPreference = 'Stop'
$secPass = ConvertTo-SecureString "${winrmPassword.replace(/"/g, '`"')}" -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential("${cred.winrm_user}", $secPass)
$sessionOpts = New-PSSessionOption -SkipCACheck -SkipCNCheck
$result = Invoke-Command \\
  -ComputerName "${instance.hostname}" \\
  -Port ${port} \\
  -Credential $credential \\
  -UseSSL:$${useSSL ? 'true' : 'false'} \\
  -SessionOption $sessionOpts \\
  -ScriptBlock {
    param($brtoolsExe, $ts, $mb)
    & $brtoolsExe -f tsextend -t $ts -s $mb 2>&1
  } -ArgumentList "${brtoolsPath}", "${tablespace}", ${sizeMb}
$result
`.trim();

  try {
    fs.writeFileSync(scriptPath, psScript, { encoding: 'utf8', mode: 0o600 });
    const output = await runPsScript(scriptPath);
    return output;
  } finally {
    try { fs.unlinkSync(scriptPath); } catch (_) { /* best-effort cleanup */ }
  }
}

function runPsScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
    ]);

    const stdout = [];
    const stderr = [];
    ps.stdout.on('data', (d) => stdout.push(d.toString()));
    ps.stderr.on('data', (d) => stderr.push(d.toString()));

    ps.on('close', (code) => {
      const out = stdout.join('').trim();
      const err = stderr.join('').trim();
      const combined = [out, err].filter(Boolean).join('\n');
      if (code === 0) {
        resolve(combined);
      } else {
        reject(new Error(`PowerShell exited ${code}: ${combined}`));
      }
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
