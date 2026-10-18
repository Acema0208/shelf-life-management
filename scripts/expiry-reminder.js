#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { getDb, closeDb } = require('../db');

const ROOT = path.join(__dirname, '..');
const FEISHU_CONFIG_PATH = path.join(ROOT, 'config', 'feishu.json');
const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 200;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    test: false,
    days: DEFAULT_DAYS,
    limit: DEFAULT_LIMIT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--dry-run') args.dryRun = true;
    if (item === '--test') args.test = true;
    if (item === '--days' && argv[i + 1]) args.days = Math.max(0, Number(argv[i + 1]) || DEFAULT_DAYS);
    if (item === '--limit' && argv[i + 1]) args.limit = Math.max(1, Number(argv[i + 1]) || DEFAULT_LIMIT);
  }
  return args;
}

function loadFeishuConfig(testMode) {
  let fileConfig = {};
  if (fs.existsSync(FEISHU_CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(FEISHU_CONFIG_PATH, 'utf8'));
    } catch (error) {
      throw new Error(`飞书配置解析失败: ${error.message}`);
    }
  }

  const enabled = String(process.env.FEISHU_ENABLED || fileConfig.enabled || '').trim();
  const webhookUrl = String(
    process.env.FEISHU_WEBHOOK_URL
      || (testMode ? fileConfig.webhook_url_test : fileConfig.webhook_url)
      || fileConfig.webhook_url
      || '',
  ).trim();

  return {
    enabled: !['0', 'false', 'off'].includes(enabled.toLowerCase()),
    webhookUrl,
  };
}

function isPlaceholderWebhook(url) {
  return /\/hook\/(?:x{6,}|y{6,})$/i.test(String(url || '').trim());
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDays(dateStr) {
  const today = new Date(`${localDateString()}T00:00:00`);
  const target = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((target - today) / 86400000);
}

function queryReminderRows(days, limit) {
  const database = getDb();
  return database.prepare(`
    SELECT id, name, expiry_date, quantity, supplier, inventory_status, unit
    FROM products
    WHERE COALESCE(inventory_status, 'pending') != 'out'
      AND expiry_date IS NOT NULL
      AND expiry_date <= date('now','localtime', '+' || ? || ' day')
    ORDER BY expiry_date ASC, id ASC
    LIMIT ?
  `).all(days, limit);
}

function buildReminderText(rows, days) {
  const expired = [];
  const soon = [];

  rows.forEach((row) => {
    const d = diffDays(row.expiry_date);
    const supplier = row.supplier ? `${row.supplier} | ` : '';
    const qty = Number(row.quantity || 0);
    const unit = String(row.unit || '').trim();
    const qtyText = qty > 0 ? `${qty}${unit}` : '-';
    const base = `- ${supplier}${row.name}（到期 ${row.expiry_date}，数量 ${qtyText}）`;
    if (d < 0) {
      expired.push(base);
    } else {
      soon.push(base);
    }
  });

  const lines = [
    `【保质期提醒】${localDateString()}`,
    `统计范围：未来 ${days} 天内到期（已排除“已出库”）`,
    `已过期：${expired.length} 条`,
    `即将到期：${soon.length} 条`,
  ];

  if (expired.length) {
    lines.push('');
    lines.push('【已过期】');
    lines.push(...expired.slice(0, 80));
  }
  if (soon.length) {
    lines.push('');
    lines.push(`【${days}天内到期】`);
    lines.push(...soon.slice(0, 120));
  }

  const omitted = Math.max(0, rows.length - expired.slice(0, 80).length - soon.slice(0, 120).length);
  if (omitted > 0) {
    lines.push('');
    lines.push(`其余 ${omitted} 条未展示，请在系统中查看完整列表。`);
  }

  return lines.join('\n');
}

function postJson(urlString, payload) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (error) {
      reject(new Error(`Webhook URL 无效: ${urlString}`));
      return;
    }

    const body = JSON.stringify(payload);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'POST',
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 12000,
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (error) {
            parsed = null;
          }

          if (parsed && typeof parsed === 'object') {
            const code = Number(parsed.code);
            if (!Number.isNaN(code) && code !== 0) {
              reject(new Error(`飞书业务返回失败: code=${code}, msg=${parsed.msg || parsed.message || raw}`));
              return;
            }
            if (parsed.StatusCode && Number(parsed.StatusCode) !== 0) {
              reject(new Error(`飞书业务返回失败: StatusCode=${parsed.StatusCode}, StatusMessage=${parsed.StatusMessage || raw}`));
              return;
            }
          }

          resolve(raw);
        } else {
          reject(new Error(`飞书返回非成功状态: HTTP ${res.statusCode}, body=${raw}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('请求飞书超时'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { enabled, webhookUrl } = loadFeishuConfig(args.test);

  if (!enabled) {
    console.log('飞书提醒已禁用（FEISHU_ENABLED=false 或 config.enabled=false）。');
    return;
  }

  if (!webhookUrl) {
    throw new Error(`未找到 webhook 配置，请设置 ${FEISHU_CONFIG_PATH} 或环境变量 FEISHU_WEBHOOK_URL`);
  }

  if (isPlaceholderWebhook(webhookUrl)) {
    throw new Error(`当前 webhook 仍是示例值，请先更新 ${FEISHU_CONFIG_PATH}`);
  }

  const rows = queryReminderRows(args.days, args.limit);
  if (!rows.length) {
    console.log(`无需提醒：未来 ${args.days} 天内没有待出库的临期/过期产品。`);
    return;
  }

  const text = buildReminderText(rows, args.days);
  if (args.dryRun) {
    console.log('[dry-run] 将发送以下提醒内容：\n');
    console.log(text);
    return;
  }

  await postJson(webhookUrl, {
    msg_type: 'text',
    content: { text },
  });
  console.log(`飞书提醒发送成功：共 ${rows.length} 条（days=${args.days}, test=${args.test ? 'yes' : 'no'}）`);
}

main()
  .catch((error) => {
    console.error(`飞书提醒执行失败: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDb();
  });
