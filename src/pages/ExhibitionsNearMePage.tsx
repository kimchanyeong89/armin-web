/**
 * ExhibitionsNearMePage.tsx
 *
 * 전시 추천 페이지 — 취향 벡터 기반 예상점수 + 커뮤니티 평점
 *
 * ── 예상점수 알고리즘 ────────────────────────────────────────────────────────
 *
 *  [1] 사용자 취향 벡터 (V_user)
 *      - 좋아요한 작품들의 SigLIP 이미지 임베딩 768D 벡터들의 평균(centroid)
 *      - CF Worker(/taste-profile)에서 관리; 로컬에서는 encodeText로 근사
 *
 *  [2] 전시 임베딩 (V_exh)
 *      - 우선: coverEmbedding 필드에 사전 계산된 이미지 임베딩 사용
 *      - 없으면: SigLIP 텍스트 인코더로 "{제목} {설명}" 인코딩
 *      - SigLIP 텍스트/이미지 임베딩은 같은 공간에 있으므로 교차 비교 가능
 *
 *  [3] 취향 유사도 점수 (0~100)
 *      taste_score = cosine_sim(V_user, V_exh) × 100
 *      (두 벡터 모두 L2-정규화되어 있으므로 내적 = cosine similarity)
 *
 *  [4] 커뮤니티 평점 보정 (±10점)
 *      rating_adj = (avg_rating - 3.0) × 5
 *      → 5점 평균이면 +10, 3점이면 ±0, 1점이면 -10
 *
 *  [5] 최종 예상점수
 *      final_score = clamp(taste_score × 0.85 + rating_adj × 0.15, 0, 100)
 *      → 취향 유사도 85% + 커뮤니티 평점 15% 혼합
 *
 * ── 평점 저장 스키마 (Firestore) ─────────────────────────────────────────────
 *      users/{userId}/exhibition_ratings/{exhibitionId}
 *        → { rating: 1~5, ratedAt: Timestamp }
 *
 *      exhibition_stats/{exhibitionId}
 *        → { avgRating: number, totalRatings: number }
 * ────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo, memo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
  coverEmbedding?: number[];
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
  tasteScore: number | null;       // 0~100: 취향 유사도
  finalScore: number | null;       // 0~100: 취향 + 커뮤니티 혼합
  communityAvg: number | null;     // 1~5: 커뮤니티 평균 평점
  communityCount: number;
  myRating: number | null;         // 1~5: 내 평점
  daysLeft: number | null;
}

interface ExhibitionStats {
  avgRating: number;
  totalRatings: number;
}

type SortMode = 'score' | 'distance' | 'deadline' | 'rating';

const CF = 'https://armin-semantic-search.armin-art.workers.dev';

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function cosineSim(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function l2Norm(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map(x => x / norm) : v;
}

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

// ─── Firestore 평점 헬퍼 ────────────────────────────────────────────────────

async function fetchExhibitionStats(exhId: string): Promise<ExhibitionStats | null> {
  try {
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const db = getFirestore();
    const snap = await getDoc(doc(db, 'exhibition_stats', exhId));
    if (snap.exists()) return snap.data() as ExhibitionStats;
    return null;
  } catch { return null; }
}

async function fetchMyRating(userId: string, exhId: string): Promise<number | null> {
  try {
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const db = getFirestore();
    const snap = await getDoc(doc(db, 'users', userId, 'exhibition_ratings', exhId));
    if (snap.exists()) return (snap.data() as { rating: number }).rating;
    return null;
  } catch { return null; }
}

async function writeRating(userId: string, exhId: string, rating: number): Promise<void> {
  const { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp, runTransaction } =
    await import('firebase/firestore');
  const db = getFirestore();
  const userRef = doc(db, 'users', userId, 'exhibition_ratings', exhId);
  const statsRef = doc(db, 'exhibition_stats', exhId);

  await runTransaction(db, async (tx) => {
    const prevSnap = await tx.get(userRef);
    const statsSnap = await tx.get(statsRef);

    const prevRating: number | null = prevSnap.exists()
      ? (prevSnap.data() as { rating: number }).rating
      : null;

    tx.set(userRef, { rating, ratedAt: serverTimestamp() });

    if (statsSnap.exists()) {
      const s = statsSnap.data() as ExhibitionStats;
      let total = s.totalRatings;
      let sum = s.avgRating * total;
      if (prevRating !== null) sum -= prevRating; else total += 1;
      sum += rating;
      tx.update(statsRef, { avgRating: sum / total, totalRatings: total });
    } else {
      tx.set(statsRef, { avgRating: rating, totalRatings: 1 });
    }
  });
}

// ─── 스타 평점 컴포넌트 ─────────────────────────────────────────────────────

const StarRating = memo(({
  value, onChange, size = 18, readonly = false,
}: {
  value: number | null;
  onChange?: (v: number) => void;
  size?: number;
  readonly?: boolean;
}) => {
  const [hover, setHover] = useState(0);
  const active = hover || value || 0;

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg
          key={n}
          width={size} height={size} viewBox="0 0 24 24"
          style={{
            cursor: readonly ? 'default' : 'pointer',
            transition: 'transform 0.12s',
            transform: !readonly && hover === n ? 'scale(1.25)' : 'scale(1)',
          }}
          onMouseEnter={() => !readonly && setHover(n)}
          onMouseLeave={() => !readonly && setHover(0)}
          onClick={() => !readonly && onChange?.(n)}
        >
          <polygon
            points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
            fill={n <= active ? '#c9a55a' : 'rgba(255,255,255,0.12)'}
            stroke={n <= active ? '#c9a55a' : 'rgba(255,255,255,0.2)'}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </div>
  );
});

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
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>점</span>
      </div>
    </div>
  );
});

// ─── 전시 카드 ──────────────────────────────────────────────────────────────

const ExhibitionCard = memo(({
  item, onOpen, onRate,
}: {
  item: ExhibitionWithMeta;
  onOpen: () => void;
  onRate: (rating: number) => void;
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const { exhibition: exh, museum, distanceKm, finalScore, tasteScore, communityAvg,
    communityCount, myRating, daysLeft } = item;
  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
  const isUpcoming = exh.status === 'upcoming';

  return (
    <div
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: '#141414',
        border: finalScore !== null && finalScore >= 75
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
            background: `linear-gradient(135deg, ${scoreBg(finalScore ?? 0)} 0%, #1e1e1e 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
          }}>🎨</div>
        )}
        {/* 예상점수 배지 */}
        {finalScore !== null && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            padding: '4px 8px', borderRadius: 10,
            background: scoreBg(finalScore),
            backdropFilter: 'blur(8px)',
            border: `1px solid ${scoreColor(finalScore)}33`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(finalScore) }}>
              {finalScore}점
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
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}
          onClick={e => e.stopPropagation()}
        >
          <StarRating value={myRating} onChange={onRate} size={14} />
          {communityAvg !== null && (
            <span style={{ fontSize: 10, color: 'rgba(232,224,212,0.38)' }}>
              {communityAvg.toFixed(1)} ({communityCount})
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── 상세 모달 ──────────────────────────────────────────────────────────────

const DetailModal = memo(({
  item, onClose, onRate,
}: {
  item: ExhibitionWithMeta;
  onClose: () => void;
  onRate: (rating: number) => void;
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const { exhibition: exh, museum, distanceKm, tasteScore, finalScore,
    communityAvg, communityCount, myRating, daysLeft } = item;

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

          {/* 예상점수 게이지 */}
          {finalScore !== null && (
            <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
              <ScoreGauge score={finalScore} />
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
                <ScoreRow label="취향 유사도" value={tasteScore} max={100} unit="점" />
              )}
              {communityAvg !== null && (
                <ScoreRow label="커뮤니티 평점" value={communityAvg} max={5} unit="점" color="#c9a55a" />
              )}
              {finalScore !== null && (
                <ScoreRow label="나의 예상점수" value={finalScore} max={100} unit="점" color={scoreColor(finalScore)} bold />
              )}
              <div style={{ fontSize: 10, color: 'rgba(232,224,212,0.28)', marginTop: 8, lineHeight: 1.6 }}>
                예상점수 = 취향 유사도 85% + 커뮤니티 평점 보정 15%
              </div>
            </div>
          )}

          {/* 내 평점 */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.2px', color: 'rgba(232,224,212,0.35)', textTransform: 'uppercase', marginBottom: 10 }}>
              내 평점
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StarRating value={myRating} onChange={onRate} size={26} />
              {myRating && (
                <span style={{ fontSize: 13, color: '#c9a55a', fontWeight: 600 }}>
                  {myRating}점 평가함
                </span>
              )}
              {!myRating && (
                <span style={{ fontSize: 12, color: 'rgba(232,224,212,0.35)' }}>
                  별점을 남겨보세요
                </span>
              )}
            </div>
            {communityAvg !== null && (
              <div style={{ fontSize: 11, color: 'rgba(232,224,212,0.3)', marginTop: 6 }}>
                커뮤니티 평균 ★ {communityAvg.toFixed(1)} ({communityCount}명)
              </div>
            )}
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

  // 취향 벡터
  const [tasteVector, setTasteVector] = useState<number[] | null>(null);
  const [likedCount, setLikedCount] = useState(0);
  const [vectorLoading, setVectorLoading] = useState(false);

  // 전시 임베딩 (id → vector)
  const [exhVectors, setExhVectors] = useState<Record<string, number[]>>({});
  const encodingRef = useRef(false);

  // 커뮤니티 데이터 (id → stats)
  const [statsMap, setStatsMap] = useState<Record<string, ExhibitionStats>>({});
  // 내 평점 (id → rating)
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});

  // UI
  const [sortMode, setSortMode] = useState<SortMode>('score');
  const [selected, setSelected] = useState<ExhibitionWithMeta | null>(null);
  const [ratingLoading, setRatingLoading] = useState<string | null>(null);

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

  // ── 취향 벡터 로드 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    setVectorLoading(true);
    (async () => {
      try {
        const { getFirestore, collection, getDocs } = await import('firebase/firestore');
        const db = getFirestore();
        const snap = await getDocs(collection(db, `users/${user.uid}/liked_artworks`));
        const ids = snap.docs.map(d => d.id);
        setLikedCount(ids.length);
        if (ids.length < 3) return;

        // CF Worker에서 취향 벡터 요청
        const res = await fetch(`${CF}/taste-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid, likedIds: ids, returnVector: true }),
        });
        if (res.ok) {
          const data: { vector?: number[] } = await res.json();
          if (data.vector?.length) setTasteVector(data.vector);
        }
      } catch { /* silent */ }
      finally { setVectorLoading(false); }
    })();
  }, [user?.uid]);

  // ── 전시 텍스트 임베딩 (SigLIP 텍스트 인코더) ─────────────────────────────
  useEffect(() => {
    if (!tasteVector || encodingRef.current) return;
    encodingRef.current = true;

    (async () => {
      try {
        const { encodeText } = await import('../utils/siglipSearch');
        const allExhs: { id: string; text: string }[] = [];
        for (const m of exhibitions) {
          for (const e of (m.temporaryExhibitions ?? [])) {
            if (e.status !== 'past' && !e.coverEmbedding) {
              allExhs.push({ id: e.id, text: `${e.title} ${e.description}` });
            }
          }
        }
        // 배치로 인코딩
        const newVecs: Record<string, number[]> = {};
        for (const { id, text } of allExhs) {
          try {
            const vec = await encodeText(text);
            if (vec?.length) newVecs[id] = l2Norm(vec);
          } catch { /* skip */ }
        }
        setExhVectors(prev => ({ ...prev, ...newVecs }));
      } catch { /* SigLIP 로드 실패 시 무시 */ }
    })();
  }, [tasteVector, exhibitions]);

  // ── 커뮤니티 평점 로드 ────────────────────────────────────────────────────
  useEffect(() => {
    const ids: string[] = [];
    for (const m of exhibitions) {
      for (const e of (m.temporaryExhibitions ?? [])) {
        if (e.status !== 'past') ids.push(e.id);
      }
    }
    (async () => {
      const results: Record<string, ExhibitionStats> = {};
      await Promise.all(ids.map(async id => {
        const s = await fetchExhibitionStats(id);
        if (s) results[id] = s;
      }));
      setStatsMap(results);
    })();
  }, [exhibitions]);

  // ── 내 평점 로드 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const ids: string[] = [];
    for (const m of exhibitions) {
      for (const e of (m.temporaryExhibitions ?? [])) {
        if (e.status !== 'past') ids.push(e.id);
      }
    }
    (async () => {
      const results: Record<string, number> = {};
      await Promise.all(ids.map(async id => {
        const r = await fetchMyRating(user.uid, id);
        if (r !== null) results[id] = r;
      }));
      setMyRatings(results);
    })();
  }, [user?.uid, exhibitions]);

  // ── 예상점수 계산 ─────────────────────────────────────────────────────────
  function computeScore(exhId: string, coverEmbedding?: number[]): number | null {
    if (!tasteVector) return null;
    // 벡터: 사전계산 임베딩 > 텍스트 임베딩 순서
    const vec = coverEmbedding ?? exhVectors[exhId];
    if (!vec?.length) return null;

    const taste = cosineSim(tasteVector, vec); // [-1, 1] → SigLIP은 보통 양수 범위
    const tasteScore = Math.round(Math.max(0, taste) * 100);

    const stats = statsMap[exhId];
    const ratingAdj = stats ? (stats.avgRating - 3.0) * 5 : 0; // ±10

    const final = Math.round(Math.min(100, Math.max(0, tasteScore * 0.85 + ratingAdj * 0.15)));
    return final;
  }

  // ── 전체 전시 목록 ────────────────────────────────────────────────────────
  const allItems = useMemo<ExhibitionWithMeta[]>(() => {
    const result: ExhibitionWithMeta[] = [];
    for (const museum of exhibitions) {
      for (const exh of (museum.temporaryExhibitions ?? [])) {
        if (exh.status === 'past') continue;
        const dist = userLat !== null && userLng !== null
          ? Math.round(haversineKm(userLat, userLng, museum.latitude, museum.longitude) * 10) / 10
          : null;
        const stats = statsMap[exh.id] ?? null;
        const tasteScore = (() => {
          if (!tasteVector) return null;
          const vec = exh.coverEmbedding ?? exhVectors[exh.id];
          if (!vec?.length) return null;
          return Math.round(Math.max(0, cosineSim(tasteVector, vec)) * 100);
        })();
        const finalScore = (() => {
          if (tasteScore === null) return null;
          const ratingAdj = stats ? (stats.avgRating - 3.0) * 5 : 0;
          return Math.round(Math.min(100, Math.max(0, tasteScore * 0.85 + ratingAdj * 0.15)));
        })();
        result.push({
          exhibition: exh,
          museum,
          distanceKm: dist,
          tasteScore,
          finalScore,
          communityAvg: stats?.avgRating ?? null,
          communityCount: stats?.totalRatings ?? 0,
          myRating: myRatings[exh.id] ?? null,
          daysLeft: daysUntil(exh.endDate),
        });
      }
    }
    return result;
  }, [exhibitions, userLat, userLng, tasteVector, exhVectors, statsMap, myRatings]);

  // ── 정렬 ──────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...allItems];
    if (sortMode === 'score') {
      arr.sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1));
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

  // ── 평점 저장 ─────────────────────────────────────────────────────────────
  const handleRate = useCallback(async (exhId: string, rating: number) => {
    if (!user?.uid) { navigate('/login'); return; }
    setRatingLoading(exhId);
    try {
      await writeRating(user.uid, exhId, rating);
      setMyRatings(prev => ({ ...prev, [exhId]: rating }));
      // 낙관적 업데이트
      setStatsMap(prev => {
        const old = prev[exhId];
        if (!old) return { ...prev, [exhId]: { avgRating: rating, totalRatings: 1 } };
        const prevRating = myRatings[exhId] ?? null;
        const total = old.totalRatings + (prevRating !== null ? 0 : 1);
        const sum = old.avgRating * old.totalRatings - (prevRating ?? 0) + rating;
        return { ...prev, [exhId]: { avgRating: sum / total, totalRatings: total } };
      });
      // 선택된 항목 업데이트
      if (selected?.exhibition.id === exhId) {
        setSelected(prev => prev ? { ...prev, myRating: rating } : prev);
      }
    } catch { /* silent */ }
    finally { setRatingLoading(null); }
  }, [user?.uid, navigate, myRatings, selected]);

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
          로그인하면 취향 기반 예상점수와 나만의 평점을 남길 수 있어요.{' '}
          <span onClick={() => navigate('/login')}
            style={{ color: '#c9a55a', cursor: 'pointer', fontWeight: 600 }}>로그인 →</span>
        </div>
      )}
      {user && likedCount < 3 && !vectorLoading && (
        <div style={{
          margin: '12px 20px', padding: '11px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
          fontSize: 12, color: 'rgba(232,224,212,0.42)',
        }}>
          작품 3개 이상 ♥ 하면 취향 예상점수가 계산돼요. (현재 {likedCount}개)
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
              onRate={r => handleRate(item.exhibition.id, r)}
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
              onRate={r => handleRate(item.exhibition.id, r)}
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
          onRate={r => handleRate(selected.exhibition.id, r)}
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
