#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');

const filePath = process.argv[2];
if (!filePath) {
  console.error('用法: node scripts/restore-from-backup.js <backup.json>');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
const db = getDb();

const insertProductWithId = db.prepare(`
  INSERT INTO products (id, name, expiry_date, quantity, supplier, note, created_by, created_at, updated_at, inventory_status, unit, specification)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertProductAuto = db.prepare(`
  INSERT INTO products (name, expiry_date, quantity, supplier, note, created_by, created_at, updated_at, inventory_status, unit, specification)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertLog = db.prepare(`
  INSERT INTO operation_logs (action, product_id, detail, created_by, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const tx = db.transaction(() => {
  db.prepare('DELETE FROM operation_logs').run();
  db.prepare('DELETE FROM products').run();
  const idMap = new Map();
  const usedIds = new Set();

  for (const product of payload.products || []) {
    const oldId = Number(product.id);
    const args = [
      product.name || '',
      product.expiry_date || '',
      Number(product.quantity) || 1,
      product.supplier || null,
      product.note || null,
      product.created_by || null,
      product.created_at || null,
      product.updated_at || null,
      ['pending', 'in', 'out'].includes(product.inventory_status) ? product.inventory_status : 'pending',
      product.unit || null,
      product.specification || null,
    ];
    if (Number.isInteger(oldId) && oldId > 0 && !usedIds.has(oldId)) {
      insertProductWithId.run(oldId, ...args);
      usedIds.add(oldId);
      idMap.set(oldId, oldId);
    } else {
      const info = insertProductAuto.run(...args);
      idMap.set(oldId, Number(info.lastInsertRowid));
    }
  }

  for (const log of payload.operation_logs || []) {
    insertLog.run(log.action || '恢复日志', idMap.get(Number(log.product_id)) || null, log.detail || '', log.created_by || null, log.created_at || null);
  }
});

tx();
console.log(`restored products=${(payload.products || []).length} logs=${(payload.operation_logs || []).length}`);
