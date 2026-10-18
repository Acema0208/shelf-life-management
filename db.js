const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'products.db');

let db;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function columnExists(database, table, column) {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

function initDb(database) {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      supplier TEXT,
      note TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      inventory_status TEXT DEFAULT 'pending',
      unit TEXT,
      specification TEXT
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      product_id INTEGER,
      detail TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_expiry ON products(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_supplier_expiry ON products(supplier, expiry_date);
    CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON products(inventory_status, expiry_date);
    CREATE INDEX IF NOT EXISTS idx_created_by ON products(created_by);
    CREATE INDEX IF NOT EXISTS idx_logs_product_id ON operation_logs(product_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON operation_logs(created_at);
  `);

  if (!columnExists(database, 'products', 'inventory_status')) {
    database.exec(`ALTER TABLE products ADD COLUMN inventory_status TEXT DEFAULT 'pending'`);
  }
  if (!columnExists(database, 'products', 'unit')) {
    database.exec(`ALTER TABLE products ADD COLUMN unit TEXT`);
  }
  if (!columnExists(database, 'products', 'specification')) {
    database.exec(`ALTER TABLE products ADD COLUMN specification TEXT`);
  }
}

function getDb() {
  if (!db) {
    ensureDir();
    db = new Database(DB_PATH);
    initDb(db);
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  DATA_DIR,
  DB_PATH,
  getDb,
  closeDb,
};
