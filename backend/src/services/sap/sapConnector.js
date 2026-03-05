'use strict';

const mockData = require('../../tests/fixtures/sapMockData');

const isMockMode = () => process.env.SAP_MOCK_MODE === 'true';

/**
 * Connects to an SAP system.
 * In mock mode, returns a mock handle immediately.
 *
 * @param {object} instanceConfig - { hostname, sysnr, client, sid }
 * @param {object} credentials - { sap_user, sap_password }
 * @returns {Promise<object>} connection handle
 */
async function connect(instanceConfig, credentials) {
  if (isMockMode()) {
    return {
      _mock: true,
      instanceId: instanceConfig.id,
      sid: instanceConfig.sid,
      connected: true,
    };
  }

  try {
    const nodeRfc = require('node-rfc');
    const conn = new nodeRfc.Connection({
      ashost: instanceConfig.hostname,
      sysnr: instanceConfig.sysnr,
      client: instanceConfig.client,
      user: credentials.sap_user,
      passwd: credentials.sap_password,
    });

    await conn.open();
    return conn;
  } catch (err) {
    throw new Error(`SAP connection failed: ${err.message}`);
  }
}

/**
 * Disconnects from an SAP system.
 *
 * @param {object} handle - connection handle returned by connect()
 * @returns {Promise<void>}
 */
async function disconnect(handle) {
  if (!handle || handle._mock) {
    return;
  }

  try {
    await handle.close();
  } catch (err) {
    console.error('Error closing SAP connection:', err.message);
  }
}

/**
 * Calls an SAP RFC function.
 * In mock mode, returns fixture data based on functionName.
 *
 * @param {object} handle - connection handle
 * @param {string} functionName - RFC function module name
 * @param {object} params - RFC input parameters
 * @returns {Promise<any>} RFC result
 */
async function callRfc(handle, functionName, params = {}) {
  if (handle._mock || isMockMode()) {
    return getMockResult(functionName, params);
  }

  try {
    const result = await handle.call(functionName, params);
    return result;
  } catch (err) {
    throw new Error(`RFC call ${functionName} failed: ${err.message}`);
  }
}

function getMockResult(functionName, params) {
  switch (functionName) {
    case 'BP_JOB_SELECT': {
      let jobs = [...mockData.BP_JOB_SELECT];
      if (params.JOBSTATUS) {
        jobs = jobs.filter((j) => j.status === params.JOBSTATUS);
      }
      return { JOBSELECT_EXPORT: jobs };
    }

    case 'BP_JOB_SUBMIT':
      return { JOBNAME: mockData.BP_JOB_SUBMIT.jobname, JOBCOUNT: mockData.BP_JOB_SUBMIT.jobcount };

    case 'JOB_OPEN':
      return { JOBCOUNT: mockData.JOB_OPEN.jobcount };

    case 'SUBST_START_REPORT_IN_BATCH':
      return mockData.SUBST_START_REPORT_IN_BATCH;

    case 'JOB_CLOSE':
      return mockData.JOB_CLOSE;

    case 'ENQUEUE_READ':
      return { ET_ENQUEUE: [...mockData.ENQUEUE_READ] };

    case 'ENQUEUE_DELETE':
      return mockData.ENQUEUE_DELETE;

    case 'UPDATE_MONITOR_INFO_GET':
      return { ET_UPD_INFO: [...mockData.UPDATE_MONITOR_INFO_GET] };

    case 'VBDELETE':
      return mockData.VBDELETE;

    case 'DB_TABLESPACE_INFO_GET':
      return { ET_TABLESPACE: [...mockData.DB_TABLESPACE_INFO_GET] };

    case 'RFC_READ_TEXT': {
      const jobname = params.JOBNAME || 'MOCK_JOB';
      const jobcount = params.JOBCOUNT || '00000000';
      return {
        TEXT: `Job log for ${jobname} / ${jobcount}\n[INFO] Job started\n[INFO] Processing...\n[ERROR] Job aborted with error ABAP runtime error\n[INFO] Job ended`,
      };
    }

    default:
      console.warn(`SAP mock: no fixture for RFC function '${functionName}', returning empty object`);
      return {};
  }
}

module.exports = { connect, disconnect, callRfc };
