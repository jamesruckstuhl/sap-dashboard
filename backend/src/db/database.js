'use strict';

const knex = require('knex');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/sap-dashboard.sqlite');

const db = knex({
  client: 'better-sqlite3',
  connection: {
    filename: dbPath,
  },
  useNullAsDefault: true,
  pool: {
    min: 1,
    max: 1,
    afterCreate: (conn, done) => {
      conn.pragma('journal_mode = WAL');
      conn.pragma('foreign_keys = ON');
      done(null, conn);
    },
  },
});

async function initDb() {
  await createTables();
  await seedDefaultAdmin();
}

async function createTables() {
  const hasInstances = await db.schema.hasTable('sap_instances');
  if (!hasInstances) {
    await db.schema.createTable('sap_instances', (table) => {
      table.increments('id').primary();
      table.text('name').notNullable();
      table.text('hostname').notNullable();
      table.text('sysnr').notNullable();
      table.text('client').notNullable();
      table.text('sid').notNullable();
      table.text('description');
      table.text('brtools_path');
      table.datetime('created_at').defaultTo(db.fn.now());
    });
  }

  const hasCredentials = await db.schema.hasTable('instance_credentials');
  if (!hasCredentials) {
    await db.schema.createTable('instance_credentials', (table) => {
      table.increments('id').primary();
      table.integer('instance_id').notNullable().references('id').inTable('sap_instances').onDelete('CASCADE');
      table.text('sap_user').notNullable();
      table.text('encrypted_sap_password').notNullable();
      table.text('winrm_user');
      table.text('encrypted_winrm_password');
      table.integer('winrm_port').defaultTo(5985);
      table.integer('winrm_use_ssl').defaultTo(0);
      table.text('iv').notNullable();
      table.text('auth_tag').notNullable();
      table.text('winrm_iv');
      table.text('winrm_auth_tag');
    });
  } else {
    // Add winrm_iv / winrm_auth_tag columns if they don't exist yet (migration)
    const hasWinrmIv = await db.schema.hasColumn('instance_credentials', 'winrm_iv');
    if (!hasWinrmIv) {
      await db.schema.table('instance_credentials', (table) => {
        table.text('winrm_iv');
        table.text('winrm_auth_tag');
      });
    }
  }

  const hasEmailConfig = await db.schema.hasTable('instance_email_config');
  if (!hasEmailConfig) {
    await db.schema.createTable('instance_email_config', (table) => {
      table.increments('id').primary();
      table.integer('instance_id').notNullable().references('id').inTable('sap_instances').onDelete('CASCADE');
      table.text('smtp_host');
      table.integer('smtp_port').defaultTo(587);
      table.text('smtp_user');
      table.text('encrypted_smtp_password');
      table.text('from_address');
      table.text('alert_emails');
      table.text('report_time').defaultTo('06:00');
      table.real('tablespace_pct_threshold').defaultTo(85);
      table.real('tablespace_mb_threshold').defaultTo(500);
      table.integer('report_enabled').defaultTo(1);
    });
  }

  const hasUsers = await db.schema.hasTable('dashboard_users');
  if (!hasUsers) {
    await db.schema.createTable('dashboard_users', (table) => {
      table.increments('id').primary();
      table.text('username').notNullable().unique();
      table.text('password_hash').notNullable();
      table.text('role').defaultTo('admin');
      table.datetime('created_at').defaultTo(db.fn.now());
    });
  }

  const hasAuditLog = await db.schema.hasTable('audit_log');
  if (!hasAuditLog) {
    await db.schema.createTable('audit_log', (table) => {
      table.increments('id').primary();
      table.text('username');
      table.text('action').notNullable();
      table.integer('instance_id');
      table.text('details');
      table.datetime('created_at').defaultTo(db.fn.now());
    });
  }
}

async function seedDefaultAdmin() {
  const existing = await db('dashboard_users').where({ username: 'admin' }).first();
  if (!existing) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);
    await db('dashboard_users').insert({
      username: 'admin',
      password_hash: passwordHash,
      role: 'admin',
      created_at: new Date().toISOString(),
    });
    console.log('Default admin user created (username: admin, password: Admin123!)');
  }
}

module.exports = { db, initDb };
