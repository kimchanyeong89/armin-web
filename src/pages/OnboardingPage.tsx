import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { exhibitions } from "../data/exhibitions";
import { getCanonicalName } from "../utils/canonicalArtist";
import { getWorkerNetworkMode } from "../utils/network";
import { TransitionBadge } from "../components/DrawingLoader";
import { getOptimizedImageUrl } from "../utils/imageProxy";
import type { ProfileImageCrop } from "../types/Profile";
import { useLanguage } from "../contexts/LanguageContext";
import TasteStep, { TASTE_GOAL } from "../features/onboarding/TasteStep";
import DateWheel from "../features/onboarding/DateWheel";
import { Search, X } from "lucide-react";
import "./onboardingRedesign.css";

// Proxy onboarding artwork thumbnails through wsrv.nl at low resolution
// so the picker grid loads quickly on mobile data, regardless of the
// original museum CDN's image size. The full-resolution URL is still
// what we save as the user's selected hero image — this only affects
// the thumbnails on screen.
function thumbUrl(url: string, width = 220): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  return getOptimizedImageUrl(url, width, 70, "webp");
}

// ── Design Tokens ──────────────────────────────────────────────────
const BG = '#111111';
const TEXT = '#FFFFFF';
const ACCENT = '#D4A547';
const DIM = '#555555';
const DIMMER = '#2A2A2A';
const MONO = "'Space Mono', 'Courier New', monospace";

// ── SVG Globe Icon ─────────────────────────────────────────────────
const GlobeIcon = () => (
  <svg width={72} height={72} viewBox="0 0 72 72" fill="none">
    <circle cx={36} cy={36} r={32} stroke={ACCENT} strokeWidth={1} strokeDasharray="5 3" />
    <line x1={4} y1={36} x2={68} y2={36} stroke={ACCENT} strokeWidth={0.8} />
    <line x1={36} y1={4} x2={36} y2={68} stroke={ACCENT} strokeWidth={0.8} />
    <ellipse cx={36} cy={36} rx={18} ry={32} stroke={TEXT} strokeWidth={0.6} opacity={0.3} />
    <ellipse cx={36} cy={36} rx={32} ry={14} stroke={TEXT} strokeWidth={0.6} opacity={0.3} />
    <circle cx={36} cy={36} r={3} fill={ACCENT} />
    <circle cx={36} cy={36} r={6} stroke={ACCENT} strokeWidth={0.8} opacity={0.5} />
  </svg>
);

// ── Corner Brackets ────────────────────────────────────────────────
const Corners = ({ color = ACCENT, size = 14 }: { color?: string; size?: number }) => (
  <>
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ position: 'absolute', top: 0, left: 0 }} fill="none">
      <polyline points="13,1 1,1 1,13" stroke={color} strokeWidth={1.5} strokeLinecap="square" />
    </svg>
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ position: 'absolute', top: 0, right: 0, transform: 'rotate(90deg)' }} fill="none">
      <polyline points="13,1 1,1 1,13" stroke={color} strokeWidth={1.5} strokeLinecap="square" />
    </svg>
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ position: 'absolute', bottom: 0, left: 0, transform: 'rotate(270deg)' }} fill="none">
      <polyline points="13,1 1,1 1,13" stroke={color} strokeWidth={1.5} strokeLinecap="square" />
    </svg>
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ position: 'absolute', bottom: 0, right: 0, transform: 'rotate(180deg)' }} fill="none">
      <polyline points="13,1 1,1 1,13" stroke={color} strokeWidth={1.5} strokeLinecap="square" />
    </svg>
  </>
);

