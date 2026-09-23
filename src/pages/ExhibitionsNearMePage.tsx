/**
 * ExhibitionsNearMePage.tsx
 *
 * 전시 추천 페이지 — 취향 일치 + 커뮤니티 평점
 *
 * ── 취향 일치 (1~99) ─────────────────────────────────────────────────────────
 *      좋아요한 작품들의 SigLIP 이미지 벡터를 워커(/taste-scores)가 취향 군집으로 요약하고,
 *      전시마다 소개글로 찾아 둔 가까운 작품들의 이미지와 비교해 매긴다.
 *      50 은 이 사용자에게 보통인 전시이고, 높을수록 취향에 맞는다. 좋아요가 적으면 50 쪽으로 당겨진다.
 *      공식: workers/semantic-search/src/taste.ts · 데이터: scripts/taste/build-taste-data.mjs
 *
 * ── 평점 ─────────────────────────────────────────────────────────────────────
 *      평점(0.5점 단위)과 한줄평은 앱 전체가 함께 쓰는 RatingEmblems·ReviewPanel 로 남기고 본다.
 *      저장 구조: features/ratings/ratingWrites.ts
 * ────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useState, useEffect, useCallback, useMemo, memo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RatingEmblems from '../components/Ratings/RatingEmblems';
import { ReviewPanel } from '../components/Ratings/ReviewPanel';
import { averageRating, subjectKey } from '../features/ratings/ratingWrites';
import { useAllRatingStats } from '../features/ratings/useRatings';
import { useTasteScores } from '../features/taste/useTasteScores';
import { useLikedArtworks } from '../hooks/useLikedArtworks';

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface TemporaryExhibition {
  id: string;
  title: string;
  titleEn?: string;
  description: string;
  startDate: string;
  endDate: string;
  coverImage: string;
  officialUrl?: string;
  status: 'ongoing' | 'upcoming' | 'past';
}

interface Museum {
  id: string;
  name: string;
  name_en?: string;
  location: string;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  representativeImage: string;
  temporaryExhibitions?: TemporaryExhibition[];
}

interface ExhibitionWithMeta {
  exhibition: TemporaryExhibition;
  museum: Museum;
  distanceKm: number | null;
  tasteScore: number | null;       // 1~99: 취향 일치 (좋아요한 작품이 없으면 null)
  communityAvg: number | null;     // 1~5: 커뮤니티 평균 평점
  communityCount: number;
  daysLeft: number | null;
}


type SortMode = 'score' | 'distance' | 'deadline' | 'rating';

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr || dateStr === 'ongoing' || dateStr === 'TBD') return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function fmtDate(start: string, end: string): string {
  if (end === 'ongoing') return '상시 운영';
  if (end === 'TBD') return start.slice(2, 7).replace('-', '.') + ' ~';
  return start.slice(2, 7).replace('-', '.') + ' ~ ' + end.slice(2, 7).replace('-', '.');
}

function scoreColor(s: number): string {
  if (s >= 80) return '#c9a55a';
  if (s >= 65) return '#70c080';
  if (s >= 50) return '#6090e0';
  return 'rgba(255,255,255,0.45)';
}

function scoreBg(s: number): string {
  if (s >= 80) return 'rgba(201,165,90,0.18)';
  if (s >= 65) return 'rgba(112,192,128,0.15)';
  if (s >= 50) return 'rgba(96,144,224,0.14)';
  return 'rgba(255,255,255,0.07)';
}


// ─── 예상점수 게이지 ────────────────────────────────────────────────────────

const ScoreGauge = memo(({ score }: { score: number }) => {
  const col = scoreColor(score);
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
      <svg width={56} height={56} viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={28} cy={28} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
        <circle
          cx={28} cy={28} r={r} fill="none"
          stroke={col} strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: col, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>%</span>
      </div>
    </div>
  );
});

// ─── 전시 카드 ──────────────────────────────────────────────────────────────

const ExhibitionCard = memo(({
  item, onOpen,
}: {
  item: ExhibitionWithMeta;
  onOpen: () => void;
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const { exhibition: exh, museum, distanceKm, tasteScore, daysLeft } = item;
  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
  const isUpcoming = exh.status === 'upcoming';

  return (
    <div
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: '#141414',
        border: tasteScore !== null && tasteScore >= 75
          ? '1px solid rgba(201,165,90,0.28)' : '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'transform 0.2s ease, border-color 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={onOpen}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      {/* 이미지 */}
      <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden', background: '#1a1a1a' }}>
        {!imgFailed ? (
          <img
            src={exh.coverImage}
            alt={exh.title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: `linear-gradient(135deg, ${scoreBg(tasteScore ?? 0)} 0%, #1e1e1e 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
          }}>🎨</div>
        )}
        {/* 취향 일치 배지 */}
        {tasteScore !== null && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            padding: '4px 8px', borderRadius: 10,
            background: scoreBg(tasteScore),
            backdropFilter: 'blur(8px)',
            border: `1px solid ${scoreColor(tasteScore)}33`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(tasteScore) }}>
              취향 {tasteScore}%
            </span>
          </div>
        )}
        {/* 종료 임박 배지 */}
        {isUrgent && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            padding: '3px 7px', borderRadius: 8,
            background: 'rgba(220,60,60,0.85)', backdropFilter: 'blur(4px)',
            fontSize: 10, fontWeight: 600, color: '#fff',
          }}>D-{daysLeft}</div>
        )}
        {/* 예정 배지 */}
        {isUpcoming && !isUrgent && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            padding: '3px 7px', borderRadius: 8,
            background: 'rgba(80,130,220,0.8)', backdropFilter: 'blur(4px)',
            fontSize: 10, fontWeight: 600, color: '#fff',
          }}>예정</div>
        )}
      </div>

      {/* 텍스트 */}
      <div style={{ padding: '10px 11px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 10, color: 'rgba(232,224,212,0.38)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {museum.name}
        </div>
        <div style={{
          fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: '#e8e0d4',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {exh.title}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(232,224,212,0.35)', marginTop: 1 }}>
          {fmtDate(exh.startDate, exh.endDate)}
          {distanceKm !== null && (
            <span style={{ marginLeft: 6, color: 'rgba(232,224,212,0.22)' }}>
              {distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm}km`}
            </span>
          )}
        </div>

        {/* 평점 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <RatingEmblems subject={{ kind: 'exhibition', id: exh.id }} title={exh.title} subtitle={museum.name} color="rgba(232,224,212,0.62)" size={13} />
        </div>
      </div>
    </div>
  );
});

// ─── 상세 모달 ──────────────────────────────────────────────────────────────

const DetailModal = memo(({
  item, onClose,
}: {
  item: ExhibitionWithMeta;
  onClose: () => void;
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const { exhibition: exh, museum, distanceKm, tasteScore, communityAvg, daysLeft } = item;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200000,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 620, borderRadius: '20px 20px 0 0',
          background: '#111', maxHeight: '88dvh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 커버 이미지 */}
        <div style={{ position: 'relative', aspectRatio: '16/9', background: '#1a1a1a', overflow: 'hidden' }}>
          {!imgFailed ? (
            <img src={exh.coverImage} alt={exh.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setImgFailed(true)} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>🎨</div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #111 0%, transparent 55%)' }} />

          {/* 취향 일치 게이지 */}
          {tasteScore !== null && (
            <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
              <ScoreGauge score={tasteScore} />
            </div>
          )}

          {/* 닫기 */}
          <button onClick={onClose} style={{
            position: 'absolute', top: 12, right: 12,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', border: 'none',
            cursor: 'pointer', color: '#fff', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* 내용 */}
        <div style={{ padding: '20px 22px 48px' }}>
          <div style={{ fontSize: 11, color: 'rgba(232,224,212,0.38)', marginBottom: 6 }}>
            {museum.name} · {museum.location}
          </div>
          <h2 style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.35, marginBottom: 6 }}>
            {exh.title}
          </h2>
          {exh.titleEn && (
            <div style={{ fontSize: 12, color: 'rgba(232,224,212,0.38)', marginBottom: 14 }}>
              {exh.titleEn}
            </div>
          )}

          {/* 메타 태그 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            <Tag>{fmtDate(exh.startDate, exh.endDate)}</Tag>
            {daysLeft !== null && daysLeft >= 0 && daysLeft <= 30 && (
              <Tag accent={daysLeft <= 7 ? 'red' : undefined}>{daysLeft}일 남음</Tag>
            )}
            {distanceKm !== null && (
              <Tag>📍 {distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm}km`}</Tag>
            )}
            <Tag accent={exh.status === 'upcoming' ? 'blue' : 'green'}>
              {exh.status === 'upcoming' ? '예정' : '진행중'}
            </Tag>
          </div>

          {/* 점수 분석 */}
          {(tasteScore !== null || communityAvg !== null) && (
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: '14px 16px', marginBottom: 18,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.2px', color: 'rgba(232,224,212,0.35)', textTransform: 'uppercase', marginBottom: 12 }}>
                점수 분석
              </div>
              {tasteScore !== null && (
                <ScoreRow label="취향 일치" value={tasteScore} max={100} unit="%" color={scoreColor(tasteScore)} bold />
              )}
              {communityAvg !== null && (
                <ScoreRow label="커뮤니티 평점" value={communityAvg} max={5} unit="점" color="#c9a55a" />
              )}
              {tasteScore !== null && (
                <div style={{ fontSize: 10, color: 'rgba(232,224,212,0.28)', marginTop: 8, lineHeight: 1.6 }}>
                  좋아요한 작품과 이 전시에 가까운 소장품의 이미지를 비교한 점수예요. 50%가 보통이고, 높을수록 취향에 맞아요.
                </div>
              )}
            </div>
          )}

          {/* 평점·한줄평 — 주변 전시 모달과 같은 패널 (제목줄도 패널이 그린다) */}
          <div style={{ marginBottom: 22 }}>
            <ReviewPanel subject={{ kind: 'exhibition', id: exh.id }} />
          </div>

          <p style={{ fontSize: 13, color: 'rgba(232,224,212,0.65)', lineHeight: 1.8, marginBottom: 20 }}>
            {exh.description}
          </p>

          {exh.officialUrl && (
            <a href={exh.officialUrl} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', borderRadius: 10,
                background: 'rgba(201,165,90,0.1)', border: '1px solid rgba(201,165,90,0.28)',
                color: '#c9a55a', fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}>
              공식 전시 페이지 →
            </a>
          )}
        </div>
      </div>
    </div>
  );
});

