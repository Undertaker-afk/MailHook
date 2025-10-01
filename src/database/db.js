import Database from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import appConfig from '../config.js';

let db = null;

export async function initDatabase() {
  // Create data directory if it doesn't exist
  await mkdir(dirname(appConfig.dbPath), { recursive: true });
  
  db = new Database(appConfig.dbPath);
  db.pragma('journal_mode = WAL');
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS custom_domains (
      id TEXT PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      user_id TEXT,
      is_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      mx_record TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_hooks (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      domain TEXT NOT NULL,
      user_id TEXT,
      webhook_url TEXT NOT NULL,
      webhook_secret TEXT,
      is_enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      hook_id TEXT NOT NULL,
      from_address TEXT NOT NULL,
      subject TEXT,
      status TEXT NOT NULL,
      error TEXT,
      webhook_status_code INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hook_id) REFERENCES email_hooks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_email_hooks_email ON email_hooks(email);
    CREATE INDEX IF NOT EXISTS idx_email_hooks_user_id ON email_hooks(user_id);
    CREATE INDEX IF NOT EXISTS idx_email_logs_hook_id ON email_logs(hook_id);
    CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
    CREATE INDEX IF NOT EXISTS idx_custom_domains_user_id ON custom_domains(user_id);
  `);

  // Create default user if not exists
  const defaultUser = db.prepare('SELECT * FROM users WHERE id = ?').get('default');
  if (!defaultUser) {
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run('default', 'Default User');
  }

  console.log('✅ Database initialized');
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Custom Domains Repository
export const customDomainsRepo = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO custom_domains (id, domain, user_id, verification_token, mx_record)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      data.id,
      data.domain,
      data.userId || 'default',
      data.verificationToken,
      data.mxRecord
    );
    
    return this.findById(data.id);
  },

  findAll(userId = 'default') {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM custom_domains WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(userId).map(formatCustomDomain);
  },

  findById(id) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM custom_domains WHERE id = ?');
    const row = stmt.get(id);
    return row ? formatCustomDomain(row) : null;
  },

  findByDomain(domain) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM custom_domains WHERE domain = ?');
    const row = stmt.get(domain);
    return row ? formatCustomDomain(row) : null;
  },

  verify(id) {
    const db = getDb();
    const stmt = db.prepare('UPDATE custom_domains SET is_verified = 1 WHERE id = ?');
    stmt.run(id);
    return this.findById(id);
  },

  delete(id) {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM custom_domains WHERE id = ?');
    return stmt.run(id).changes > 0;
  },

  getAllVerifiedDomains() {
    const db = getDb();
    const stmt = db.prepare('SELECT domain FROM custom_domains WHERE is_verified = 1');
    return stmt.all().map(row => row.domain);
  }
};

// Email Hooks Repository
export const emailHooksRepo = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO email_hooks (id, email, username, domain, user_id, webhook_url, webhook_secret, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      data.id,
      data.email,
      data.username,
      data.domain,
      data.userId || 'default',
      data.webhookUrl,
      data.webhookSecret || null,
      data.isEnabled ? 1 : 0
    );
    
    return this.findById(data.id);
  },

  findAll(userId = 'default') {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM email_hooks WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(userId).map(formatEmailHook);
  },

  findById(id) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM email_hooks WHERE id = ?');
    const row = stmt.get(id);
    return row ? formatEmailHook(row) : null;
  },

  findByEmail(email) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM email_hooks WHERE email = ?');
    const row = stmt.get(email);
    return row ? formatEmailHook(row) : null;
  },

  update(id, data) {
    const db = getDb();
    const updates = [];
    const values = [];

    if (data.webhookUrl !== undefined) {
      updates.push('webhook_url = ?');
      values.push(data.webhookUrl);
    }
    if (data.webhookSecret !== undefined) {
      updates.push('webhook_secret = ?');
      values.push(data.webhookSecret);
    }
    if (data.isEnabled !== undefined) {
      updates.push('is_enabled = ?');
      values.push(data.isEnabled ? 1 : 0);
    }

    if (updates.length === 0) return this.findById(id);

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = db.prepare(`
      UPDATE email_hooks 
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    
    stmt.run(...values);
    return this.findById(id);
  },

  delete(id) {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM email_hooks WHERE id = ?');
    return stmt.run(id).changes > 0;
  }
};

// Email Logs Repository
export const emailLogsRepo = {
  create(data) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO email_logs (id, hook_id, from_address, subject, status, error, webhook_status_code)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      data.id,
      data.hookId,
      data.fromAddress,
      data.subject || null,
      data.status,
      data.error || null,
      data.webhookStatusCode || null
    );
    
    return this.findById(data.id);
  },

  findById(id) {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM email_logs WHERE id = ?');
    return stmt.get(id);
  },

  findByHookId(hookId, limit = 50) {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM email_logs 
      WHERE hook_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(hookId, limit);
  },

  findRecent(limit = 100) {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT el.*, eh.email, eh.username, eh.domain
      FROM email_logs el
      JOIN email_hooks eh ON el.hook_id = eh.id
      ORDER BY el.created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
};

function formatEmailHook(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    domain: row.domain,
    userId: row.user_id,
    webhookUrl: row.webhook_url,
    webhookSecret: row.webhook_secret,
    isEnabled: row.is_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function formatCustomDomain(row) {
  return {
    id: row.id,
    domain: row.domain,
    userId: row.user_id,
    isVerified: row.is_verified === 1,
    verificationToken: row.verification_token,
    mxRecord: row.mx_record,
    createdAt: row.created_at
  };
}
