#!/usr/bin/env node
/**
 * codex-artist-ko-names.mjs — build-artist-ko-names.mts 가 내보낸 이름(--export)을 codex CLI 에 맡겨
 * 한국어 표기로 옮긴다. 규칙은 artist-ko-names-rules.md 그대로. 묶음마다 답 파일을 남겨 이어하기가 된다.
 *
 *   npx tsx scripts/i18n/build-artist-ko-names.mts --export /tmp/todo.json
 *   node scripts/i18n/codex-artist-ko-names.mjs /tmp/todo.json /tmp/out [--parallel 6] [--chunk 250]
 *   npx tsx scripts/i18n/build-artist-ko-names.mts --import /tmp/out/answers.json
 *
 * 10/8 시험: gpt-6-astra, 추론 high 가 250명에 2분·공식 이름 일치율이 Claude 와 같았다(xhigh 는 10분, 차이 없음).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const [todoFile, outDir] = process.argv.slice(2);
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const PARALLEL = Number(arg('--parallel', 6));
const CHUNK = Number(arg('--chunk', 250));
const CODEX = arg('--codex', `${process.env.HOME}/.codex/plugins/.plugin-appserver/codex-cli/bin/codex`);
const RULES = readFileSync(join(ROOT, 'scripts/i18n/artist-ko-names-rules.md'), 'utf8').trim();
const todo = JSON.parse(readFileSync(todoFile, 'utf8'));
mkdirSync(outDir, { recursive: true });

const task = (items) => `미술관 소장품의 작가 이름 칸에 적힌 값 ${items.length}개를 한국어 표기로 옮기는 작업이다.

입력은 아래 JSON 배열 [{"i":번호,"n":이름,"m":소장 미술관(출신 언어를 짐작하는 단서, 비어 있을 수 있음)}] 이다.
출력은 같은 번호의 [{"i":번호,"ko":"한국어 표기"}] JSON 배열 하나뿐이다. ${items.length}개 번호를 빠짐없이 돌려준다. 설명·머리말·코드 울타리를 붙이지 않는다.
웹 검색이나 스크립트를 쓰지 말고, 이름 하나하나를 직접 판단해서 적는다.

규칙:
${RULES}

입력:
${JSON.stringify(items)}
`;

/** one chunk through codex → { key: Korean } for the numbers it answered */
function ask(part, n) {
  return new Promise((done) => {
    const last = join(outDir, `${n}.last.txt`);
    const child = spawn(CODEX, ['exec', '-m', 'gpt-6-astra', '-c', 'model_reasoning_effort="high"', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-C', outDir, '-o', last, '-'], { stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), 15 * 60 * 1000);
    child.stdin.end(task(part.map((a, i) => ({ i, n: a.n, m: a.m }))));
    child.on('close', () => {
      clearTimeout(timer);
      const answers = {};
      try {
        const text = readFileSync(last, 'utf8').trim().replace(/^```(?:json)?|```$/gm, '').trim();
        for (const row of JSON.parse(text)) if (Number.isInteger(row?.i) && part[row.i]) answers[part[row.i].key] = String(row.ko ?? '');
      } catch { /* an unreadable answer is an empty one: the chunk is asked again on the next run */ }
      done(answers);
    });
  });
}

const chunks = [];
for (let i = 0; i < todo.length; i += CHUNK) chunks.push(todo.slice(i, i + CHUNK));
let next = 0, failures = 0, names = 0;
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  /* five empty answers in a row: the quota is spent or codex is down - stop and leave the rest for the next run */
  while (next < chunks.length && failures < 5) {
    const n = next++;
    const file = join(outDir, `${n}.json`);
    if (existsSync(file)) { names += Object.keys(JSON.parse(readFileSync(file, 'utf8'))).length; continue; }
    const answers = await ask(chunks[n], n);
    const got = Object.keys(answers).length;
    if (got < chunks[n].length * 0.9) { failures++; console.log(`chunk ${n}: only ${got}/${chunks[n].length}, not kept`); continue; }
    failures = 0;
    names += got;
    writeFileSync(file, JSON.stringify(answers));
    console.log(`${new Date().toTimeString().slice(0, 8)} chunk ${n + 1}/${chunks.length} kept, ${names} names so far`);
  }
}));
const all = {};
for (let n = 0; n < chunks.length; n += 1) { const file = join(outDir, `${n}.json`); if (existsSync(file)) Object.assign(all, JSON.parse(readFileSync(file, 'utf8'))); }
writeFileSync(join(outDir, 'answers.json'), JSON.stringify(all));
console.log(`${Object.keys(all).length} of ${todo.length} names in ${join(outDir, 'answers.json')}${failures >= 5 ? ' (stopped: five empty answers in a row)' : ''}`);
