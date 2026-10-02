#!/usr/bin/env node
/**
 * sync.mjs — 국내 미술관 전시 정보를 수집해 src/data/exhibitions.js 를 갱신한다.
 *
 * 사용법:
 *   node scripts/exhibitions/sync.mjs                 # 전체 수집 + 파일 반영
 *   node scripts/exhibitions/sync.mjs --dry-run       # 파일을 쓰지 않고 결과만 출력
 *   node scripts/exhibitions/sync.mjs --source mmca   # 특정 소스만
 *   node scripts/exhibitions/sync.mjs --museum leeum-museum
 *   node scripts/exhibitions/sync.mjs --no-images     # 포스터 업로드 생략 (파싱 점검용)
 *   node scripts/exhibitions/sync.mjs --no-new       # 기존 전시 갱신만 (신규 추가 보류)
 *   node scripts/exhibitions/sync.mjs --no-details   # 상세 페이지 보강 생략 (빠른 점검용)
 *   node scripts/exhibitions/sync.mjs --report out.json --summary out.md
 *
 * 안전 규칙:
 *   - 어떤 미술관의 수집 결과가 0건이면 그 미술관 데이터는 건드리지 않는다.
 *   - 포스터 업로드 실패 시 기존 coverImage 를 유지한다.
 *   - 최종 파일은 import 로 파싱 검증한 뒤에만 저장한다.
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { detailsFromHtml, foreignVenueOf } from './lib/extract.mjs';
import { getHtml } from './lib/http.mjs';
import { checkPoster, ensurePoster, isR2Url } from './lib/images.mjs';
import { findMissingFields, makeExhibitionId, mergeMuseum } from './lib/merge.mjs';
import { todayKST } from './lib/parse.mjs';
import { replaceExhibitionArray } from './lib/patch.mjs';
import { MUSEUM_LABELS, SOURCES, sourceByKey } from './sources/index.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const EXHIBITIONS_JS = join(ROOT, 'src/data/exhibitions.js');

// ── CLI ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const getOpt = (name) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

const DRY_RUN = hasFlag('dry-run');
const NO_IMAGES = hasFlag('no-images');
const ONLY_SOURCE = getOpt('source');
const ONLY_MUSEUM = getOpt('museum');
const NO_NEW = hasFlag('no-new');
const NO_DETAILS = hasFlag('no-details');
const REPORT_PATH = getOpt('report');
const SUMMARY_PATH = getOpt('summary');
const TODAY = getOpt('today') || todayKST();

const log = (...args) => console.log(...args);

// ── 수집 ────────────────────────────────────────────────────────

/** 카드에 안정적인 전시 id 를 부여한다. */
function withId(card) {
  const hash = createHash('sha1')
    .update(`${card.museumId}|${card.title}|${card.startDate}`)
    .digest('hex')
    .slice(0, 8);
  return { ...card, id: card.id || makeExhibitionId(card, hash) };
}

/** 다른 기관 행사가 섞여 들어온 카드를 걸러낸다 (판별 규칙은 foreignVenueOf). */
function dropForeignVenues(cards, report) {
  return cards.filter((card) => {
    const looksLike = foreignVenueOf(card);
    if (looksLike) {
      report.foreignVenue.push({ museumId: card.museumId, title: card.title, looksLike });
      log(`  · 다른 기관 행사로 판단해 제외 [${card.museumId}] ${card.title.slice(0, 34)}`);
      return false;
    }
    return true;
  });
}

