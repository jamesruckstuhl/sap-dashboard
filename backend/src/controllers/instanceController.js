'use strict';

const { db } = require('../db/database');
const { encrypt, decrypt } = require('../services/crypto/cryptoService');
const { connect, disconnect, callRfc } = require('../services/sap/sapConnector');

/**
 * Lists all SAP instances without credential data.
 */
async function listInstances() {
  return db('sap_instances').select(
    'id',
    'name',
    'hostname',
    'sysnr',
    'client',
    'sid',
    'description',
    'brtools_path',
    'created_at'
  );
}

/**
 * Gets a single instance by ID without credentials.
 */
async function getInstanceById(id) {
  return db('sap_instances')
    .select('id', 'name', 'hostname', 'sysnr', 'client', 'sid', 'description', 'brtools_path', 'created_at')
    .where({ id })
    .first();
}

/**
 * Creates a new instance and stores encrypted credentials.
 * @param {object} data - instance fields + credentials
 */
async function createInstance(data) {
  const {
    name,
    hostname,
    sysnr,
    client,
    sid,
    description,
    brtools_path,
    sap_user,
    sap_password,
    winrm_user,
    winrm_password,
    winrm_port,
    winrm_use_ssl,
  } = data;

  const [instanceId] = await db('sap_instances').insert({
    name,
    hostname,
    sysnr,
    client,
    sid,
    description: description || null,
    brtools_path: brtools_path || null,
    created_at: new Date().toISOString(),
  });

  const encryptedSapPwd = encrypt(sap_password);
  const encryptedWinrmPwd = winrm_password ? encrypt(winrm_password) : null;

  await db('instance_credentials').insert({
    instance_id: instanceId,
    sap_user,
    encrypted_sap_password: encryptedSapPwd.encrypted,
    winrm_user: winrm_user || null,
    encrypted_winrm_password: encryptedWinrmPwd ? encryptedWinrmPwd.encrypted : null,
    winrm_port: winrm_port || 5985,
    winrm_use_ssl: winrm_use_ssl ? 1 : 0,
    iv: encryptedSapPwd.iv,
    auth_tag: encryptedSapPwd.authTag,
  });

  return getInstanceById(instanceId);
}

/**
 * Updates an existing instance. Only updates provided fields.
 */
async function updateInstance(id, data) {
  const {
    name,
    hostname,
    sysnr,
    client,
    sid,
    description,
    brtools_path,
    sap_user,
    sap_password,
    winrm_user,
    winrm_password,
    winrm_port,
    winrm_use_ssl,
  } = data;

  const instanceUpdate = {};
  if (name !== undefined) instanceUpdate.name = name;
  if (hostname !== undefined) instanceUpdate.hostname = hostname;
  if (sysnr !== undefined) instanceUpdate.sysnr = sysnr;
  if (client !== undefined) instanceUpdate.client = client;
  if (sid !== undefined) instanceUpdate.sid = sid;
  if (description !== undefined) instanceUpdate.description = description;
  if (brtools_path !== undefined) instanceUpdate.brtools_path = brtools_path;

  if (Object.keys(instanceUpdate).length > 0) {
    await db('sap_instances').where({ id }).update(instanceUpdate);
  }

  const credUpdate = {};
  if (sap_user !== undefined) credUpdate.sap_user = sap_user;
  if (winrm_user !== undefined) credUpdate.winrm_user = winrm_user;
  if (winrm_port !== undefined) credUpdate.winrm_port = winrm_port;
  if (winrm_use_ssl !== undefined) credUpdate.winrm_use_ssl = winrm_use_ssl ? 1 : 0;

  if (sap_password) {
    const enc = encrypt(sap_password);
    credUpdate.encrypted_sap_password = enc.encrypted;
    credUpdate.iv = enc.iv;
    credUpdate.auth_tag = enc.authTag;
  }

  if (winrm_password) {
    const enc = encrypt(winrm_password);
    credUpdate.encrypted_winrm_password = enc.encrypted;
  }

  if (Object.keys(credUpdate).length > 0) {
    const existingCred = await db('instance_credentials').where({ instance_id: id }).first();
    if (existingCred) {
      await db('instance_credentials').where({ instance_id: id }).update(credUpdate);
    } else {
      await db('instance_credentials').insert({ instance_id: id, ...credUpdate });
    }
  }

  return getInstanceById(id);
}

/**
 * Deletes an instance and all related data (cascade handles credentials/email config).
 */
async function deleteInstance(id) {
  await db('sap_instances').where({ id }).delete();
}

/**
 * Loads instance credentials and decrypts them.
 */
async function getDecryptedCredentials(instanceId) {
  const cred = await db('instance_credentials').where({ instance_id: instanceId }).first();
  if (!cred) {
    throw new Error(`No credentials found for instance ${instanceId}`);
  }

  const sapPassword = decrypt({
    iv: cred.iv,
    authTag: cred.auth_tag,
    encrypted: cred.encrypted_sap_password,
  });

  let winrmPassword = null;
  if (cred.encrypted_winrm_password) {
    winrmPassword = decrypt({
      iv: cred.iv,
      authTag: cred.auth_tag,
      encrypted: cred.encrypted_winrm_password,
    });
  }

  return {
    sap_user: cred.sap_user,
    sap_password: sapPassword,
    winrm_user: cred.winrm_user,
    winrm_password: winrmPassword,
    winrm_port: cred.winrm_port,
    winrm_use_ssl: cred.winrm_use_ssl,
  };
}

/**
 * Tests the SAP RFC connection for an instance.
 */
async function testConnection(instanceId) {
  const instance = await getInstanceById(instanceId);
  if (!instance) {
    throw Object.assign(new Error('Instance not found'), { status: 404 });
  }

  const credentials = await getDecryptedCredentials(instanceId);

  let handle;
  try {
    handle = await connect(instance, credentials);
    await callRfc(handle, 'RFC_PING', {});
    return { success: true, message: 'Connection successful' };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    if (handle) {
      await disconnect(handle).catch(() => {});
    }
  }
}

/**
 * Logs an audit event.
 */
async function auditLog(username, action, instanceId, details) {
  await db('audit_log').insert({
    username,
    action,
    instance_id: instanceId || null,
    details: details ? JSON.stringify(details) : null,
    created_at: new Date().toISOString(),
  });
}

module.exports = {
  listInstances,
  getInstanceById,
  createInstance,
  updateInstance,
  deleteInstance,
  getDecryptedCredentials,
  testConnection,
  auditLog,
};