// ── Artwork Grid ───────────────────────────────────────────────────
const ArtworkGrid = ({ items, selectedImage, onSelect }: {
  items: { image: string }[];
  selectedImage: string;
  onSelect: (img: string) => void;
}) => {
  if (!items.length) return null;
  const selectedIdx = items.findIndex(i => i.image === selectedImage);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: 8, letterSpacing: '0.2em', color: DIM, whiteSpace: 'nowrap' }}>PROFILE IMAGE</span>
        <span style={{ fontSize: 8, color: DIM, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
          {selectedIdx + 1}<span style={{ color: DIMMER }}> / {items.length}</span>
        </span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
        gap: 3,
        maxHeight: 192,
        overflowY: 'auto',
        scrollbarWidth: 'none',
      }}>
        {items.map((item, i) => {
          const isSelected = item.image === selectedImage;
          return (
            <div key={item.image + i} onClick={() => onSelect(item.image)} style={{
              aspectRatio: '1', overflow: 'hidden', cursor: 'pointer', position: 'relative',
              border: isSelected ? `2px solid ${ACCENT}` : `2px solid transparent`,
              opacity: isSelected ? 1 : 0.55,
              transition: 'all 0.15s',
              boxShadow: isSelected ? `0 0 10px rgba(212,165,71,0.25)` : 'none',
              background: DIMMER,
            }}>
              <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
              {isSelected && (
                <div style={{
                  position: 'absolute', top: 3, right: 3, width: 14, height: 14,
                  background: ACCENT, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 8, color: '#111', fontWeight: 700, lineHeight: 1 }}>✓</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── ImageCropModal (dark sketch theme) ────────────────────────────
const ImageCropModal = ({ imageUrl, initialCrop, onSave, onClose }: any) => {
  const [crop, setCrop] = React.useState(initialCrop);
  const [grabbing, setGrabbing] = React.useState(false);
  const lastPos = React.useRef({ x: 0, y: 0 });
  // Sync ref — never stale, works inside PointerEvent handlers without closure issues
  const dragging = React.useRef(false);
  const [isLandscape, setIsLandscape] = React.useState(true);

  // PointerEvents API: handles mouse + touch + stylus uniformly.
  // setPointerCapture ensures we receive events even outside the element.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    setGrabbing(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setCrop((p: any) => ({
      ...p,
      x: p.x + dx,
      y: p.y + dy,
    }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragging.current = false;
    setGrabbing(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5000, background: BG, display: 'flex', flexDirection: 'column', color: TEXT, fontFamily: MONO }}>
      <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${DIMMER}` }}>
        <span style={{ fontSize: 9, letterSpacing: '0.3em', color: DIM }}>ADJUST PROFILE IMAGE</span>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${DIMMER}`, color: DIM, fontFamily: MONO, fontSize: 9, padding: '7px 14px', cursor: 'pointer', letterSpacing: '0.15em' }}>← BACK</button>
      </div>
      {/* touchAction:'none' prevents browser from intercepting touches for scrolling */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: grabbing ? 'grabbing' : 'grab', touchAction: 'none', background: 'transparent' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img src={imageUrl} onLoad={e => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; setIsLandscape(w >= h); }}
          draggable={false}
          style={{ position: 'absolute', top: '50%', left: '50%', width: isLandscape ? 'auto' : 240, height: isLandscape ? 240 : 'auto', minWidth: 240, minHeight: 240, transform: `translate(-50%,-50%) translate(${crop.x}px,${crop.y}px) scale(${crop.scale})`, pointerEvents: 'none', userSelect: 'none', maxWidth: 'none', maxHeight: 'none', objectFit: 'contain' }}
        />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 240, height: 240, borderRadius: '50%', border: `2px solid ${ACCENT}`, transform: 'translate(-50%,-50%)', pointerEvents: 'none', boxShadow: `0 0 0 9999px rgba(0,0,0,0.88)` }} />
      </div>
      <div style={{ padding: '20px 32px 40px', background: BG }}>
        <p style={{ textAlign: 'center', fontSize: 9, letterSpacing: '0.2em', color: DIM, marginBottom: 20 }}>DRAG TO REPOSITION · SLIDER TO SCALE</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <span style={{ fontSize: 9, color: DIM }}>0.2×</span>
          <input type="range" id="modal-profile-crop-scale-range" name="modalProfileCropScale" min="0.2" max="3" step="0.05" value={crop.scale}
            onChange={e => setCrop((p: any) => ({ ...p, scale: parseFloat(e.target.value) }))}
            style={{ flex: 1, accentColor: ACCENT, height: 2 }} />
          <span style={{ fontSize: 9, color: DIM }}>3×</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '14px', background: 'none', border: `1px solid ${DIMMER}`, color: DIM, fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', cursor: 'pointer' }}>CANCEL</button>
          <button onClick={() => onSave(crop)} style={{ flex: 1, padding: '14px', background: ACCENT, border: 'none', color: '#111', fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', fontWeight: 700, cursor: 'pointer' }}>CONFIRM</button>
        </div>
      </div>
    </div>
  );
};

// Module-level cache: avoids re-fetching 200+ JSON files on every mount
let _cachedArtistDb: Record<string, Array<any>> | null = null;
let _cachedAllArtists: any[] | null = null;

// ── Main Component ─────────────────────────────────────────────────
const OnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0); // 0=date, 1=artist, 2=crop, 3=taste (first sign-in only)
  /* not yet onboarded: the taste step follows the profile */
  const [firstTime, setFirstTime] = useState(false);
  const [tasteCount, setTasteCount] = useState(0);
  const { language } = useLanguage();

  const [nickname, setNickname] = useState("");
  const [birthDateInput, setBirthDateInput] = useState("");
  const [birthYear, setBirthYear] = useState<number>(() => Math.max(1900, new Date().getFullYear() - 24));
  const [birthMonth, setBirthMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [birthDay, setBirthDay] = useState<number>(() => new Date().getDate());

  const [recommendedArtists, setRecommendedArtists] = useState<Array<any>>([]);
  const [selectedArtist, setSelectedArtist] = useState<any>(null);
  const [artistDatabase, setArtistDatabase] = useState<Record<string, Array<any>>>({});
  const [selectedImage, setSelectedImage] = useState<string>("");

  const [crop, setCrop] = useState({ x: 0, y: 0, scale: 1 });
  const cropRef = useRef({ x: 0, y: 0, scale: 1 });
  // Editor's preview image natural aspect (height/width). Used to set an
  // explicit pixel height on the <img> so the editor renders identically
  // on Android WebView and iOS WebKit; `height: auto` gets resolved on
  // different timelines relative to the transform on the two engines.
  const [cropImgAspect, setCropImgAspect] = useState<number>(1.5);

  const [loading, setLoading] = useState(false);
  const [artistDataLoading, setArtistDataLoading] = useState(true); // true while collection files are fetching

  const [searchByBirthday, setSearchByBirthday] = useState(true);
  const [artistSearchQuery, setArtistSearchQuery] = useState('');
  const [allArtists, setAllArtists] = useState<any[]>([]);
  const [workerArtistArtworks, setWorkerArtistArtworks] = useState<Record<string, string[]>>({});

  // Touch swipe state for artist navigation
  const swipeStartX = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);

  const initialUserPref = React.useRef<{ artistName: string; photoURL: string; crop: ProfileImageCrop | null } | null>(null);

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  const normalizeNameKey = (value: string) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .trim();

  useEffect(() => {
    const worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { type, works, artist } = event.data || {};
      if (type === 'LOAD_COMPLETE') {
        workerReadyRef.current = true;
        return;
      }

      if (type === 'ARTIST_WORKS') {
        const key = normalizeNameKey(String(artist || ""));
        if (!key) return;
        const urls = Array.from(
          new Set(
            ((works || []) as any[])
              .map((item: any) => item?.image || item?.i || item?.imageUrl)
              .filter((value: any) => typeof value === 'string' && value.trim().length > 0),
          ),
        );

        if (urls.length > 0) {
          setWorkerArtistArtworks((prev) => ({ ...prev, [key]: urls }));
        }
      }
    };

    worker.postMessage({ type: 'SET_MODE', mode: getWorkerNetworkMode() });
    worker.postMessage({ type: 'LOAD' });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedArtist?.name) return;
    const key = normalizeNameKey(selectedArtist.name);
    if (!key || workerArtistArtworks[key]?.length) return;
    if (!workerRef.current || !workerReadyRef.current) return;
    workerRef.current.postMessage({ type: 'GET_ARTIST_WORKS', query: selectedArtist.name });
  }, [selectedArtist, workerArtistArtworks]);

  // 1. Load User
  useEffect(() => {
    if (user) {
      const loadUser = async () => {
        const db = getFirestore();
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        if (data.nickname) setNickname(data.nickname);
        else if (user.displayName) setNickname(user.displayName || "");
        if (data.birthDate) {
          setBirthDateInput(data.birthDate);
          const parsed = String(data.birthDate).split('.');
          if (parsed.length === 3) {
            const y = Number(parsed[0]);
            const m = Number(parsed[1]);
            const d = Number(parsed[2]);
            if (Number.isFinite(y) && y >= 1900) setBirthYear(y);
            if (Number.isFinite(m) && m >= 1 && m <= 12) setBirthMonth(m);
            if (Number.isFinite(d) && d >= 1 && d <= 31) setBirthDay(d);
          }
        }
        if (data.soulmateArtist || data.photoURL) {
          initialUserPref.current = { artistName: data.soulmateArtist, photoURL: data.photoURL, crop: data.profileImageCrop };
        }
        /* a member who finished the profile but left during taste goes straight back to it */
        const onboarded = !!data.isOnboarded;
        setFirstTime(!onboarded);
        if (!onboarded && data.birthDate && data.photoURL) setStep(3);
      };
      loadUser();
    }
  }, [user]);

  useEffect(() => {
    const clampDay = Math.max(1, Math.min(31, birthDay));
    const formatted = `${birthYear}.${String(birthMonth).padStart(2, '0')}.${String(clampDay).padStart(2, '0')}`;
    setBirthDateInput(formatted);
  }, [birthYear, birthMonth, birthDay]);

  // 2. Load Artist Database
  useEffect(() => {
    const loadArtistData = async () => {
      try {
        const localArtworksByArtist: Record<string, any[]> = {};
        const normalize = (n: string) => n.toLowerCase().replace(/\s+/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const addArtwork = (art: any) => {
          if (art.artist) {
            const key = normalize(art.artist);
            if (!localArtworksByArtist[key]) localArtworksByArtist[key] = [];
            localArtworksByArtist[key].push(art);
          }
        };
        const collectionFilesSet = new Set<string>();
        (exhibitions as any[]).forEach(museum => {
          if (museum.rooms) Object.values(museum.rooms).forEach((roomArts: any) => { if (Array.isArray(roomArts)) roomArts.forEach(addArtwork); });
          if (museum.items && Array.isArray(museum.items)) museum.items.forEach(addArtwork);
          const allExhibitions = [...(museum.permanentExhibitions || []), ...(museum.temporaryExhibitions || []), ...(museum.pastExhibitions || [])];
          allExhibitions.forEach((ex: any) => { if (ex.collectionFile) collectionFilesSet.add(ex.collectionFile); });
        });
        ['orangerie-collection.json', 'pompidou-painting-collection.json', 'basel-collection.json', 'mam-painting-collection.json', 'kunsthaus-collection.json'].forEach(f => collectionFilesSet.add(f));
        const collectionFiles = Array.from(collectionFilesSet);

        const BATCH_SIZE = 20;
        const loadFile = async (filename: string) => {
          try {
            const resp = await fetch(`/data/${filename}`);
            if (!resp.ok) return;
            const data = await resp.json();
            let items: any[] = Array.isArray(data) ? data : (data.objects || data.items || []);
            items.forEach(art => {
              const artistName = art.artist || art.a;
              const imageUrl = art.image || art.imageUrl || art.i;
              if (artistName && imageUrl) addArtwork({ artist: artistName, image: imageUrl });
            });
          } catch (e) { }
        };
        for (let i = 0; i < collectionFiles.length; i += BATCH_SIZE) {
          await Promise.all(collectionFiles.slice(i, i + BATCH_SIZE).map(loadFile));
        }

        const res = await fetch('/data/artists-dates.json');
        if (res.ok) {
          const data = await res.json();

          // ── Phase 1: collect + canonicalize into a merged map ──────
          // key = normalize(canonicalName), value = merged artist data
          const canonicalMap = new Map<string, {
            name: string; artworks: string[]; imageUrl: string;
            deathYear?: number; deathDate?: string;
          }>();

          Object.values(data).forEach((artist: any) => {
            if (!artist.name) return;

            const canonicalName = getCanonicalName(artist.name);
            if (!canonicalName) return;
            const canonKey = normalize(canonicalName);

            // Collect artworks from local files (try both original and canonical name, deduplicate)
            const localArts: string[] = [];
            const localUrlsSeen = new Set<string>();
            const addLocal = (la: any) => { if (la.image && !localUrlsSeen.has(la.image)) { localUrlsSeen.add(la.image); localArts.push(la.image); } };
            (localArtworksByArtist[normalize(artist.name)] || []).forEach(addLocal);
            if (normalize(artist.name) !== canonKey) (localArtworksByArtist[canonKey] || []).forEach(addLocal);

            // Collect remote artworks (exclude profile photo)
            const remoteArts: string[] = [];
            if (artist.artworks && Array.isArray(artist.artworks)) {
              const nu = (u: string) => u ? u.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
              const profileNorm = nu(artist.imageUrl);
              artist.artworks.forEach((url: string) => {
                if (url && nu(url) !== profileNorm) remoteArts.push(url);
              });
            }

            // Only use remote artworks if we don't have enough local ones
            // (remote Wikimedia URLs are often duplicates of local R2 CDN artworks
            //  but with different filenames, so filename dedup can't catch them)
            const allArts = (localArts.length >= 10 ? localArts : [...localArts, ...remoteArts]).filter(Boolean);
            if (allArts.length === 0 && artist.imageUrl) allArts.push(artist.imageUrl);

            // Parse death date
            let deathYear: number | undefined;
            let deathDate: string | undefined;
            if (artist.deathDate) {
              const p = artist.deathDate.split('.');
              if (p.length === 3) { deathYear = parseInt(p[0]); deathDate = artist.deathDate; }
            }

            if (canonicalMap.has(canonKey)) {
              // Merge into existing entry
              const existing = canonicalMap.get(canonKey)!;
              existing.artworks.push(...allArts);
              if (deathYear && !existing.deathYear) { existing.deathYear = deathYear; existing.deathDate = deathDate; }
              if (!existing.imageUrl && artist.imageUrl) existing.imageUrl = artist.imageUrl;
            } else {
              canonicalMap.set(canonKey, { name: canonicalName, artworks: allArts, imageUrl: artist.imageUrl || '', deathYear, deathDate });
            }
          });

          // ── Phase 2: deduplicate artworks per artist + build output ─
          const lookup: Record<string, Array<any>> = {};
          const flatArtists: any[] = [];

          canonicalMap.forEach((artistData) => {
            // Deduplicate: by normalized URL, then by filename (catches same image at different CDNs/protocols)
            const seenNormUrls = new Set<string>();
            const seenFilenames = new Set<string>();
            const normUrl = (u: string) => u.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
            const deduped = artistData.artworks.filter((url: string) => {
              if (!url) return false;
              const normed = normUrl(url);
              if (seenNormUrls.has(normed)) return false;
              seenNormUrls.add(normed);
              const filename = normed.split('/').pop()?.split('?')[0] || '';
              if (filename.length > 4) {
                if (seenFilenames.has(filename)) return false;
                seenFilenames.add(filename);
              }
              return true;
            });

            if (deduped.length < 5) return;

            const artistObj = {
              name: artistData.name,
              image: deduped[0],
              artworks: deduped,
              imageUrl: artistData.imageUrl,
              deathYear: artistData.deathYear,
            };

            flatArtists.push(artistObj);

            if (artistData.deathDate) {
              const p = artistData.deathDate.split('.');
              if (p.length === 3) {
                const key = `${p[1]}-${p[2]}`;
                if (!lookup[key]) lookup[key] = [];
                lookup[key].push(artistObj);
              }
            }
          });

          Object.values(lookup).forEach(list => list.sort((a, b) => (b.artworks?.length || 0) - (a.artworks?.length || 0)));
          setArtistDatabase(lookup);
          setAllArtists(flatArtists);
        }
      } catch (e) { console.error("Failed to load artist dates", e); }
      finally { setArtistDataLoading(false); }
    };
    loadArtistData();
  }, []);

  // 3. Birthday match
  useEffect(() => {
    if (!searchByBirthday) return;
    if (birthDateInput.length === 10 && Object.keys(artistDatabase).length > 0) {
      const parts = birthDateInput.split('.');
      if (parts.length === 3) {
        const targetMonth = parseInt(parts[1], 10);
        const targetDay = parseInt(parts[2], 10);
        const key = `${parts[1]}-${parts[2]}`;
        let artists = artistDatabase[key];
        if (!artists || artists.length === 0) {
          for (let offset = 1; offset <= 7; offset++) {
            const plusDate = new Date(2000, targetMonth - 1, targetDay + offset);
            const plusKey = `${String(plusDate.getMonth() + 1).padStart(2, '0')}-${String(plusDate.getDate()).padStart(2, '0')}`;
            if (artistDatabase[plusKey]) { artists = artistDatabase[plusKey]; break; }
            const minusDate = new Date(2000, targetMonth - 1, targetDay - offset);
            const minusKey = `${String(minusDate.getMonth() + 1).padStart(2, '0')}-${String(minusDate.getDate()).padStart(2, '0')}`;
            if (artistDatabase[minusKey]) { artists = artistDatabase[minusKey]; break; }
          }
        }
        if (!artists && Object.keys(artistDatabase).length > 0) artists = artistDatabase[Object.keys(artistDatabase)[0]];
        if (artists && artists.length > 0) {
          setRecommendedArtists(artists);
          if (initialUserPref.current?.artistName) {
            const found = artists.find((a: any) => a.name === initialUserPref.current!.artistName);
            if (found) setSelectedArtist(found);
            else { setSearchByBirthday(false); setArtistSearchQuery(initialUserPref.current.artistName); return; }
          } else {
            setSelectedArtist(artists[0]);
          }
        } else {
          setRecommendedArtists([]);
          setSelectedArtist(null);
        }
      }
    }
  }, [artistDatabase, birthDateInput, searchByBirthday]);

  // 3b. Name search
  useEffect(() => {
    if (searchByBirthday) return;
    if (allArtists.length === 0) return;
    const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');
    const query = normalize(artistSearchQuery);
    if (!query || query.length < 1) {
      const defaultSet = allArtists.slice(0, 20);
      setRecommendedArtists(defaultSet);
      if (defaultSet.length > 0) setSelectedArtist(defaultSet[0]);
      return;
    }
    const matched = allArtists.filter(artist => normalize(artist.name).includes(query));
    matched.sort((a, b) => {
      const aName = normalize(a.name), bName = normalize(b.name);
      if (aName === query && bName !== query) return -1;
      if (bName === query && aName !== query) return 1;
      if (aName.startsWith(query) && !bName.startsWith(query)) return -1;
      if (bName.startsWith(query) && !aName.startsWith(query)) return 1;
      return (b.artworks?.length || 0) - (a.artworks?.length || 0);
    });
    const limited = matched.slice(0, 50);
    setRecommendedArtists(limited);
    if (limited.length > 0) setSelectedArtist(limited[0]);
    else setSelectedArtist(null);
  }, [artistSearchQuery, searchByBirthday, allArtists]);

  // Update selectedImage when selectedArtist changes
  useEffect(() => {
    if (!selectedArtist) return;
    if (initialUserPref.current?.artistName === selectedArtist.name) {
      const pref = initialUserPref.current;
      if (pref?.photoURL) setSelectedImage(pref.photoURL);
      else if (selectedArtist.artworks?.[0]) setSelectedImage(selectedArtist.artworks[0]);
      else setSelectedImage(selectedArtist.image);
      if (pref?.crop) setCrop(pref.crop);
    } else {
      if (selectedArtist.artworks?.[0]) setSelectedImage(selectedArtist.artworks[0]);
      else setSelectedImage(selectedArtist.image);
      setCrop({ x: 0, y: 0, scale: 1 });
    }
  }, [selectedArtist]);

  useEffect(() => {
    if (initialUserPref.current?.photoURL === selectedImage) {
      setTimeout(() => { initialUserPref.current = null; }, 500);
      return;
    }
    if (!initialUserPref.current) setCrop({ x: 0, y: 0, scale: 1 });
  }, [selectedImage]);

  // Handlers
  const handleBirthDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length > 4) val = val.substring(0, 4) + '.' + val.substring(4);
    if (val.length > 7) val = val.substring(0, 7) + '.' + val.substring(7);
    if (val.length > 10) val = val.substring(0, 10);
    setBirthDateInput(val);
  };

  const cropPreviewSize = 292;
  const CROP_MIN = 0.2;
  const CROP_MAX = 3;
  const clampScale = (v: number) => Math.min(CROP_MAX, Math.max(CROP_MIN, Math.round(v * 100) / 100));
  const cropMaskSize = 150;
  const cropScaleFactor = cropPreviewSize / 240;

  const handleSubmit = async () => {
    if (!user || birthDateInput.length !== 10) return;
    const safeNickname = nickname?.trim() || user.displayName || user.email?.split('@')[0] || 'Art Explorer';
    const latestCrop = cropRef.current || { x: 0, y: 0, scale: 1 };
    const normalizedCrop = {
      x: Number.isFinite(Number(latestCrop.x)) ? Number(latestCrop.x) : 0,
      y: Number.isFinite(Number(latestCrop.y)) ? Number(latestCrop.y) : 0,
      scale: Math.max(0.2, Number.isFinite(Number(latestCrop.scale)) ? Number(latestCrop.scale) : 1),
      previewSize: cropPreviewSize,
      maskSize: cropMaskSize,
      fitMode: 'contain' as const,
    };
    setLoading(true);
    try {
      const db = getFirestore();
      /* on a first sign-in the profile is kept now and the member is
         onboarded only when the taste step ends */
      await setDoc(doc(db, "users", user.uid), {
        nickname: safeNickname, birthDate: birthDateInput, photoURL: selectedImage,
        displayName: safeNickname, email: user.email, ...(firstTime ? {} : { isOnboarded: true }),
        updatedAt: new Date(), soulmateArtist: selectedArtist ? selectedArtist.name : null,
        profileImageCrop: normalizedCrop
      }, { merge: true });
      try { await updateProfile(user, { displayName: safeNickname, photoURL: selectedImage || "" }); } catch (e) { }
      window.dispatchEvent(new CustomEvent('profile-updated'));
      if (firstTime) setStep(3);
      else navigate('/', { replace: true });
    } catch (err: any) { alert("저장 실패: " + err.message); } finally { setLoading(false); }
  };

  const finishOnboarding = async () => {
    if (!user) return;
    try {
      await setDoc(doc(getFirestore(), "users", user.uid), { isOnboarded: true, updatedAt: new Date() }, { merge: true });
      sessionStorage.setItem(`onboarded_${user.uid}`, 'true');
      window.dispatchEvent(new CustomEvent('profile-updated'));
      navigate('/mypage', { replace: true });
    } catch (err: any) { alert("저장 실패: " + err.message); }
  };

  // ── Artist navigation (simple prev/next, no drag) ──────────────
  const curIdx = recommendedArtists.indexOf(selectedArtist);
  const total = recommendedArtists.length;

  const goToPrev = () => {
    if (total < 2) return;
    const newIdx = (curIdx - 1 + total) % total;
    setSelectedArtist(recommendedArtists[newIdx]);
  };
  const goToNext = () => {
    if (total < 2) return;
    const newIdx = (curIdx + 1) % total;
    setSelectedArtist(recommendedArtists[newIdx]);
  };

  // Touch swipe handlers for artist navigation
  const onSwipeStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    if (swipeStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0) goToNext();
      else goToPrev();
    }
    swipeStartX.current = null;
  };

  // Keyboard arrow support
  useEffect(() => {
    if (step !== 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, curIdx, total]);

  const prevArtist = total > 1 ? recommendedArtists[(curIdx - 1 + total) % total] : null;
  const nextArtist = total > 1 ? recommendedArtists[(curIdx + 1) % total] : null;

  const relevantArtworks = (() => {
    if (!selectedArtist) return [];
    const key = normalizeNameKey(selectedArtist.name || '');
    const workerUrls = key ? workerArtistArtworks[key] || [] : [];
    const seedUrls = selectedArtist.artworks?.length > 0 ? (selectedArtist.artworks as string[]) : [];
    const merged = Array.from(new Set([...workerUrls, ...seedUrls])).filter(Boolean);
    return merged.map((url: string) => ({ image: url }));
  })();

  const canProceedStep1 = birthDateInput.length === 10;
  const artistYear = selectedArtist?.deathYear;
  const userYear = birthDateInput.length === 10 ? parseInt(birthDateInput.split('.')[0]) : null;
  const yearMin = 1900;
  const yearMax = Math.max(yearMin + 1, new Date().getFullYear() - 10);
  const daysInMonth = new Date(birthYear, birthMonth, 0).getDate();
  useEffect(() => {
    if (birthDay > daysInMonth) setBirthDay(daysInMonth);
  }, [birthDay, daysInMonth]);

  /* the birthday is kept before the artist is chosen, so a search by name
     in the next step starts from a saved birthday */
  const [savingBirth, setSavingBirth] = useState(false);
  const saveBirthDate = async () => {
    if (!user || !canProceedStep1) return;
    setSavingBirth(true);
    try {
      await setDoc(doc(getFirestore(), "users", user.uid), { birthDate: birthDateInput, updatedAt: new Date() }, { merge: true });
      setSearchByBirthday(true);
      setStep(1);
    } catch (err: any) { alert("저장 실패: " + err.message); } finally { setSavingBirth(false); }
  };

  const [isCropDragging, setIsCropDragging] = useState(false);
  const cropLast = useRef({ x: 0, y: 0 });

  const onCropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    cropLast.current = { x: e.clientX, y: e.clientY };
    setIsCropDragging(true);
  };

  const onCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isCropDragging) return;
    const dx = e.clientX - cropLast.current.x;
    const dy = e.clientY - cropLast.current.y;
    cropLast.current = { x: e.clientX, y: e.clientY };
    setCrop((prev) => ({ ...prev, x: prev.x + dx / cropScaleFactor, y: prev.y + dy / cropScaleFactor }));
  };

  const onCropPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsCropDragging(false);
  };

  // ── Render ─────────────────────────────────────────────────────
  // Four steps on a first sign-in (birthday, a work for the photo, its crop,
  // then taste); three when the profile is edited later. Each slide is its
  // own scrolling column so the page itself never moves.
  const stepCount = firstTime ? 4 : 3;
  const slideClass = (s: number) => `ob-slide${step === s ? ' is-on' : step > s ? ' is-past' : ''}`;
  const bornArtists = recommendedArtists.slice(0, 6);
  const years = Array.from({ length: yearMax - yearMin + 1 }, (_, i) => yearMin + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const nav = [
    { label: '다음', disabled: !canProceedStep1 || savingBirth, go: saveBirthDate },
    { label: '다음', disabled: !selectedImage, go: () => selectedImage && setStep(2) },
    { label: loading ? '저장 중' : firstTime ? '다음' : '저장하기', disabled: loading || !selectedImage, go: handleSubmit },
    { label: tasteCount >= TASTE_GOAL ? '완료' : `${tasteCount} / ${TASTE_GOAL}`, disabled: tasteCount < TASTE_GOAL, go: finishOnboarding },
  ][step];
  const photoOf = (artist: any) => thumbUrl(artist?.artworks?.[0] || artist?.image || '', 120);

  return (
    <div className="ob">
      <div className="ob-top">
        <span className="ob-top__mark" aria-hidden="true" />
        <ol className="ob-steps" aria-label={`${step + 1} / ${stepCount}`}>
          {Array.from({ length: stepCount }, (_, i) => <li key={i} className={step >= i ? 'is-on' : ''} />)}
        </ol>
        {/* the taste step is the way in; it has no way out but finishing */}
        <button type="button" className="ob-top__mark" onClick={() => navigate('/')} aria-label="닫기" hidden={step === 3}>×</button>
      </div>

      <div className="ob-slides">
        <div className={slideClass(0)}>
          <div className="ob-col">
            <section className="ob-statement">
              <p className="ob-statement__meta">{`COLLY · 시작하기 1/${stepCount}`}</p>
              <h1>{'생일을\n알려 주세요.'}</h1>
              <p>생일 무렵 세상을 떠난 예술가를 찾아, 그 작품으로 프로필 사진을 꾸밉니다.</p>
            </section>

            {/* three wheels, as a phone sets a date: what rests between the gold lines is chosen */}
            <div className="ob-date">
              <p className="ob-date__read" aria-live="polite">{`${birthYear}년 ${birthMonth}월 ${birthDay}일`}</p>
              <div className="ob-date__wheels">
                <DateWheel label="태어난 해" values={years} value={birthYear} onChange={setBirthYear} format={(v) => `${v}년`} />
                <DateWheel label="월" values={months} value={birthMonth} onChange={setBirthMonth} format={(v) => `${v}월`} />
                <DateWheel label="일" values={days} value={birthDay} onChange={setBirthDay} format={(v) => `${v}일`} />
              </div>
            </div>

            {bornArtists.length > 0 && (
              <div>
                <div className="ob-label"><span>{`${birthMonth}월 ${birthDay}일 무렵 세상을 떠난 예술가`}</span></div>
                <div className="ob-born">
                  {bornArtists.map((artist, idx) => (
                    <figure key={artist.name || idx}>
                      <img src={photoOf(artist)} alt="" loading="lazy" decoding="async" />
                      <figcaption>{String(artist.name || '').split(' ')[0]}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        <div className={slideClass(1)}>
          <div className="ob-col">
            <section className="ob-statement ob-statement--tight">
              <p className="ob-statement__meta">{`COLLY · 시작하기 2/${stepCount}`}</p>
              <h1>{'프로필에 쓸\n작품을 고르세요.'}</h1>
              <p>{searchByBirthday
                ? `${birthMonth}월 ${birthDay}일 무렵 세상을 떠난 예술가들입니다. 좋아하는 작가가 따로 있다면 이름으로 찾으세요.`
                : '찾은 작가의 작품에서 고르세요.'}</p>
            </section>

            {/* finding an artist by name is always there, above the list */}
            <label className="ob-search">
              <Search size={17} strokeWidth={1.8} aria-hidden="true" />
              <input
                id="artist-search-input"
                name="artistSearch"
                value={artistSearchQuery}
                onChange={(e) => {
                  setArtistSearchQuery(e.target.value);
                  setSearchByBirthday(e.target.value.trim().length === 0);
                }}
                placeholder="작가 이름으로 직접 찾기"
                autoComplete="off"
              />
              {!searchByBirthday && (
                <button type="button" onClick={() => { setArtistSearchQuery(''); setSearchByBirthday(true); }} aria-label="지우고 생일로 찾기">
                  <X size={16} strokeWidth={1.8} />
                </button>
              )}
            </label>

            <div className="ob-artists" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
              {recommendedArtists.map((artist, idx) => (
                <button
                  key={artist.name || idx}
                  type="button"
                  aria-pressed={selectedArtist?.name === artist.name}
                  onClick={() => { setSelectedArtist(artist); setSelectedImage(artist.artworks?.[0] || artist.image || ''); }}
                >
                  <img src={photoOf(artist)} alt="" loading="lazy" decoding="async" />
                  <span>{String(artist.name || '').split(' ')[0]}</span>
                  {artist?.deathYear && <small>{`${Math.max(1, Math.abs(birthYear - Number(artist.deathYear)))}년 전`}</small>}
                </button>
              ))}
            </div>

            {selectedArtist && (
              <div className="ob-chosen">
                <b>{selectedArtist.name}</b>
                <span>{artistYear ? `${artistYear}년 작고 · ${Math.max(1, Math.abs((userYear || artistYear) - artistYear))}년 전` : '추천 작가'}</span>
              </div>
            )}

            {relevantArtworks.length > 0 ? (
              <div className="ob-works">
                {relevantArtworks.map((art, idx) => (
                  <button
                    key={art.image + idx}
                    type="button"
                    aria-pressed={selectedImage === art.image}
                    aria-label={`작품 ${idx + 1}`}
                    onClick={() => setSelectedImage(art.image)}
                  >
                    <img src={thumbUrl(art.image, 220)} alt="" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="ob-empty">{artistDataLoading ? '작가 정보를 불러오는 중입니다.' : '고를 수 있는 작품이 없습니다.'}</p>
            )}

          </div>
        </div>

        <div className={slideClass(2)}>
          <div className="ob-col">
            <section className="ob-statement ob-statement--tight">
              <p className="ob-statement__meta">{`COLLY · 시작하기 3/${stepCount}`}</p>
              <h1>{'사진에 보일\n부분을 맞추세요.'}</h1>
              <p>그림을 끌어 옮기고, 아래에서 크기와 이름을 정하세요.</p>
            </section>

            <div
              className={isCropDragging ? 'ob-crop is-dragging' : 'ob-crop'}
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerCancel={onCropPointerUp}
              onWheel={(e) => setCrop((prev) => ({ ...prev, scale: clampScale(prev.scale - e.deltaY * 0.002) }))}
            >
              {selectedImage && (
                <img
                  src={thumbUrl(selectedImage, 800)}
                  alt=""
                  draggable={false}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                      const a = img.naturalHeight / img.naturalWidth;
                      if (Number.isFinite(a) && a > 0 && Math.abs(a - cropImgAspect) > 0.001) setCropImgAspect(a);
                    }
                  }}
                  style={{
                    width: cropPreviewSize,
                    height: cropPreviewSize * cropImgAspect,
                    transform: `translate(-50%,-50%) translate(${crop.x * cropScaleFactor}px,${crop.y * cropScaleFactor}px) scale(${crop.scale})`,
                  }}
                />
              )}
              <div
                className="ob-crop__shade"
                style={{
                  WebkitMaskImage: `radial-gradient(circle ${cropMaskSize / 2}px at 50% 50%, transparent 100%, black 100%)`,
                  maskImage: `radial-gradient(circle ${cropMaskSize / 2}px at 50% 50%, transparent 100%, black 100%)`,
                }}
              />
              <div className="ob-crop__ring" style={{ width: cropMaskSize, height: cropMaskSize }} />
            </div>

            {/* size: a gold thread between a smaller and a larger mark */}
            <div className="ob-zoom">
              <button type="button" onClick={() => setCrop((prev) => ({ ...prev, scale: clampScale(prev.scale - 0.15) }))} aria-label="작게">−</button>
              <input
                type="range"
                id="profile-crop-scale-range"
                name="profileCropScale"
                min={CROP_MIN}
                max={CROP_MAX}
                step="0.01"
                value={crop.scale}
                onChange={(e) => setCrop((prev) => ({ ...prev, scale: parseFloat(e.target.value) }))}
                aria-label="크기"
                style={{ ["--fill" as string]: `${((crop.scale - CROP_MIN) / (CROP_MAX - CROP_MIN)) * 100}%` }}
              />
              <button type="button" onClick={() => setCrop((prev) => ({ ...prev, scale: clampScale(prev.scale + 0.15) }))} aria-label="크게">+</button>
            </div>

            {/* the name shown with the picture, changed here */}
            <div className="ob-me">
              <img src={thumbUrl(selectedImage || selectedArtist?.artworks?.[0] || selectedArtist?.image || '', 128)} alt="" loading="lazy" decoding="async" />
              <label>
                <span>이름</span>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value.slice(0, 24))}
                  placeholder={user?.displayName || '이름'}
                  maxLength={24}
                  autoComplete="nickname"
                />
              </label>
            </div>

          </div>
        </div>

        {firstTime && (
          <div className={slideClass(3)}>
            <div className="ob-col ob-col--fill">
              {step === 3 && user && <TasteStep uid={user.uid} ko={language === 'ko'} meta={`COLLY · 시작하기 4/${stepCount}`} onCount={setTasteCount} />}
            </div>
          </div>
        )}
      </div>

      {/* back and on, in the same place on every step: back at the left, on at the right */}
      <nav className="ob-nav" aria-label="단계 이동">
        <button type="button" className="ob-nav__btn ob-nav__btn--back" onClick={() => setStep(step - 1)} hidden={step === 0}>
          <span aria-hidden="true">←</span>이전
        </button>
        <button type="button" className="ob-nav__btn ob-nav__btn--next" onClick={nav.go} disabled={nav.disabled}>
          {nav.label}<span aria-hidden="true">→</span>
        </button>
      </nav>

      <TransitionBadge show={artistDataLoading && step === 1} />
    </div>
  );
};

export default OnboardingPage;