// 점수 행
const ScoreRow = ({ label, value, max, unit, color, bold }: {
  label: string; value: number; max: number; unit: string;
  color?: string; bold?: boolean;
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
    <div style={{ width: 90, fontSize: 11, color: 'rgba(232,224,212,0.5)', flexShrink: 0 }}>{label}</div>
    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${(value / max) * 100}%`,
        background: color ?? '#6090e0', borderRadius: 2,
        transition: 'width 0.6s ease',
      }} />
    </div>
    <span style={{
      fontSize: bold ? 13 : 11,
      fontWeight: bold ? 700 : 400,
      color: color ?? 'rgba(232,224,212,0.7)',
      width: 40, textAlign: 'right', flexShrink: 0,
    }}>
      {value.toFixed(max === 5 ? 1 : 0)}{unit}
    </span>
  </div>
);

// 태그
const Tag = ({ children, accent }: { children: React.ReactNode; accent?: 'red' | 'blue' | 'green' }) => {
  const bg = accent === 'red' ? 'rgba(220,60,60,0.18)' : accent === 'blue' ? 'rgba(80,130,220,0.14)' : accent === 'green' ? 'rgba(80,180,100,0.12)' : 'rgba(255,255,255,0.06)';
  const col = accent === 'red' ? '#e06060' : accent === 'blue' ? '#6090e0' : accent === 'green' ? '#70c080' : 'rgba(232,224,212,0.55)';
  return (
    <span style={{ padding: '4px 10px', borderRadius: 20, background: bg, fontSize: 11, color: col }}>
      {children}
    </span>
  );
};

// ─── 메인 페이지 ────────────────────────────────────────────────────────────

interface Props { exhibitions: Museum[]; }

export default function ExhibitionsNearMePage({ exhibitions }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // 위치
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  // 취향 일치 (전시 id → 1~99). 작품에 ♥ 를 누른 적이 있어야 생긴다.
  const taste = useTasteScores();
  const { loading: likesLoading, ids: likedArtworkIds } = useLikedArtworks();

  // 커뮤니티 평점 (전시 id → 실시간 합계)
  const statsById = useAllRatingStats();

  // UI
  const [sortMode, setSortMode] = useState<SortMode>('score');
  const [selected, setSelected] = useState<ExhibitionWithMeta | null>(null);

  // ── 위치 ──────────────────────────────────────────────────────────────────
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      setUserLat(lat); setUserLng(lng); setLocLoading(false);
      if (lat > 37.3 && lat < 37.7 && lng > 126.7 && lng < 127.3) setLocationName('서울');
      else if (lat > 35.0 && lat < 35.3 && lng > 128.9 && lng < 129.3) setLocationName('부산');
      else if (lat > 33.2 && lat < 33.6) setLocationName('제주');
      else if (lat > 37.2 && lat < 37.5) setLocationName('경기도');
      else setLocationName('내 위치');
    }, () => setLocLoading(false), { timeout: 8000 });
  }, []);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  // ── 전체 전시 목록 ────────────────────────────────────────────────────────
  const allItems = useMemo<ExhibitionWithMeta[]>(() => {
    const result: ExhibitionWithMeta[] = [];
    for (const museum of exhibitions) {
      for (const exh of (museum.temporaryExhibitions ?? [])) {
        if (exh.status === 'past') continue;
        const dist = userLat !== null && userLng !== null
          ? Math.round(haversineKm(userLat, userLng, museum.latitude, museum.longitude) * 10) / 10
          : null;
        const stats = statsById.get(subjectKey({ kind: 'exhibition', id: exh.id }));
        result.push({
          exhibition: exh,
          museum,
          distanceKm: dist,
          tasteScore: taste?.exhibitions[exh.id] ?? null,
          communityAvg: averageRating(stats),
          communityCount: stats?.totalRatings ?? 0,
          daysLeft: daysUntil(exh.endDate),
        });
      }
    }
    return result;
  }, [exhibitions, userLat, userLng, taste, statsById]);

  // ── 정렬 ──────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...allItems];
    if (sortMode === 'score') {
      arr.sort((a, b) => (b.tasteScore ?? -1) - (a.tasteScore ?? -1) || (b.communityAvg ?? 0) - (a.communityAvg ?? 0));
    } else if (sortMode === 'rating') {
      arr.sort((a, b) => (b.communityAvg ?? 0) - (a.communityAvg ?? 0));
    } else if (sortMode === 'distance') {
      arr.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    } else if (sortMode === 'deadline') {
      arr.sort((a, b) => (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999));
    }
    return arr;
  }, [allItems, sortMode]);

  const ongoing = sorted.filter(e => e.exhibition.status === 'ongoing');
  const upcoming = sorted.filter(e => e.exhibition.status === 'upcoming');


  // ── 렌더 ──────────────────────────────────────────────────────────────────
  const S = {
    page: {
      width: '100%', height: '100dvh',
      background: '#0a0a0a', color: '#e8e0d4',
      fontFamily: "'Inter', 'Apple SD Gothic Neo', sans-serif",
      overflowY: 'auto' as const, overflowX: 'hidden' as const,
    },
    header: {
      padding: '52px 22px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      position: 'sticky' as const, top: 0,
      background: '#0a0a0a', zIndex: 10,
    },
  };

  return (
    <div style={S.page}>
      {/* 헤더 */}
      <div style={S.header}>
        <button
          onClick={() => navigate(-1)}
          style={{
            position: 'absolute', top: 18, right: 22,
            width: 34, height: 34, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: 'none',
            cursor: 'pointer', color: '#e8e0d4', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>

        <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 4 }}>
          전시 추천
        </div>

        {/* 위치 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(232,224,212,0.42)', marginBottom: 14 }}>
          <span>📍</span>
          {locLoading ? <span>위치 확인 중…</span>
            : locationName ? <span>{locationName} 기준</span>
            : (
              <button onClick={requestLocation}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(201,165,90,0.7)', fontSize: 12, padding: 0 }}>
                위치 허용하기
              </button>
            )}
        </div>

        {/* 정렬 탭 */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([['score', '내 취향순'], ['rating', '평점순'], ['distance', '거리순'], ['deadline', '종료임박']] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setSortMode(k)}
              style={{
                padding: '5px 12px', borderRadius: 20, border: 'none',
                background: sortMode === k ? 'rgba(201,165,90,0.18)' : 'rgba(255,255,255,0.06)',
                color: sortMode === k ? '#c9a55a' : 'rgba(232,224,212,0.45)',
                fontSize: 11, fontWeight: sortMode === k ? 600 : 400, cursor: 'pointer',
                transition: 'all 0.18s',
              }}>{l}</button>
          ))}
        </div>
      </div>

      {/* 안내 배너 */}
      {!user && (
        <div style={{
          margin: '12px 20px', padding: '13px 16px', borderRadius: 10,
          background: 'rgba(201,165,90,0.07)', border: '1px solid rgba(201,165,90,0.18)',
          fontSize: 13, color: 'rgba(232,224,212,0.6)', lineHeight: 1.55,
        }}>
          로그인하면 전시마다 내 취향과 얼마나 맞는지 보고, 나만의 평점을 남길 수 있어요.{' '}
          <span onClick={() => navigate('/login')}
            style={{ color: '#c9a55a', cursor: 'pointer', fontWeight: 600 }}>로그인 →</span>
        </div>
      )}
      {user && !likesLoading && likedArtworkIds.size === 0 && (
        <div style={{
          margin: '12px 20px', padding: '11px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
          fontSize: 12, color: 'rgba(232,224,212,0.42)',
        }}>
          작품에 ♥ 를 누르면 전시마다 취향 일치 점수가 계산돼요.
        </div>
      )}

      {/* 진행중 */}
      {ongoing.length > 0 && (
        <Section title={`진행 중 · ${ongoing.length}`}>
          {ongoing.map(item => (
            <ExhibitionCard
              key={item.exhibition.id}
              item={item}
              onOpen={() => setSelected(item)}
            />
          ))}
        </Section>
      )}

      {/* 예정 */}
      {upcoming.length > 0 && (
        <Section title={`예정 · ${upcoming.length}`}>
          {upcoming.map(item => (
            <ExhibitionCard
              key={item.exhibition.id}
              item={item}
              onOpen={() => setSelected(item)}
            />
          ))}
        </Section>
      )}

      {allItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: 'rgba(232,224,212,0.3)', fontSize: 14 }}>
          현재 등록된 전시가 없습니다.
        </div>
      )}

      <div style={{ height: 60 }} />

      {/* 상세 모달 */}
      {selected && (
        <DetailModal
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ─── 섹션 래퍼 ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '22px 16px 0' }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '1.6px',
        color: 'rgba(232,224,212,0.3)', textTransform: 'uppercase',
        marginBottom: 14,
      }}>{title}</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
        gap: 11, marginBottom: 28,
      }}>
        {children}
      </div>
    </div>
  );
}