/** 같은 미술관 안에서 제목+시작일이 겹치는 카드를 제거한다. */
function dedupe(cards) {
  const seen = new Set();
  return cards.filter((c) => {
    const key = `${c.museumId}|${c.title}|${c.startDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function collect() {
  const sources = ONLY_SOURCE ? [sourceByKey(ONLY_SOURCE)].filter(Boolean) : SOURCES;
  if (ONLY_SOURCE && !sources.length) throw new Error(`알 수 없는 소스: ${ONLY_SOURCE}`);

  const all = [];
  const sourceStatus = [];

  for (const source of sources) {
    if (ONLY_MUSEUM && !source.museums.includes(ONLY_MUSEUM)) continue;
    log(`\n📍 ${source.label} (${source.key})`);
    const started = Date.now();
    try {
      const cards = (await source.fetch({ log })) || [];
      const valid = cards.filter((c) => c.title && c.startDate && c.museumId);
      log(`  → ${valid.length}건 수집 (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      all.push(...valid);
      sourceStatus.push({ key: source.key, label: source.label, count: valid.length, ok: valid.length > 0 });
    } catch (err) {
      log(`  ✗ 실패: ${err.message}`);
      sourceStatus.push({ key: source.key, label: source.label, count: 0, ok: false, error: err.message });
    }
  }

  return { cards: dedupe(all.map(withId)), sourceStatus };
}

// ── 상세 보강 ───────────────────────────────────────────────────

/** 배열을 제한된 동시성으로 처리한다. */
async function mapPool(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

/**
 * 목록에 없는 소개문·포스터를 상세 페이지에서 보강한다.
 *
 * 소개문은 소스에 describe(html) 가 있으면 그 결과를 먼저 쓰고, 없거나 빈 값이면
 * JSON-LD·og:description 으로 채운다. og:description 은 기관명·일정인 사이트가 많다.
 *
 * 주의: officialUrl 이 상세가 아니라 목록 페이지를 가리키면 사이트 공통 소개문이
 * 딸려 온다. 그래서 보강 후 같은 미술관 안에서 중복되는 소개문은 지운다.
 */
async function enrichDetails(cards, report) {
  const targets = cards.filter((c) => c.officialUrl && (!c.description || !c.posterUrl));
  if (!targets.length) return;

  log(`\n🔎 상세 페이지 보강 (${targets.length}건)...`);
  await mapPool(targets, Number(process.env.ARMIN_DETAIL_CONCURRENCY || 4), async (card) => {
    try {
      const html = await getHtml(card.officialUrl, { referer: card.posterReferer, retries: 1 });
      const d = detailsFromHtml(html, card.officialUrl);
      // 미술관 id 는 소스 하나에만 속한다
      const describe = SOURCES.find((s) => s.museums.includes(card.museumId))?.describe;
      const description = describe?.(html) || d.description;
      if (!card.description && description) card.description = description;
      // 상세 대표 이미지는 어댑터가 준 이미지가 검사에서 탈락할 때 쓰는 예비 후보다
      if (d.posterUrl) card.posterCandidates = [...(card.posterCandidates || []), d.posterUrl];
      if (!card.endDate && d.endDate) card.endDate = d.endDate;
      report.details.enriched.push({ museumId: card.museumId, title: card.title });
    } catch (err) {
      report.details.failed.push({ museumId: card.museumId, title: card.title, error: err.message });
    }
  });

  // 미술관별로 중복되는 소개문은 사이트 공통 문구로 보고 버린다
  const byMuseum = new Map();
  for (const c of cards) {
    if (!c.description) continue;
    if (!byMuseum.has(c.museumId)) byMuseum.set(c.museumId, new Map());
    const counts = byMuseum.get(c.museumId);
    counts.set(c.description, (counts.get(c.description) || 0) + 1);
  }
  let dropped = 0;
  for (const c of cards) {
    if (!c.description) continue;
    if (byMuseum.get(c.museumId)?.get(c.description) > 1) {
      c.description = '';
      dropped++;
    }
  }
  if (dropped) log(`  · 사이트 공통 문구로 판단해 소개문 ${dropped}건 제거`);
  report.details.genericDropped = dropped;
}

// ── 포스터 ──────────────────────────────────────────────────────

/**
 * 카드마다 포스터 후보(어댑터가 준 이미지 → 상세 페이지 대표 이미지)를 실제로 내려받아
 * 검사하고, 통과한 첫 이미지만 R2 에 올린다. dry-run 에서도 검사는 한다.
 * 서로 다른 전시가 똑같은 이미지를 쓰면 로고·기본 이미지로 보고 버린다.
 */
async function attachPosters(cards, report) {
  const chosen = new Map(); // card → { url, hash }
  for (const card of cards) {
    const candidates = [...new Set([card.posterUrl, ...(card.posterCandidates || [])].filter(Boolean))];
    if (!candidates.length) {
      report.posters.missing.push({ museumId: card.museumId, title: card.title });
      continue;
    }
    if (NO_IMAGES) continue;
    const reasons = [];
    for (const url of candidates) {
      const verdict = await checkPoster(url, { referer: card.posterReferer });
      if (verdict.ok) {
        chosen.set(card, { url, hash: verdict.hash, bytes: verdict.bytes, format: verdict.format });
        break;
      }
      reasons.push(verdict.reason);
    }
    if (!chosen.has(card)) rejectPoster(card, reasons, report);
  }

  const owners = new Map();
  for (const { hash } of chosen.values()) owners.set(hash, (owners.get(hash) || 0) + 1);
  for (const [card, { hash }] of [...chosen]) {
    if (owners.get(hash) > 1) {
      chosen.delete(card);
      rejectPoster(card, ['여러 전시가 같은 이미지를 씀'], report);
    }
  }

  for (const [card, { url: srcUrl, bytes, format }] of chosen) {
    try {
      const { url, cached } = await ensurePoster(srcUrl, {
        exhibitionId: card.id,
        referer: card.posterReferer,
        dryRun: DRY_RUN,
        bytes,
        format,
      });
      // 업로드는 됐는데 URL 을 우리가 못 받아들이면 coverImage 가 비고,
      // 앱은 포스터 없는 전시를 아예 표시하지 않는다. 조용히 넘기면 안 된다.
      if (!isR2Url(url)) {
        throw new Error(`업로드는 됐으나 허용되지 않는 URL: ${url}`);
      }
      card.coverImage = url;
      report.posters[cached ? 'cached' : 'uploaded'].push({ museumId: card.museumId, title: card.title, url });
    } catch (err) {
      report.posters.failed.push({ museumId: card.museumId, title: card.title, error: err.message });
      log(`  ⚠ 포스터 실패 [${card.museumId}] ${card.title.slice(0, 30)} — ${err.message}`);
    }
  }
}

function rejectPoster(card, reasons, report) {
  report.posters.rejected.push({ museumId: card.museumId, title: card.title, reasons });
  log(`  ⚠ 포스터 탈락 [${card.museumId}] ${card.title.slice(0, 30)} — ${reasons.join(' / ')}`);
}

// ── 반영 ────────────────────────────────────────────────────────

/** 패치된 소스가 실제로 파싱되는지 임시 파일에 import 해 검증한다. */
async function validate(text) {
  const dir = mkdtempSync(join(tmpdir(), 'armin-exh-'));
  const file = join(dir, 'exhibitions.check.mjs');
  writeFileSync(file, text, 'utf8');
  const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
  if (!Array.isArray(mod.exhibitions)) throw new Error('exhibitions 배열이 아닙니다');
  return mod.exhibitions;
}

/** 리포트를 PR 본문/Job Summary 용 마크다운으로 만든다. */
function renderSummary(report) {
  const lines = [];
  const count = (t) => report.changes.filter((c) => c.type === t).length;

  lines.push(`## 🎨 국내 미술관 전시 동기화 — ${report.today}`);
  lines.push('');
  lines.push(
    `**추가 ${count('added')}** · **갱신 ${count('updated')}** · ` +
      `**종료 보관 ${count('archived')}**` +
      (count('revived') ? ` · **재개 ${count('revived')}**` : '') +
      (count('pending-new') ? ` · **검토 대기(신규) ${count('pending-new')}**` : '')
  );
  lines.push('');

  lines.push('### 미술관별 현황');
  lines.push('');
  lines.push('| 미술관 | 수집 | 진행중 | 예정 | 상태 |');
  lines.push('|---|---:|---:|---:|---|');
  for (const m of report.museums) {
    if (m.status === 'not-found') {
      lines.push(`| ${m.museumId} | – | – | – | ⚠️ 데이터에 없음 |`);
      continue;
    }
    const state = m.sourceFailed ? '⚠️ 수집 실패 (기존 유지)' : '✅';
    lines.push(`| ${m.label} | ${m.scraped} | ${m.ongoing} | ${m.upcoming} | ${state} |`);
  }
  lines.push('');

  const failed = report.sources.filter((s) => !s.ok);
  if (failed.length) {
    lines.push('### ⚠️ 수집 실패 소스');
    lines.push('');
    for (const s of failed) lines.push(`- **${s.label}** (\`${s.key}\`)${s.error ? ` — ${s.error}` : ' — 결과 0건'}`);
    lines.push('');
    lines.push('> 실패한 미술관의 기존 전시 데이터는 그대로 유지했습니다.');
    lines.push('');
  }

  const added = report.changes.filter((c) => c.type === 'added' || c.type === 'pending-new');
  if (added.length) {
    lines.push(`### 신규 전시 ${added.length}건`);
    lines.push('');
    for (const c of added) lines.push(`- [${c.label || c.museumId}] ${c.title}`);
    lines.push('');
  }

  const archived = report.changes.filter((c) => c.type === 'archived');
  if (archived.length) {
    lines.push(`### 종료되어 보관된 전시 ${archived.length}건`);
    lines.push('');
    for (const c of archived) lines.push(`- [${c.label || c.museumId}] ${c.title}`);
    lines.push('');
  }

  lines.push('### 포스터');
  lines.push('');
  lines.push(
    `신규 업로드 ${report.posters.uploaded.length} · 기존 캐시 ${report.posters.cached.length} · ` +
      `실패 ${report.posters.failed.length} · 검사 탈락 ${report.posters.rejected.length} · ` +
      `원본 없음 ${report.posters.missing.length}`
  );
  lines.push('');
  if (report.posters.failed.length) {
    for (const p of report.posters.failed.slice(0, 15)) {
      lines.push(`- ❌ [${p.museumId}] ${p.title} — ${p.error}`);
    }
    lines.push('');
  }
  if (report.posters.rejected.length) {
    for (const p of report.posters.rejected.slice(0, 30)) {
      lines.push(`- 🚫 [${p.museumId}] ${p.title} — ${p.reasons.join(' / ')}`);
    }
    lines.push('');
  }
  const noPoster = report.changes.filter((c) => c.type === 'no-poster');
  if (noPoster.length) {
    lines.push(`포스터가 아직 없어 추가를 미룬 전시 ${noPoster.length}건 (포스터가 올라오면 다음 실행에서 추가됨)`);
    lines.push('');
    for (const c of noPoster.slice(0, 30)) lines.push(`- [${c.label || c.museumId}] ${c.title}`);
    lines.push('');
  }

  if (report.incomplete.length) {
    lines.push(`### ⚠️ 정보가 빠진 전시 ${report.incomplete.length}건`);
    lines.push('');
    lines.push('| 미술관 | 전시 | 빠진 항목 |');
    lines.push('|---|---|---|');
    for (const i of report.incomplete.slice(0, 30)) {
      lines.push(`| ${i.label} | ${i.title} | ${i.missing.join(', ')} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  log(`\n🎨 국내 미술관 전시 동기화 — 기준일 ${TODAY}`);
  if (DRY_RUN) log('   (dry-run: 파일을 쓰지 않습니다)');

  const report = {
    generatedAt: new Date().toISOString(),
    today: TODAY,
    dryRun: DRY_RUN,
    mode: NO_NEW ? 'update-only' : 'full',
    sources: [],
    museums: [],
    details: { enriched: [], failed: [], genericDropped: 0 },
    foreignVenue: [],
    posters: { uploaded: [], cached: [], failed: [], missing: [], rejected: [] },
    changes: [],
    incomplete: [],
  };

  const { cards: collected, sourceStatus } = await collect();
  report.sources = sourceStatus;
  const cards = dropForeignVenues(collected, report);
  log(`\n📦 총 ${cards.length}건 수집됨`);

  if (!NO_DETAILS) await enrichDetails(cards, report);

  log('\n🖼  포스터 확보 중...');
  await attachPosters(cards, report);

  // 미술관별로 묶는다
  const byMuseum = new Map();
  for (const card of cards) {
    if (!byMuseum.has(card.museumId)) byMuseum.set(card.museumId, []);
    byMuseum.get(card.museumId).push(card);
  }

  let text = readFileSync(EXHIBITIONS_JS, 'utf8');
  const original = text;
  const before = await validate(text);

  // 관리 대상 미술관 목록.
  // --museum/--source 로 범위를 좁힌 실행이 대상 밖 미술관까지 건드리면 안 된다.
  const scopedSources = ONLY_SOURCE ? [sourceByKey(ONLY_SOURCE)].filter(Boolean) : SOURCES;
  const managed = ONLY_MUSEUM
    ? [ONLY_MUSEUM]
    : [...new Set(scopedSources.flatMap((s) => s.museums))];

  log('\n📝 데이터 반영...');
  for (const museumId of managed) {
    const museum = before.find((m) => m.id === museumId);
    if (!museum) {
      log(`  ⚠ ${museumId}: exhibitions.js 에 없는 미술관 — 건너뜀`);
      report.museums.push({ museumId, status: 'not-found' });
      continue;
    }

    const label = MUSEUM_LABELS[museumId] || museumId;
    const found = byMuseum.get(museumId) || [];

    // 안전장치: 수집 0건이면 추가/갱신은 하지 않는다.
    // 다만 날짜만으로 판단 가능한 '종료 전시 이관'은 그대로 수행한다.
    const { temporary, past, changes } = mergeMuseum(
      museum.temporaryExhibitions || [],
      museum.pastExhibitions || [],
      found,
      { today: TODAY, museumId, allowNew: !NO_NEW, requirePoster: !NO_IMAGES }
    );

    if (found.length === 0) {
      log(`  · ${label}: 수집 0건 — 기존 데이터 유지 (종료 전시 정리만 적용)`);
    }

    text = replaceExhibitionArray(text, museumId, 'temporaryExhibitions', temporary);
    text = replaceExhibitionArray(text, museumId, 'pastExhibitions', past);

    const current = temporary.filter((e) => e.status === 'ongoing');
    const upcoming = temporary.filter((e) => e.status === 'upcoming');
    log(
      `  ✓ ${label}: 수집 ${found.length} → 진행 ${current.length} / 예정 ${upcoming.length} / 종료보관 ${past.length}` +
        (changes.length ? ` (변경 ${changes.length})` : '')
    );

    report.museums.push({
      museumId,
      label,
      scraped: found.length,
      ongoing: current.length,
      upcoming: upcoming.length,
      past: past.length,
      changes: changes.length,
      sourceFailed: found.length === 0,
    });
    report.changes.push(...changes.map((c) => ({ ...c, label })));

    // 정보 누락 점검
    for (const ex of temporary) {
      const missing = findMissingFields(ex);
      if (missing.length) {
        report.incomplete.push({ museumId, label, title: ex.title, missing });
      }
    }
  }

  // 검증 후 저장
  const after = await validate(text);
  if (after.length !== before.length) {
    throw new Error(`미술관 수가 달라졌습니다: ${before.length} → ${after.length}`);
  }

  const changed = text !== original;
  if (!changed) {
    log('\n✅ 변경 사항 없음');
  } else if (DRY_RUN) {
    log('\n✅ dry-run — 파일을 쓰지 않았습니다');
  } else {
    writeFileSync(EXHIBITIONS_JS, text, 'utf8');
    log(`\n✅ ${EXHIBITIONS_JS} 갱신 완료`);
  }
  report.fileChanged = changed && !DRY_RUN;

  // 요약
  log('\n── 요약 ──────────────────────────────');
  const failedSources = report.sources.filter((s) => !s.ok);
  log(`소스: ${report.sources.length - failedSources.length}/${report.sources.length} 성공`);
  if (failedSources.length) {
    log(`실패한 소스: ${failedSources.map((s) => s.label).join(', ')}`);
  }
  log(
    `포스터: 신규 ${report.posters.uploaded.length} / 캐시 ${report.posters.cached.length} / ` +
      `실패 ${report.posters.failed.length} / 탈락 ${report.posters.rejected.length} / ` +
      `원본없음 ${report.posters.missing.length}`
  );
  log(`변경: 추가 ${report.changes.filter((c) => c.type === 'added').length} / ` +
      `갱신 ${report.changes.filter((c) => c.type === 'updated').length} / ` +
      `종료보관 ${report.changes.filter((c) => c.type === 'archived').length} / ` +
      `포스터 없어 보류 ${report.changes.filter((c) => c.type === 'no-poster').length}`);
  if (report.incomplete.length) {
    log(`\n⚠ 정보가 빠진 전시 ${report.incomplete.length}건:`);
    for (const item of report.incomplete.slice(0, 20)) {
      log(`   [${item.label}] ${item.title.slice(0, 34)} — ${item.missing.join(', ')}`);
    }
  }

  if (SUMMARY_PATH) {
    writeFileSync(SUMMARY_PATH, renderSummary(report), 'utf8');
    log(`📄 요약 저장: ${SUMMARY_PATH}`);
  }

  if (REPORT_PATH) {
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    log(`\n📄 리포트 저장: ${REPORT_PATH}`);
  }

  // 모든 소스가 실패하면 비정상 종료로 알린다 (네트워크/차단 문제)
  if (failedSources.length === report.sources.length && report.sources.length > 0) {
    log('\n❌ 모든 소스 수집 실패 — 네트워크 또는 사이트 차단을 확인하세요');
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error('\n💥 동기화 실패:', err.message);
  console.error(err.stack);
  process.exit(1);
});
