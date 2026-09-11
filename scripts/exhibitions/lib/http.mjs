/**
 * http.mjs — 의존성 없는 HTTP 헬퍼 (Node 18+ 내장 fetch 사용)
 *
 * 한국 미술관 사이트 특성상 다음이 필요하다:
 *   - 브라우저 UA (봇 차단 회피)
 *   - Referer 헤더 (hotlink/직접접근 차단 회피)
 *   - EUC-KR 응답 디코딩 (구형 JSP/ASP 사이트)
 *   - 일시적 장애에 대한 재시도
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT = Number(process.env.ARMIN_HTTP_TIMEOUT || 20000);
// CI/점검 실행에서 재시도 횟수를 줄일 수 있게 환경변수로 뺀다.
const DEFAULT_RETRIES = Number(process.env.ARMIN_HTTP_RETRIES ?? 3);

/** 재시도할 가치가 있는 오류인지 (일시적 네트워크/서버 장애) */
function isRetryable(err, status) {
  if (status) return status === 408 || status === 429 || status >= 500;

  // 도메인이 없거나 연결이 거부되면 다시 걸어도 결과가 같다.
  // (사라진 미술관 도메인에 재시도 3회를 쓰면 실행이 100초씩 늘어난다)
  const code = err?.cause?.code || err?.code || '';
  if (/ENOTFOUND|ECONNREFUSED|ERR_TLS_CERT_ALTNAME_INVALID|CERT_/i.test(String(code))) return false;

  const msg = String(err?.message || err);
  return /timeout|aborted|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed/i.test(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * charset 을 고려해 응답 본문을 문자열로 디코딩한다.
 * 구형 한국 사이트는 EUC-KR(=CP949)을 쓰는 경우가 있어 meta 태그까지 확인한다.
 */
async function decodeBody(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  const ctHeader = res.headers.get('content-type') || '';

  let charset = /charset=["']?([\w-]+)/i.exec(ctHeader)?.[1];

  if (!charset) {
    // 헤더에 없으면 <meta charset> / <meta http-equiv> 를 본다 (ASCII 영역이라 latin1 로 안전하게 훑음)
    const head = buf.subarray(0, 2048).toString('latin1');
    charset =
      /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ||
      /content=["'][^"']*charset=([\w-]+)/i.exec(head)?.[1];
  }

  const normalized = (charset || 'utf-8').toLowerCase();
  if (normalized === 'euc-kr' || normalized === 'ks_c_5601-1987' || normalized === 'cp949' || normalized === 'windows-949') {
    // Node 내장 TextDecoder 는 ICU 빌드에서 euc-kr 을 지원한다.
    try {
      return new TextDecoder('euc-kr').decode(buf);
    } catch {
      return buf.toString('utf8'); // ICU 미포함 빌드 대비
    }
  }
  return buf.toString('utf8');
}

/**
 * 재시도 + 타임아웃이 붙은 fetch.
 * @returns {Promise<{ok:boolean, status:number, text:string, url:string, headers:Headers}>}
 */
export async function request(url, opts = {}) {
  const {
    referer,
    headers = {},
    method = 'GET',
    body,
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    accept = 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  } = opts;

  const finalHeaders = {
    'User-Agent': UA,
    Accept: accept,
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    ...(referer ? { Referer: referer } : {}),
    ...headers,
  };

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        method,
        headers: finalHeaders,
        body,
        redirect: 'follow',
        signal: ac.signal,
      });

      if (!res.ok && isRetryable(null, res.status) && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }

      const text = await decodeBody(res);
      return { ok: res.ok, status: res.status, text, url: res.url, headers: res.headers };
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === retries) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`요청 실패 ${url}: ${lastErr?.message || 'unknown'}`);
}

/** HTML 문자열을 가져온다. 실패 시 throw. */
export async function getHtml(url, opts = {}) {
  const res = await request(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.text;
}

/**
 * JSON 을 가져온다. 응답이 JSON 이 아니면 null 을 반환한다
 * (한국 사이트는 오류 시 HTML 로그인 페이지를 200 으로 주는 경우가 많다).
 */
export async function getJson(url, opts = {}) {
  const res = await request(url, {
    accept: 'application/json, text/javascript, */*;q=0.01',
    headers: { 'X-Requested-With': 'XMLHttpRequest', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  try {
    return JSON.parse(res.text);
  } catch {
    return null;
  }
}

/** JSON POST. 실패 시 throw. */
export async function postJson(url, payload, opts = {}) {
  const res = await request(url, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    accept: 'application/json, */*;q=0.8',
    ...opts,
  });
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(res.text) };
  } catch {
    return { ok: res.ok, status: res.status, data: null, raw: res.text };
  }
}
