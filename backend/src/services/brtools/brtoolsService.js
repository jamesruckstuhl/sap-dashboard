'use strict';

const { db } = require('../../db/database');
const { decrypt } = require('../crypto/cryptoService');

const isMockMode = () => process.env.SAP_MOCK_MODE === 'true';

/**
 * Runs brtools via WinRM to extend a tablespace on a remote SAP Windows host.
 *
 * @param {number} instanceId
 * @param {string} tablespace - tablespace name (e.g. PSAPSR3)
 * @param {number} sizeGb - size to extend in GB
 * @returns {Promise<string>} command output
 */
async function runBrtools(instanceId, tablespace, sizeGb) {
  if (isMockMode()) {
    return generateMockOutput(tablespace, sizeGb);
  }

  // 1. Load instance from DB
  const instance = await db('sap_instances').where({ id: instanceId }).first();
  if (!instance) {
    throw Object.assign(new Error(`Instance ${instanceId} not found`), { status: 404 });
  }

  // 2. Load and decrypt WinRM credentials
  const cred = await db('instance_credentials').where({ instance_id: instanceId }).first();
  if (!cred) {
    throw new Error(`No credentials found for instance ${instanceId}`);
  }

  if (!cred.winrm_user || !cred.encrypted_winrm_password) {
    throw new Error('WinRM credentials not configured for this instance');
  }

  const winrmPassword = decrypt({
    iv: cred.iv,
    authTag: cred.auth_tag,
    encrypted: cred.encrypted_winrm_password,
  });

  const winrmPort = cred.winrm_port || 5985;
  const useSSL = cred.winrm_use_ssl === 1;
  const brtoolsPath = instance.brtools_path || 'brtools';

  // 3. Build the brtools command
  // brtools -f tsextend expects tablespace and size parameters
  const brtoolsCommand = `${brtoolsPath} -f tsextend -t ${tablespace} -s ${Math.round(sizeGb * 1024)}`;
  const psCommand = `Invoke-Command -ScriptBlock { ${brtoolsCommand} } 2>&1`;

  // 4. Connect via WinRM and execute
  let winrm;
  try {
    const WinRM = require('node-winrm');
    winrm = new WinRM({
      host: instance.hostname,
      port: winrmPort,
      user: cred.winrm_user,
      password: winrmPassword,
      protocol: useSSL ? 'https' : 'http',
    });

    const result = await new Promise((resolve, reject) => {
      winrm.run(psCommand, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`WinRM execution failed: ${err.message}`));
          return;
        }
        resolve({ stdout: stdout || '', stderr: stderr || '' });
      });
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    console.log(`[BRTools] Instance ${instance.name} - brtools output for ${tablespace}:\n${output}`);
    return output;
  } catch (err) {
    console.error(`[BRTools] Failed to run brtools for instance ${instance.name}:`, err.message);
    throw err;
  }
}

function generateMockOutput(tablespace, sizeGb) {
  const sizeMb = Math.round(sizeGb * 1024);
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  return [
    `BR0801I BRTOOLS 7.40 (40)`,
    `BR0805I Start of BRTOOLS processing: befuuzlf.tse ${timestamp}`,
    `BR0484I BRTOOLS log file: /oracle/${tablespace}/sapcheck/befuuzlf.tse`,
    ``,
    `BR0670I Enter 'cont[inue]' to continue, 'b[ack]' to go back, 's[top]' to abort: cont`,
    ``,
    `BR0280I BRTOOLS time stamp: ${timestamp}`,
    `BR0259I Program execution will be continued...`,
    ``,
    `BR0370I Directory /oracle/${tablespace}/sapdata1 - free: 12345 MB, needed: ${sizeMb} MB`,
    `BR0374I Extending tablespace ${tablespace} by ${sizeMb} MB`,
    `BR0376I Adding datafile: /oracle/${tablespace}/sapdata1/${tablespace}.data${Date.now().toString().slice(-4)}`,
    ``,
    `BR0280I BRTOOLS time stamp: ${timestamp}`,
    `BR0332I Tablespace ${tablespace} extended successfully by ${sizeMb} MB`,
    ``,
    `BR0806I End of BRTOOLS processing: befuuzlf.tse ${timestamp}`,
    `BR0280I BRTOOLS time stamp: ${timestamp}`,
    `BR0804I BRTOOLS terminated successfully with return code 0`,
  ].join('\n');
}

module.exports = { runBrtools };
