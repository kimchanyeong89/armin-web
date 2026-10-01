#!/usr/bin/env node
/**
 * upload-proposals.mjs — 그 주의 후보 묶음(public/data/weekly-proposals/<주>.json)을 워커에 올린다.
 *
 * 편집자는 colly.one/admin/weekly 에서 후보를 보고 하나를 골라 발행한다. 이 스크립트는 올리기만 하고
 * 발행하지 않는다. 카드마다 제목·소개(한·영)와 작품 캡션이 다 써져 있어야 올라간다.
 *
 * 사용법:
 *   node scripts/weekly/upload-proposals.mjs --week 2026-W41
 *   node scripts/weekly/upload-proposals.mjs --week 2026-W41 --dry-run   # 검사만
 *   node scripts/weekly/upload-proposals.mjs --week 2026-W41 --force     # 이미 올린 주를 바꾼다
 *
 * 인증: workers/semantic-search/.env 의 ADMIN_TOKEN (또는 환경 변수 TASTE_ADMIN_TOKEN).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const WORKER = process.env.TASTE_WORKER_URL || 'https://armin-semantic-search.armin-art.workers.dev';
const argv = process.argv.slice(2);
const week = argv[argv.indexOf('--week') + 1];
const DRY_RUN = argv.includes('--dry-run');
const FORCE = argv.includes('--force');

function adminToken() {
  if (process.env.TASTE_ADMIN_TOKEN) return process.env.TASTE_ADMIN_TOKEN;
  const file = join(ROOT, 'workers/semantic-search/.env');
  const line = existsSync(file) && readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_TOKEN='));
  return line ? line.slice('ADMIN_TOKEN='.length).trim() : '';
}

/** What is still missing before the editor can read a card; empty when it is ready. */
function missing(card) {
  const gaps = ['title_ko', 'title_en', 'intro_ko', 'intro_en', 'subtitle_chip'].filter((k) => !String(card[k] || '').trim());
  const bare = (card.works || []).filter((w) => !String(w.caption_ko || '').trim() || !String(w.caption_en || '').trim()).length;
  if (!card.works?.length) gaps.push('works');
  if (bare) gaps.push(`${bare} captions`);
  return gaps;
}

async function main() {
  if (!/^\d{4}-W\d{2}$/.test(week || '')) throw new Error('usage: --week YYYY-Www [--dry-run] [--force]');
  const path = join(ROOT, 'public/data/weekly-proposals', `${week}.json`);
  const pool = JSON.parse(readFileSync(path, 'utf8'));
  if (pool.week !== week) throw new Error(`${path} is for ${pool.week}`);
  if (!pool.cards?.length) throw new Error('no cards');
  const ids = new Set();
  let problems = 0;
  for (const card of pool.cards) {
    if (ids.has(card.id)) { console.error(`  duplicate id ${card.id}`); problems++; }
    ids.add(card.id);
    const gaps = missing(card);
    if (gaps.length) { console.error(`  ${card.id}: missing ${gaps.join(', ')}`); problems++; }
  }
  if (problems) throw new Error(`${problems} card(s) not ready — nothing uploaded`);
  console.log(`${week}: ${pool.cards.length} cards ready`);
  if (DRY_RUN) return;

  const token = adminToken();
  if (!token) throw new Error('no ADMIN_TOKEN (workers/semantic-search/.env or TASTE_ADMIN_TOKEN)');
  const res = await fetch(`${WORKER}/weekly-proposals?week=${week}${FORCE ? '&force=1' : ''}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify(pool),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload failed ${res.status}: ${text}`);
  console.log(`uploaded: ${text}`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
