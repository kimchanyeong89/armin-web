/**
 * patch.mjs — src/data/exhibitions.js 를 안전하게 부분 수정한다.
 *
 * 왜 텍스트 스플라이싱인가:
 *   파일 전체를 import 해서 다시 직렬화하면 7천 줄 전체가 diff 로 잡히고
 *   주석·수작업 서식이 모두 사라진다. 그래서 건드릴 배열의 문자 범위만
 *   정확히 찾아 갈아끼운다. 나머지 바이트는 그대로 보존된다.
 *
 * 문자열/주석을 인식하는 스캐너를 쓰므로 값 안에 들어 있는 괄호
 * (예: description 의 "(1916–2002)")에 속지 않는다.
 */

/**
 * 문자열·주석을 건너뛰며 openIndex 의 괄호와 짝이 되는 위치를 찾는다.
 * @returns 짝이 되는 닫는 괄호의 인덱스, 없으면 -1
 */
export function findMatchingBracket(text, openIndex) {
  const open = text[openIndex];
  const close = { '{': '}', '[': ']', '(': ')' }[open];
  if (!close) throw new Error(`괄호가 아님: ${open} @${openIndex}`);

  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];

    // 주석 건너뛰기
    if (ch === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i);
      if (i === -1) return -1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) return -1;
      i += 1;
      continue;
    }

    // 문자열 건너뛰기
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === quote) break;
        i++;
      }
      continue;
    }

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * exhibitions 배열의 최상위 미술관 블록들을 찾는다.
 * @returns {Array<{id:string, start:number, end:number}>} end 는 닫는 '}' 의 인덱스
 */
export function parseMuseumBlocks(text) {
  const arrStart = text.indexOf('[', text.indexOf('export const exhibitions'));
  if (arrStart === -1) throw new Error('exhibitions 배열을 찾지 못했습니다');
  const arrEnd = findMatchingBracket(text, arrStart);
  if (arrEnd === -1) throw new Error('exhibitions 배열이 닫히지 않았습니다');

  const blocks = [];
  let i = arrStart + 1;
  while (i < arrEnd) {
    const ch = text[i];

    // 주석을 먼저 건너뛴다. 블록 사이에는 `// Musée de l'Armée` 같은 주석이 있고,
    // 그 안의 아포스트로피를 문자열 시작으로 오인하면 뒤따르는 블록을 통째로 삼킨다.
    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? arrEnd : nl + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close === -1 ? arrEnd : close + 2;
      continue;
    }

    if (ch === '{') {
      const end = findMatchingBracket(text, i);
      if (end === -1) throw new Error(`미술관 블록이 닫히지 않았습니다 @${i}`);
      const body = text.slice(i, end + 1);
      const idMatch = /\bid\s*:\s*"([^"]+)"/.exec(body);
      blocks.push({ id: idMatch ? idMatch[1] : '', start: i, end });
      i = end + 1;
      continue;
    }

    // 문자열은 최상위 배열에 없지만 방어적으로 처리
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < arrEnd && text[i] !== quote) i += text[i] === '\\' ? 2 : 1;
    }
    i++;
  }
  return blocks;
}

/**
 * 미술관 블록 안에서 `key: [ ... ]` 배열의 범위를 찾는다.
 * @returns {{open:number, close:number}|null} open='[' 인덱스, close=']' 인덱스
 */
export function findArrayRange(text, block, key) {
  const re = new RegExp(`\\b${key}\\s*:\\s*\\[`);
  const slice = text.slice(block.start, block.end + 1);
  const m = re.exec(slice);
  if (!m) return null;
  const open = block.start + m.index + m[0].length - 1;
  const close = findMatchingBracket(text, open);
  if (close === -1) return null;
  return { open, close };
}

// ── 직렬화 ──────────────────────────────────────────────────────

/** JS 문자열 리터럴로 안전하게 감싼다. */
function jsString(value) {
  return JSON.stringify(String(value ?? ''));
}

/** exhibitions.js 가 쓰는 전시 객체 필드 순서 */
const FIELD_ORDER = [
  'id',
  'title',
  'titleEn',
  'description',
  'descriptionEn',
  'venue',
  'startDate',
  'endDate',
  'coverImage',
  'officialUrl',
  'status',
];

/**
 * 전시 객체 하나를 파일 스타일에 맞는 소스 문자열로 만든다.
 * @param {object} ex
 * @param {string} indent 객체 자체의 들여쓰기 (보통 6칸)
 */
export function serializeExhibition(ex, indent = '      ') {
  const inner = indent + '  ';
  const lines = [];
  for (const key of FIELD_ORDER) {
    const v = ex[key];
    if (v === undefined || v === null || v === '') continue;
    lines.push(`${inner}${key}: ${jsString(v)}`);
  }
  // 스키마에 없는 추가 필드도 잃지 않는다
  for (const [key, v] of Object.entries(ex)) {
    if (FIELD_ORDER.includes(key)) continue;
    if (v === undefined || v === null || v === '') continue;
    lines.push(`${inner}${key}: ${typeof v === 'string' ? jsString(v) : JSON.stringify(v)}`);
  }
  return `${indent}{\n${lines.join(',\n')}\n${indent}}`;
}

/** 전시 배열 전체를 `[ ... ]` 본문으로 직렬화한다 (대괄호 포함). */
export function serializeExhibitionArray(list, indent = '    ') {
  if (!list.length) return '[]';
  const items = list.map((ex) => serializeExhibition(ex, indent + '  ')).join(',\n');
  return `[\n${items}\n${indent}]`;
}

/**
 * 한 미술관의 특정 배열(temporaryExhibitions / pastExhibitions)을 교체한다.
 * @returns {string} 수정된 전체 파일 텍스트
 */
export function replaceExhibitionArray(text, museumId, key, list) {
  const blocks = parseMuseumBlocks(text);
  const block = blocks.find((b) => b.id === museumId);
  if (!block) throw new Error(`미술관 블록을 찾지 못했습니다: ${museumId}`);

  const range = findArrayRange(text, block, key);
  if (!range) throw new Error(`${museumId} 에 ${key} 배열이 없습니다`);

  // 배열이 시작하는 줄의 들여쓰기를 그대로 따른다
  const lineStart = text.lastIndexOf('\n', range.open) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart, range.open))[0];

  const replacement = serializeExhibitionArray(list, indent);
  return text.slice(0, range.open) + replacement + text.slice(range.close + 1);
}

/** 한 미술관의 현재 전시 배열을 읽어 객체 배열로 돌려준다 (값 확인용). */
export function readExhibitionArray(text, museumId, key) {
  const blocks = parseMuseumBlocks(text);
  const block = blocks.find((b) => b.id === museumId);
  if (!block) return null;
  const range = findArrayRange(text, block, key);
  if (!range) return null;
  return text.slice(range.open, range.close + 1);
}
