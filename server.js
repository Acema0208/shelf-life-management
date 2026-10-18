#!/usr/bin/env node
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const QRCode = require('qrcode');
const { getDb, closeDb, DATA_DIR } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3751);
const HOST = process.env.HOST || '127.0.0.1';
const APP_ROLE = String(process.env.PRODUCT_EXPIRY_ROLE || process.env.APP_ROLE || 'local').trim().toLowerCase() || 'local';
const APP_MODE = String(process.env.PRODUCT_EXPIRY_MODE || process.env.APP_MODE || 'direct').trim().toLowerCase() || 'direct';
const ROOT = path.join(__dirname, 'public');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const START_TIME = Date.now();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(ROOT, { extensions: ['html'] }));

function configuredKey(envKeys) {
  for (const key of envKeys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function requestKey(req) {
  return String(req.headers['x-api-key'] || req.query.key || '').trim();
}

function requireConfiguredKey(req, res, envKeys) {
  const secret = configuredKey(envKeys);
  if (!secret) return true;
  if (requestKey(req) === secret) return true;
  res.status(403).json({ ok: false, error: '访问密钥无效' });
  return false;
}

function requireWriteAccess(req, res) {
  return requireConfiguredKey(req, res, ['WRITE_API_KEY']);
}

function writeJson(res, status, payload) {
  res.status(status).json(payload);
}

function sqlNow() {
  return "datetime('now','localtime')";
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDays(dateStr) {
  if (!dateStr) return Infinity;
  const today = new Date(`${localDateString()}T00:00:00`);
  const target = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Infinity;
  return Math.ceil((target - today) / 86400000);
}

function getStatus(expiryDate) {
  const days = diffDays(expiryDate);
  if (days < 0) return 'expired';
  if (days <= 7) return 'soon_7';
  if (days <= 15) return 'soon_15';
  if (days <= 30) return 'soon_1m';
  if (days <= 60) return 'soon_2m';
  if (days <= 90) return 'soon_3m';
  return 'ok';
}

function statusLabel(status) {
  return {
    ok: '正常',
    expired: '已过期',
    soon_1: '本月到期',
    soon_2: '2个月内到期',
    soon_3: '3个月内到期',
    soon_15: '15天内到期',
    soon_7: '7天内到期',
    soon_1m: '1个月内到期',
    soon_2m: '2个月内到期',
    soon_3m: '3个月内到期',
  }[status] || status || '-';
}

function invLabel(status) {
  return {
    pending: '待入库',
    in: '已入库',
    out: '已出库',
  }[status] || '-';
}

function logAction(database, action, productId, detail, createdBy) {
  database.prepare(`
    INSERT INTO operation_logs (action, product_id, detail, created_by, created_at)
    VALUES (?, ?, ?, ?, datetime('now','localtime'))
  `).run(action, productId || null, detail || '', createdBy || null);
}

function knownSuppliers(database) {
  return database
    .prepare(`SELECT DISTINCT supplier FROM products WHERE supplier IS NOT NULL AND TRIM(supplier) != '' ORDER BY supplier COLLATE NOCASE ASC`)
    .all()
    .map((row) => String(row.supplier || '').trim())
    .filter(Boolean);
}

function normalizeProduct(database, name, supplier) {
  let normalizedName = String(name || '').trim();
  let normalizedSupplier = String(supplier || '').trim() || null;
  const suppliers = knownSuppliers(database).sort((a, b) => b.length - a.length);

  if (!normalizedSupplier && normalizedName) {
    for (const item of suppliers) {
      if (normalizedName.startsWith(`${item} `) || normalizedName.startsWith(item)) {
        normalizedSupplier = item;
        break;
      }
    }
  }

  if (normalizedSupplier && normalizedName && !normalizedName.startsWith(normalizedSupplier)) {
    if (/^[A-Za-z0-9]+$/.test(normalizedSupplier)) {
      normalizedName = `${normalizedSupplier} ${normalizedName}`;
    }
  }

  return {
    name: normalizedName,
    supplier: normalizedSupplier,
  };
}

function productRow(row) {
  return {
    ...row,
    inventory_status: row.inventory_status || 'pending',
    unit: row.unit || null,
    specification: row.specification || null,
    status: getStatus(row.expiry_date),
  };
}

function parseCsvRows(csvText) {
  const text = String(csvText || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((item) => item !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((item) => item !== '')) rows.push(row);
  }

  return rows;
}

function parseFeishuEntry(text) {
  text = String(text || '').replace(/^@[^\s]+\s*/, '').replace(/\[.*?\]/g, '').trim();
  if (!text || !text.includes('录入')) return null;
  let match = text.match(/录入:?\s*([^,]+),\s*到期时间?(\d{4})年(\d{1,2})月(\d{1,2})[号日]?[^,]*,\s*数量\s*(\d*)/i);
  if (match) {
    return {
      name: match[1].trim(),
      expiryDate: `${match[2]}-${String(match[3]).padStart(2, '0')}-${String(match[4]).padStart(2, '0')}`,
      quantity: match[5] ? parseInt(match[5], 10) : 1,
    };
  }
  match = text.match(/录入:?\s+(.+?)\s+(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})\s*(\d*)/);
  if (match) {
    return {
      name: match[1].trim(),
      expiryDate: match[2].replace(/\//g, '-'),
      quantity: match[3] ? parseInt(match[3], 10) : 1,
    };
  }
  return null;
}

function generateBackup() {
  const database = getDb();
  const products = database.prepare(`SELECT * FROM products ORDER BY id`).all();
  const logs = database.prepare(`SELECT * FROM operation_logs ORDER BY id`).all();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    products,
    operation_logs: logs,
  };
}

function restoreBackupData(payload) {
  const { products = [], operation_logs = [] } = payload || {};
  if (!Array.isArray(products)) {
    throw new Error('备份格式错误');
  }

  const database = getDb();
  const insertProductWithId = database.prepare(`
    INSERT INTO products (id, name, expiry_date, quantity, supplier, note, created_by, created_at, updated_at, inventory_status, unit, specification)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertProductAuto = database.prepare(`
    INSERT INTO products (name, expiry_date, quantity, supplier, note, created_by, created_at, updated_at, inventory_status, unit, specification)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLog = database.prepare(`
    INSERT INTO operation_logs (action, product_id, detail, created_by, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = database.transaction(() => {
    database.prepare('DELETE FROM operation_logs').run();
    database.prepare('DELETE FROM products').run();

    const idMap = new Map();
    const usedIds = new Set();

    for (const product of products) {
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

    for (const log of Array.isArray(operation_logs) ? operation_logs : []) {
      const mappedId = log.product_id == null ? null : (idMap.get(Number(log.product_id)) || null);
      insertLog.run(
        log.action || '恢复日志',
        mappedId,
        log.detail || '',
        log.created_by || null,
        log.created_at || null,
      );
    }
  });

  tx();
  return { restored: products.length, logs: operation_logs.length };
}

function buildExportRows(products) {
  return products.map((p) => ({
    ID: p.id,
    产品名: p.name,
    到期日: p.expiry_date,
    数量: p.quantity,
    规格: p.specification || '-',
    数量单位: p.unit || '-',
    供应商: p.supplier || '-',
    备注: p.note || '-',
    出入库状态: invLabel(p.inventory_status),
    状态: statusLabel(getStatus(p.expiry_date)),
    录入人: p.created_by || '-',
    录入时间: p.created_at || '-',
    更新时间: p.updated_at || '-',
  }));
}

function csvEscapeCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function queryProducts({ page = 1, limit = 10, status = '', inventory = '', supplier = '', creator = '', search = '' }) {
  const database = getDb();
  const where = [];
  const params = [];

  if (inventory) {
    where.push(`COALESCE(inventory_status, 'pending') = ?`);
    params.push(inventory);
  }
  if (supplier) {
    where.push(`COALESCE(supplier, '') = ?`);
    params.push(supplier);
  }
  if (creator) {
    where.push(`COALESCE(created_by, '') = ?`);
    params.push(creator);
  }
  if (search) {
    where.push(`(name LIKE ? OR COALESCE(note, '') LIKE ? OR COALESCE(supplier, '') LIKE ? OR COALESCE(created_by, '') LIKE ?)`);
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword);
  }

  switch (status) {
    case 'expired':
      where.push(`expiry_date < date('now','localtime')`);
      break;
    case 'soon_7':
      where.push(`expiry_date >= date('now','localtime') AND expiry_date <= date('now','localtime','+7 day')`);
      break;
    case 'soon_15':
      where.push(`expiry_date >= date('now','localtime') AND expiry_date <= date('now','localtime','+15 day')`);
      break;
    case 'soon_1':
      where.push(`expiry_date >= date('now','localtime') AND expiry_date <= date('now','localtime','+30 day')`);
      break;
    case 'soon_1m':
      where.push(`expiry_date > date('now','localtime','+15 day') AND expiry_date <= date('now','localtime','+30 day')`);
      break;
    case 'soon_2':
      where.push(`expiry_date >= date('now','localtime') AND expiry_date <= date('now','localtime','+60 day')`);
      break;
    case 'soon_2m':
      where.push(`expiry_date > date('now','localtime','+30 day') AND expiry_date <= date('now','localtime','+60 day')`);
      break;
    case 'soon_3':
      where.push(`expiry_date >= date('now','localtime') AND expiry_date <= date('now','localtime','+90 day')`);
      break;
    case 'soon_3m':
      where.push(`expiry_date > date('now','localtime','+60 day') AND expiry_date <= date('now','localtime','+90 day')`);
      break;
    case 'ok':
      where.push(`expiry_date > date('now','localtime','+90 day')`);
      break;
    default:
      break;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = database.prepare(`SELECT COUNT(*) AS count FROM products ${whereSql}`).get(...params).count;
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 10));
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const safePage = Math.max(1, Math.min(totalPages, Number(page) || 1));
  const offset = (safePage - 1) * safeLimit;

  const rows = database.prepare(`
    SELECT * FROM products
    ${whereSql}
    ORDER BY expiry_date ASC, id ASC
    LIMIT ? OFFSET ?
  `).all(...params, safeLimit, offset).map(productRow);

  const suppliers = database.prepare(`SELECT DISTINCT supplier FROM products WHERE supplier IS NOT NULL AND TRIM(supplier) != '' ORDER BY supplier COLLATE NOCASE ASC`).all().map((row) => row.supplier);
  const creators = database.prepare(`SELECT DISTINCT created_by FROM products WHERE created_by IS NOT NULL AND TRIM(created_by) != '' ORDER BY created_by COLLATE NOCASE ASC`).all().map((row) => row.created_by);

  return {
    data: rows,
    suppliers,
    creators,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
    },
  };
}

app.get('/health', (req, res) => {
  try {
    getDb();
    const memUsage = process.memoryUsage();
    let diskInfo = { status: 'unavailable' };
    try {
      if (fs.statfsSync) {
        const stats = fs.statfsSync(DATA_DIR);
        diskInfo = {
          free: `${(stats.bavail * stats.bsize / 1024 / 1024 / 1024).toFixed(2)}GB`,
          total: `${(stats.blocks * stats.bsize / 1024 / 1024 / 1024).toFixed(2)}GB`,
        };
      }
    } catch (_) {}

    res.json({
      status: 'ok',
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      database: 'ok',
      memory: {
        used: `${Math.floor(memUsage.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.floor(memUsage.heapTotal / 1024 / 1024)}MB`,
      },
      disk: diskInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message, timestamp: new Date().toISOString() });
  }
});

app.get('/api/runtime', (req, res) => {
  res.json({
    ok: true,
    runtime: {
      role: APP_ROLE,
      mode: APP_MODE,
      hostname: os.hostname(),
      port: PORT,
      host: HOST,
    },
  });
});

app.get('/api/stats', (req, res) => {
  try {
    const database = getDb();
    const counts = database.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(inventory_status, 'pending') != 'out' AND expiry_date < date('now','localtime') THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN COALESCE(inventory_status, 'pending') != 'out' AND expiry_date >= date('now','localtime') AND expiry_date <= date('now','localtime','+7 day') THEN 1 ELSE 0 END) AS soon_7,
        SUM(CASE WHEN COALESCE(inventory_status, 'pending') != 'out' AND expiry_date > date('now','localtime','+7 day') AND expiry_date <= date('now','localtime','+15 day') THEN 1 ELSE 0 END) AS soon_15,
        SUM(CASE WHEN COALESCE(inventory_status, 'pending') != 'out' AND expiry_date > date('now','localtime','+15 day') AND expiry_date <= date('now','localtime','+30 day') THEN 1 ELSE 0 END) AS soon_1m,
        SUM(CASE WHEN COALESCE(inventory_status, 'pending') != 'out' AND expiry_date > date('now','localtime','+30 day') AND expiry_date <= date('now','localtime','+60 day') THEN 1 ELSE 0 END) AS soon_2m,
        SUM(CASE WHEN COALESCE(inventory_status, 'pending') != 'out' AND expiry_date > date('now','localtime','+60 day') AND expiry_date <= date('now','localtime','+90 day') THEN 1 ELSE 0 END) AS soon_3m,
        SUM(CASE WHEN COALESCE(inventory_status, 'pending') != 'out' AND expiry_date > date('now','localtime','+90 day') THEN 1 ELSE 0 END) AS ok
      FROM products
    `).get();

    const bySupplier = {};
    for (const row of database.prepare(`SELECT COALESCE(NULLIF(TRIM(supplier), ''), '未分类') AS supplier, COUNT(*) AS count FROM products GROUP BY 1 ORDER BY count DESC, supplier ASC`).all()) {
      bySupplier[row.supplier] = row.count;
    }

    const byInventory = { pending: 0, in: 0, out: 0 };
    for (const row of database.prepare(`SELECT COALESCE(inventory_status, 'pending') AS inventory_status, COUNT(*) AS count FROM products GROUP BY 1`).all()) {
      byInventory[row.inventory_status] = row.count;
    }

    res.json({
      ok: true,
      stats: {
        total: Number(counts.total || 0),
        expired: Number(counts.expired || 0),
        soon_7: Number(counts.soon_7 || 0),
        soon_15: Number(counts.soon_15 || 0),
        soon_15_total: Number(counts.soon_7 || 0) + Number(counts.soon_15 || 0),
        soon_1_total: Number(counts.soon_7 || 0) + Number(counts.soon_15 || 0) + Number(counts.soon_1m || 0),
        soon_1m: Number(counts.soon_1m || 0),
        soon_2_total: Number(counts.soon_7 || 0) + Number(counts.soon_15 || 0) + Number(counts.soon_1m || 0) + Number(counts.soon_2m || 0),
        soon_2m: Number(counts.soon_2m || 0),
        soon_3m: Number(counts.soon_3m || 0),
        soon_3_total: Number(counts.soon_7 || 0) + Number(counts.soon_15 || 0) + Number(counts.soon_1m || 0) + Number(counts.soon_2m || 0) + Number(counts.soon_3m || 0),
        ok: Number(counts.ok || 0),
        by_supplier: bySupplier,
        by_inventory: byInventory,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/products', (req, res) => {
  try {
    const result = queryProducts(req.query || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const row = getDb().prepare(`SELECT * FROM products WHERE id = ?`).get(Number(req.params.id));
    if (!row) return res.status(404).json({ ok: false, error: '产品不存在' });
    res.json({ ok: true, data: productRow(row) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/products', (req, res) => {
  if (!requireWriteAccess(req, res)) return;
  try {
    const database = getDb();
    let { name, expiry_date, quantity, supplier, note, created_by, inventory_status, unit, specification } = req.body || {};
    if (!String(name || '').trim() || !String(expiry_date || '').trim()) {
      return res.status(400).json({ ok: false, error: '产品名和到期日必填' });
    }
    const normalized = normalizeProduct(database, name, supplier);
    const info = database.prepare(`
      INSERT INTO products (name, expiry_date, quantity, supplier, note, created_by, created_at, updated_at, inventory_status, unit, specification)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'), ?, ?, ?)
    `).run(
      normalized.name,
      String(expiry_date).slice(0, 10),
      Number(quantity) || 1,
      normalized.supplier,
      note || null,
      created_by || null,
      ['pending', 'in', 'out'].includes(inventory_status) ? inventory_status : 'pending',
      unit || null,
      specification || null,
    );
    const row = database.prepare(`SELECT * FROM products WHERE id = ?`).get(Number(info.lastInsertRowid));
    logAction(database, '新增产品', row.id, row.name, created_by || null);
    res.json({ ok: true, data: productRow(row) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.patch('/api/products/:id', (req, res) => {
  if (!requireWriteAccess(req, res)) return;
  try {
    const id = Number(req.params.id);
    const database = getDb();
    const row = database.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ ok: false, error: '产品不存在' });
    let { name, expiry_date, quantity, supplier, note, inventory_status, created_by, unit, specification } = req.body || {};
    const normalized = normalizeProduct(database, name ?? row.name, supplier ?? row.supplier);
    database.prepare(`
      UPDATE products
      SET name = ?, expiry_date = ?, quantity = ?, supplier = ?, note = ?, inventory_status = ?, created_by = ?, unit = ?, specification = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      normalized.name,
      String(expiry_date || row.expiry_date).slice(0, 10),
      Number(quantity ?? row.quantity) || 1,
      normalized.supplier,
      note === undefined ? row.note : (note || null),
      ['pending', 'in', 'out'].includes(inventory_status) ? inventory_status : (row.inventory_status || 'pending'),
      created_by === undefined ? row.created_by : (created_by || null),
      unit === undefined ? row.unit : (unit || null),
      specification === undefined ? row.specification : (specification || null),
      id,
    );
    const updated = database.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    logAction(database, '编辑产品', id, updated.name, created_by || row.created_by || null);
    res.json({ ok: true, data: productRow(updated) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  if (!requireWriteAccess(req, res)) return;
  try {
    const id = Number(req.params.id);
    const database = getDb();
    const row = database.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ ok: false, error: '产品不存在' });
    database.prepare(`DELETE FROM products WHERE id = ?`).run(id);
    logAction(database, '删除产品', id, row.name, String(req.query.updated_by || '').trim() || null);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.patch('/api/products/:id/inventory', (req, res) => {
  if (!requireWriteAccess(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { status, updated_by } = req.body || {};
    if (!['pending', 'in', 'out'].includes(status)) {
      return res.status(400).json({ ok: false, error: '状态无效' });
    }
    const database = getDb();
    const row = database.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ ok: false, error: '产品不存在' });
    database.prepare(`UPDATE products SET inventory_status = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(status, id);
    const updated = database.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    logAction(database, '更新出入库', id, `${row.inventory_status || 'pending'} -> ${status}`, updated_by || null);
    res.json({ ok: true, data: productRow(updated) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/products/batch-delete', (req, res) => {
  if (!requireWriteAccess(req, res)) return;
  try {
    const { ids = [], updated_by = null } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ ok: false, error: 'ids 必须是非空数组' });
    const database = getDb();
    const tx = database.transaction(() => {
      let deleted = 0;
      for (const rawId of ids) {
        const id = Number(rawId);
        const row = database.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
        if (!row) continue;
        database.prepare(`DELETE FROM products WHERE id = ?`).run(id);
        logAction(database, '批量删除', id, row.name, updated_by || null);
        deleted += 1;
      }
      return deleted;
    });
    res.json({ ok: true, deleted: tx() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/products/batch-inventory', (req, res) => {
  if (!requireWriteAccess(req, res)) return;
  try {
    const { ids = [], status = '', updated_by = null } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ ok: false, error: 'ids 必须是非空数组' });
    if (!['pending', 'in', 'out'].includes(status)) return res.status(400).json({ ok: false, error: 'status 须为 pending / in / out' });
    const database = getDb();
    const tx = database.transaction(() => {
      let updated = 0;
      for (const rawId of ids) {
        const id = Number(rawId);
        const row = database.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
        if (!row) continue;
        database.prepare(`UPDATE products SET inventory_status = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(status, id);
        logAction(database, '批量出入库', id, `改为 ${invLabel(status)}`, updated_by || null);
        updated += 1;
      }
      return updated;
    });
    res.json({ ok: true, updated: tx(), status: invLabel(status) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/products/normalize-all', (req, res) => {
  if (!requireWriteAccess(req, res)) return;
  try {
    const database = getDb();
    const rows = database.prepare(`SELECT * FROM products ORDER BY id`).all();
    const tx = database.transaction(() => {
      let updated = 0;
      for (const row of rows) {
        const normalized = normalizeProduct(database, row.name, row.supplier);
        if (normalized.name !== row.name || (normalized.supplier || null) !== (row.supplier || null)) {
          database.prepare(`UPDATE products SET name = ?, supplier = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(normalized.name, normalized.supplier, row.id);
          logAction(database, '规范化产品', row.id, `${row.name} -> ${normalized.name}`, null);
          updated += 1;
        }
      }
      return updated;
    });
    res.json({ ok: true, updated: tx() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/logs', (req, res) => {
  try {
    const database = getDb();
    const productId = Number(req.query.product_id || 0);
    const rows = productId
      ? database.prepare(`SELECT * FROM operation_logs WHERE product_id = ? ORDER BY id DESC LIMIT 100`).all(productId)
      : database.prepare(`SELECT * FROM operation_logs ORDER BY id DESC LIMIT 100`).all();
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/import', (req, res) => {
  if (!requireWriteAccess(req, res)) return;
  try {
    const { csv, created_by } = req.body || {};
    if (!csv || typeof csv !== 'string') return res.status(400).json({ ok: false, error: '请提供 CSV 内容' });
    const rows = parseCsvRows(csv);
    if (rows.length < 2) return res.status(400).json({ ok: false, error: 'CSV 至少需表头+1行数据' });
    const database = getDb();
    const headers = rows[0];
    const col = (re, fallback) => {
      const index = headers.findIndex((item) => re.test(item));
      return index >= 0 ? index : fallback;
    };
    const nameIdx = col(/产品|名称|name/i, 0);
    const dateIdx = col(/到期|日期|expiry|date/i, 1);
    const qtyIdx = col(/数量$/i, 2);
    const specIdx = col(/规格|spec/i, 3);
    const unitIdx = col(/数量单位|单位|unit/i, 4);
    const supplierIdx = col(/供应商|supplier/i, 5);
    const inventoryIdx = col(/出入库|inventory/i, 6);

    const insert = database.prepare(`
      INSERT INTO products (name, expiry_date, quantity, specification, unit, supplier, inventory_status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
    `);

    const tx = database.transaction(() => {
      let count = 0;
      for (let i = 1; i < rows.length; i += 1) {
        const parts = rows[i];
        let name = parts[nameIdx] || '';
        const expiryDate = (parts[dateIdx] || '').slice(0, 10);
        if (!name || !expiryDate) continue;
        const normalized = normalizeProduct(database, name, parts[supplierIdx] || null);
        const inventoryStatus = ['pending', 'in', 'out'].includes(parts[inventoryIdx]) ? parts[inventoryIdx] : 'pending';
        insert.run(
          normalized.name,
          expiryDate,
          Number(parts[qtyIdx]) || 1,
          parts[specIdx] || null,
          parts[unitIdx] || null,
          normalized.supplier,
          inventoryStatus,
          String(created_by || '').trim() || null,
        );
        count += 1;
      }
      return count;
    });

    const count = tx();
    logAction(database, '批量导入', null, `导入 ${count} 条`, String(created_by || '').trim() || null);
    res.json({ ok: true, count });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/feishu/incoming', (req, res) => {
  try {
    const body = req.body || {};
    if (body.type === 'url_verification') return res.json({ challenge: body.challenge });
    res.json({ ok: true });
    const parsed = parseFeishuEntry(body.event?.text || body.event?.message?.content || '');
    if (!parsed) return;
    const database = getDb();
    const info = database.prepare(`
      INSERT INTO products (name, expiry_date, quantity, created_by, created_at, updated_at, inventory_status)
      VALUES (?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'), 'pending')
    `).run(parsed.name, parsed.expiryDate, parsed.quantity, body.event?.sender?.user_id || '飞书');
    logAction(database, '飞书录入', Number(info.lastInsertRowid), `${parsed.name} ${parsed.expiryDate}`, body.event?.sender?.user_id || '飞书');
  } catch (error) {
    console.error('Feishu incoming:', error.message);
  }
});

app.get('/api/feishu/test-parse', (req, res) => {
  const text = String(req.query.text || '');
  res.json({ ok: true, parsed: parseFeishuEntry(text), raw: text });
});

app.get('/api/mobile-url', (req, res) => {
  const publicUrl = String(process.env.PUBLIC_URL || '').trim();
  if (publicUrl) return res.json({ ok: true, url: publicUrl.replace(/\/$/, '') });
  const host = req.headers.host || `${HOST}:${PORT}`;
  if (host.includes('localhost') || host.startsWith('127.')) {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const item of interfaces[name] || []) {
        if (!item.internal && item.family === 'IPv4') {
          return res.json({ ok: true, url: `http://${item.address}:${PORT}` });
        }
      }
    }
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  res.json({ ok: true, url: `${proto}://${host}` });
});

app.get('/api/qr', async (req, res) => {
  try {
    const url = String(req.query.url || '').trim();
    if (!url) return res.status(400).send('missing url');
    const width = Math.min(280, Math.max(120, parseInt(req.query.w, 10) || 200));
    const dataUrl = await QRCode.toDataURL(url, { width, margin: 2 });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    res.set('Cache-Control', 'no-store');
    res.type('png').send(Buffer.from(base64, 'base64'));
  } catch (error) {
    res.status(500).send('QR generation failed');
  }
});

app.get('/api/backup', (req, res) => {
  if (!requireConfiguredKey(req, res, ['BACKUP_API_KEY', 'WRITE_API_KEY'])) return;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = generateBackup();
    const filename = `backup_${localDateString()}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf8');
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/backup/preview', (req, res) => {
  if (!requireConfiguredKey(req, res, ['RESTORE_API_KEY', 'BACKUP_API_KEY', 'WRITE_API_KEY'])) return;
  try {
    const { products = [], operation_logs = [] } = req.body || {};
    if (!Array.isArray(products)) return res.status(400).json({ ok: false, error: '备份格式错误' });
    const currentCount = getDb().prepare(`SELECT COUNT(*) AS count FROM products`).get().count;
    const suppliers = [...new Set(products.map((item) => item.supplier).filter(Boolean))].sort();
    const dates = products.map((item) => item.expiry_date).filter(Boolean).sort();
    res.json({
      ok: true,
      preview: {
        products_count: products.length,
        logs_count: Array.isArray(operation_logs) ? operation_logs.length : 0,
        suppliers,
        date_range: { earliest: dates[0] || null, latest: dates[dates.length - 1] || null },
        diff: {
          current_count: currentCount,
          will_add: Math.max(0, products.length - currentCount),
          will_replace: currentCount,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/restore', (req, res) => {
  if (!requireConfiguredKey(req, res, ['RESTORE_API_KEY', 'BACKUP_API_KEY', 'WRITE_API_KEY'])) return;
  try {
    const result = restoreBackupData(req.body || {});
    res.json({ ok: true, restored: result.restored, logs: result.logs });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/template', (req, res) => {
  res.type('text/csv; charset=utf-8').send('\uFEFF产品名,到期日,数量,规格,数量单位,供应商,出入库\n示例产品,2026-03-15,10,8ml,瓶,供应商A,pending\n');
});

app.get('/api/export/excel', (req, res) => {
  try {
    const products = getDb().prepare(`SELECT * FROM products ORDER BY COALESCE(supplier,''), expiry_date ASC`).all();
    const rows = buildExportRows(products);
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, '产品列表');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `产品保质期管理_${localDateString()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/export/csv', (req, res) => {
  try {
    const products = getDb().prepare(`SELECT * FROM products ORDER BY COALESCE(supplier,''), expiry_date ASC`).all();
    const rows = buildExportRows(products);
    const headers = Object.keys(rows[0] || { ID: '', 产品名: '', 到期日: '', 数量: '', 规格: '', 数量单位: '', 供应商: '', 备注: '', 出入库状态: '', 状态: '', 录入人: '', 录入时间: '', 更新时间: '' });
    const csv = '\uFEFF' + [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscapeCell(row[header])).join(','))].join('\n');
    const filename = `产品保质期管理_${localDateString()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/local-sync', async (req, res) => {
  if (APP_ROLE !== 'local') {
    return res.status(403).json({ ok: false, error: '该接口仅允许本地实例调用' });
  }
  if (process.env.LOCAL_SYNC_ENABLED !== '1') {
    return res.status(403).json({ ok: false, error: '请使用 npm run start:local 启动后再点「同步到云端」' });
  }
  try {
    const upstream = String(process.env.SYNC_SERVER_URL || process.env.BACKUP_SERVER_URL || 'http://47.245.92.187:3751').replace(/\/$/, '');
    const secret = String(
      process.env.SYNC_API_KEY ||
      process.env.RESTORE_API_KEY ||
      process.env.BACKUP_API_KEY ||
      process.env.WRITE_API_KEY ||
      ''
    ).trim();
    const headers = { 'Content-Type': 'application/json' };
    if (secret) headers['x-api-key'] = secret;

    const payload = generateBackup();
    const response = await fetch(`${upstream}/api/restore`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        ok: false,
        error: '同步到云端失败',
        detail: text.slice(0, 500),
      });
    }

    const result = await response.json();
    if (!result || result.ok === false) {
      return res.status(502).json({
        ok: false,
        error: result && result.error ? result.error : '云端返回异常',
      });
    }

    res.json({
      ok: true,
      output: '已完成本地数据同步到云端',
      restored: Number(result.restored || 0),
      logs: Number(result.logs || 0),
      upstream,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/cloud-data-sync-to-local', async (req, res) => {
  if (APP_ROLE !== 'local') {
    return res.status(403).json({ ok: false, error: '该接口仅允许本地实例调用' });
  }
  try {
    const sourceFile = String(process.env.BACKUP_SOURCE_FILE || '').trim();
    let payload;
    if (sourceFile && fs.existsSync(sourceFile)) {
      payload = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    } else {
      const upstream = String(process.env.BACKUP_SERVER_URL || 'http://47.245.92.187:3751').replace(/\/$/, '');
      const headers = {};
      const key = String(process.env.BACKUP_API_KEY || '').trim();
      if (key) headers['x-api-key'] = key;
      const response = await fetch(`${upstream}/api/backup`, { headers });
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ ok: false, error: '云端备份下载失败', detail: text.slice(0, 500) });
      }
      payload = await response.json();
    }
    const result = restoreBackupData(payload);
    res.json({ ok: true, output: `已完成云端数据同步到本地（仅同步数据）`, restored: result.restored, logs: result.logs });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(ROOT, 'index.html'));
    return;
  }
  res.status(404).json({ ok: false, error: '接口不存在' });
});

const server = app.listen(PORT, HOST, () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`产品保质期本地服务已启动: http://${HOST}:${PORT}`);
});

server.on('error', (error) => {
  console.error('本地服务启动失败:', error.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`收到 ${signal}，正在关闭产品保质期本地服务...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
