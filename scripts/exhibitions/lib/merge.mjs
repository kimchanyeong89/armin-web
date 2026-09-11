/**
 * merge.mjs — 스크래핑 결과를 기존 exhibitions.js 데이터와 합친다.
 *
 * 설계 원칙 (데이터 손실 방지가 최우선):
 *   1. 손으로 다듬은 한국어 설명·영문 제목은 스크래핑 값이 비어 있으면 절대 덮어쓰지 않는다.
 *   2. coverImage 는 R2 URL 만 기록한다. 업로드에 실패하면 기존 이미지를 유지한다.
 *   3. 사이트에서 사라진 전시라도 종료일이 아직 안 지났으면 지우지 않는다
 *      (목록 페이징·일시 장애로 안 보일 뿐일 수 있다).
 *   4. 종료된 전시는 pastExhibitions 로 옮긴다.
 */

import { computeStatus, todayKST } from './parse.mjs';
import { isR2Url } from './images.mjs';

/** 제목 비교용 정규화: 공백·문장부호·괄호 제거 후 소문자화 */
export function normalizeTitle(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[[\](){}<>《》〈〉「」『』"'""'']/g, '')
    .replace(/[\s·・:：,，.。\-–—_/]/g, '')
    .trim();
}

/** 기존 전시 목록에서 스크래핑 카드와 같은 전시를 찾는다. */
export function findExisting(existing, card) {
  // 1) 사이트 고유 id
  if (card.sourceId) {
    const bySource = existing.find((e) => e.sourceId && e.sourceId === card.sourceId);
    if (bySource) return bySource;
  }
  // 2) 제목 완전 일치
  const target = normalizeTitle(card.title);
  if (!target) return null;
  const byTitle = existing.find((e) => normalizeTitle(e.title) === target);
  if (byTitle) return byTitle;

  // 3) 한쪽이 다른 쪽을 포함 + 시작일 동일 (부제 유무 차이 흡수)
  return (
    existing.find((e) => {
      const t = normalizeTitle(e.title);
      if (!t || t.length < 4 || target.length < 4) return false;
      const contains = t.includes(target) || target.includes(t);
      return contains && e.startDate && e.startDate === card.startDate;
    }) || null
  );
}

/** 자동 생성 전시 id (재실행해도 같은 값이 나와야 한다). */
export function makeExhibitionId(card, hash) {
  const year = (card.startDate || todayKST()).slice(0, 4);
  const base = card.sourceId ? String(card.sourceId).replace(/[^a-zA-Z0-9]/g, '') : hash;
  return `${card.museumId}-${year}-${base}`.toLowerCase();
}

/**
 * 한 미술관의 전시 배열을 갱신한다.
 *
 * @param {object[]} existingTemp 기존 temporaryExhibitions
 * @param {object[]} existingPast 기존 pastExhibitions
 * @param {object[]} cards 스크래핑 결과 (coverImage 가 이미 확정된 상태)
 * @param {object} opts { today, museumId, allowNew }
 *   allowNew=false 면 기존 전시의 갱신·종료 이관만 하고 신규 전시는 추가하지 않는다.
 *   (안전한 변경은 main 에 바로 커밋하고, 신규 전시는 PR 로 검토받기 위한 분리)
 * @returns {{temporary:object[], past:object[], changes:object[]}}
 */
export function mergeMuseum(existingTemp, existingPast, cards, opts = {}) {
  const today = opts.today || todayKST();
  const allowNew = opts.allowNew !== false;
  const changes = [];

  // 기존 항목을 복사해 작업한다 (원본 불변)
  const temp = existingTemp.map((e) => ({ ...e }));
  const past = existingPast.map((e) => ({ ...e }));

  for (const card of cards) {
    const existing = findExisting(temp, card) || findExisting(past, card);

    if (existing) {
      const before = JSON.stringify(existing);

      // 날짜는 사이트가 정답이다 (연장·조기종료 반영)
      if (card.startDate) existing.startDate = card.startDate;
      if (card.endDate) existing.endDate = card.endDate;

      // 비어 있는 큐레이션 필드만 채운다
      if (!existing.description && card.description) existing.description = card.description;
      if (!existing.titleEn && card.titleEn) existing.titleEn = card.titleEn;
      if (!existing.venue && card.venue) existing.venue = card.venue;
      if (!existing.officialUrl && card.officialUrl) existing.officialUrl = card.officialUrl;
      if (!existing.sourceId && card.sourceId) existing.sourceId = card.sourceId;

      // 포스터: R2 URL 이 새로 확보됐고 기존 값과 다르면 교체
      if (card.coverImage && isR2Url(card.coverImage) && existing.coverImage !== card.coverImage) {
        // 기존에 R2 이미지가 있어도 원본이 바뀌었다면 최신 포스터로 갱신한다
        existing.coverImage = card.coverImage;
      }

      existing.status = computeStatus(existing.startDate, existing.endDate, today);

      if (JSON.stringify(existing) !== before) {
        changes.push({ type: 'updated', museumId: card.museumId, title: existing.title });
      }
    } else {
      if (!allowNew) {
        changes.push({ type: 'pending-new', museumId: card.museumId, title: card.title });
        continue;
      }
      const entry = {
        id: card.id,
        title: card.title,
        titleEn: card.titleEn || '',
        description: card.description || '',
        venue: card.venue || '',
        startDate: card.startDate,
        endDate: card.endDate || '',
        coverImage: isR2Url(card.coverImage) ? card.coverImage : '',
        officialUrl: card.officialUrl || '',
        status: computeStatus(card.startDate, card.endDate, today),
      };
      if (card.sourceId) entry.sourceId = card.sourceId;
      temp.push(entry);
      changes.push({ type: 'added', museumId: card.museumId, title: entry.title });
    }
  }

  // 보관된 전시가 기간 연장으로 다시 열리면 진행 목록으로 되돌린다
  const stillPast = [];
  for (const e of past) {
    e.status = computeStatus(e.startDate, e.endDate, today);
    if (e.status === 'past') {
      stillPast.push(e);
    } else {
      temp.push(e);
      changes.push({ type: 'revived', museumId: opts.museumId, title: e.title });
    }
  }
  past.length = 0;
  past.push(...stillPast);

  // 상태 재계산 + 종료 전시 이관
  const stillTemp = [];
  for (const e of temp) {
    e.status = computeStatus(e.startDate, e.endDate, today);
    if (e.status === 'past') {
      if (!past.some((p) => normalizeTitle(p.title) === normalizeTitle(e.title))) {
        past.push(e);
        changes.push({ type: 'archived', museumId: opts.museumId, title: e.title });
      }
    } else {
      stillTemp.push(e);
    }
  }

  // 진행/예정 전시는 시작일 순으로 정렬해 diff 를 안정적으로 유지한다
  stillTemp.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '') || a.title.localeCompare(b.title));
  past.sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''));

  return { temporary: stillTemp, past, changes };
}

/**
 * 전시 레코드의 필수 정보가 채워졌는지 검사한다.
 * @returns {string[]} 빠진 항목 목록 (비어 있으면 완전)
 */
export function findMissingFields(ex) {
  const missing = [];
  if (!ex.title) missing.push('title');
  if (!ex.startDate) missing.push('startDate');
  if (!ex.endDate) missing.push('endDate');
  if (!ex.coverImage) missing.push('coverImage(포스터)');
  if (!ex.description) missing.push('description');
  if (!ex.officialUrl) missing.push('officialUrl');
  return missing;
}
