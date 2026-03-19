#!/usr/bin/env node
// mah-live-dashboard.cjs — Shows live MAH scraper progress every 3 seconds
const fs = require('fs');
const path = require('path');

const OUTPUT = path.resolve(__dirname, '../public/data/mah-collection.json');
const LOG = path.resolve(__dirname, '../logs/mah-bg.log');
const PROGRESS = path.resolve(__dirname, '../downloads/mah-progress.json');

function clear() { process.stdout.write('\x1B[2J\x1B[0f'); }

function getProgress() {
  let savedCount = 0;
  let progressCount = 0;
  try { const d = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); savedCount = Array.isArray(d) ? d.length : 0; } catch {}
  try { const p = JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); progressCount = (p.items || []).length; } catch {}
  return { savedCount, progressCount };
}

function getLastLog(n = 8) {
  try {
    const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n');
    return lines.slice(-n).join('\n');
  } catch { return '(no log)'; }
}

function bar(current, total, width = 30) {
  if (!total) return '[' + ' '.repeat(width) + ']';
  const pct = Math.min(1, current / total);
  const filled = Math.round(pct * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + '] ' + (pct * 100).toFixed(1) + '%';
}

function dashboard() {
  clear();
  const { savedCount, progressCount } = getProgress();
  const current = Math.max(savedCount, progressCount);
  const total = 3223;
  
  const now = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║          MAH (Musée d\'Art et d\'Histoire) 스크래퍼      ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  시간: ${now}`);
  console.log(`  저장됨 (output): ${savedCount.toLocaleString()} 건`);
  console.log(`  진행중 (progress): ${progressCount.toLocaleString()} 건`);
  console.log(`  목표: ${total.toLocaleString()} 건`);
  console.log('');
  console.log('  ' + bar(current, total));
  console.log('');
  console.log('  ─── 최근 로그 ───────────────────────────────────');
  getLastLog(8).split('\n').forEach(l => console.log('  ' + l));
  console.log('');
  console.log('  Ctrl+C 로 종료');
}

dashboard();
setInterval(dashboard, 3000);
