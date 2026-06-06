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

  // Compact layout when running inside the mobile WebView so the entire
  // birthday step fits on a single screen without scrolling.
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  });
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const [step, setStep] = useState(0); // 0=date, 1=artist, 2=crop

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
      await setDoc(doc(db, "users", user.uid), {
        nickname: safeNickname, birthDate: birthDateInput, photoURL: selectedImage,
        displayName: safeNickname, email: user.email, isOnboarded: true,
        updatedAt: new Date(), soulmateArtist: selectedArtist ? selectedArtist.name : null,
        profileImageCrop: normalizedCrop
      }, { merge: true });
      try { await updateProfile(user, { displayName: safeNickname, photoURL: selectedImage || "" }); } catch (e) { }
      window.dispatchEvent(new CustomEvent('profile-updated'));
      navigate('/', { replace: true });
    } catch (err: any) { alert("저장 실패: " + err.message); } finally { setLoading(false); }
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
  const selectedArtistYearsAgo = artistYear ? Math.max(1, Math.abs(birthYear - artistYear)) : null;
  const yearMin = 1900;
  const yearMax = Math.max(yearMin + 1, new Date().getFullYear() - 10);

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

  // ── Step slide style ───────────────────────────────────────────
  // Slides absolute-fill their parent (the slideContainer below) so the
  // shell's flex layout determines the actual height. Previously each
  // slide had a hard-coded `top: 76px` which was correct for Android (no
  // safe-area-inset on the page) but meant the slide overlapped the
  // header on iOS, where env(safe-area-inset-top) pushes everything
  // ~47–59 px lower. Letting the parent size the slide fixes both.
  const slide = (s: number): React.CSSProperties => ({
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    opacity: step === s ? 1 : 0,
    transform: step === s ? 'translateY(0)' : step > s ? 'translateY(-24px)' : 'translateY(24px)',
    transition: 'opacity 0.45s cubic-bezier(0.25,1,0.5,1), transform 0.45s cubic-bezier(0.25,1,0.5,1)',
    pointerEvents: step === s ? 'auto' : 'none',
  });

  // 44×44 is the iOS HIG / Android Material minimum hit target.
  const HEADER_BTN_STYLE: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: DIM,
    fontFamily: MONO,
    fontSize: 18,
    cursor: 'pointer',
    minWidth: 44,
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  };

  return (
    <div
      className="onboarding-shell"
      style={{
        position: 'fixed',
        inset: 0,
        background: BG,
        zIndex: 1000,
        fontFamily: MONO,
        color: TEXT,
        overflowX: 'hidden',
        overflowY: 'hidden',
        paddingTop: 'env(safe-area-inset-top)',
        // Flex column lets header + progress bar take their natural
        // height and the slide container claim the rest. No hard-coded
        // top offset that has to guess each platform's safe-area.
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? '4px 8px' : '8px 12px', borderBottom: `1px solid ${DIMMER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              aria-label="Back"
              style={HEADER_BTN_STYLE}
            >
              ←
            </button>
          )}
          <div style={{ width: 6, height: 6, background: ACCENT, marginLeft: step > 0 ? 0 : 12 }} />
          <span style={{ fontSize: 10, letterSpacing: '0.25em', color: DIM }}>{'프로필 설정'}</span>
        </div>
        <button
          onClick={() => navigate('/')}
          aria-label="Close"
          style={HEADER_BTN_STYLE}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', gap: 3, padding: '10px 20px 0', flexShrink: 0 }}>
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            style={{
              flex: 1,
              height: 2,
              borderRadius: 1,
              background: step >= idx ? ACCENT : DIMMER,
              transition: 'background-color 0.25s ease',
            }}
          />
        ))}
      </div>

      {/* Slide container fills the remaining flex space and acts as the
          positioning parent for each absolute-positioned slide. */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>

      <div className="onboarding-scroll" style={{ ...slide(0), overflowY: 'auto' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            margin: '0 auto',
            padding: isMobile ? '14px 16px 20px' : '28px 20px 40px',
            boxSizing: 'border-box',
          }}
        >
          <p style={{ fontSize: 9, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.22)', marginBottom: isMobile ? 6 : 10 }}>STEP 1 OF 3</p>
          <h2 style={{ fontSize: isMobile ? 22 : 'clamp(27px,6vw,36px)', letterSpacing: '-0.02em', lineHeight: 1.25, margin: isMobile ? '0 0 6px' : '0 0 8px' }}>
            생년월일을 알려주세요
          </h2>
          <p style={{ fontSize: isMobile ? 11 : 13, color: DIM, lineHeight: 1.5, marginBottom: isMobile ? 18 : 24 }}>
            태어난 해와 날에 맞는 예술가를 찾아드립니다.
          </p>

          <div style={{ marginBottom: isMobile ? 14 : 18 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.24)', marginBottom: isMobile ? 4 : 8 }}>출생 연도</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range"
                id="birth-year-range"
                name="birthYear"
                min={yearMin}
                max={yearMax}
                value={birthYear}
                onChange={(e) => setBirthYear(Number(e.target.value))}
                style={{ flex: 1, accentColor: ACCENT, height: 4, cursor: 'pointer' }}
              />
              <div style={{ minWidth: isMobile ? 54 : 62, textAlign: 'center', padding: isMobile ? '5px 8px' : '8px 12px', borderRadius: 8, border: `1.5px solid ${ACCENT}`, color: ACCENT, fontSize: isMobile ? 13 : 16, fontWeight: 700 }}>
                {birthYear}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: isMobile ? 8 : 14 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.24)', marginBottom: isMobile ? 4 : 8 }}>월</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: isMobile ? 4 : 6 }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const active = birthMonth === m;
                return (
                  <button
                    key={m}
                    onClick={() => setBirthMonth(m)}
                    style={{
                      padding: isMobile ? '6px 2px' : '10px 6px',
                      borderRadius: 7,
                      border: `1px solid ${active ? ACCENT : DIMMER}`,
                      background: active ? 'rgba(212,165,71,0.10)' : 'rgba(255,255,255,0.07)',
                      color: active ? ACCENT : 'rgba(255,255,255,0.62)',
                      fontSize: isMobile ? 10 : 11,
                      fontWeight: active ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {m}월
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: isMobile ? 12 : 24 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.24)', marginBottom: isMobile ? 4 : 8 }}>일</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isMobile ? 4 : 6 }}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                const active = birthDay === d;
                return (
                  <button
                    key={d}
                    onClick={() => setBirthDay(d)}
                    style={{
                      padding: isMobile ? '6px 2px' : '9px 4px',
                      borderRadius: 7,
                      border: `1px solid ${active ? ACCENT : DIMMER}`,
                      background: active ? 'rgba(212,165,71,0.10)' : 'rgba(255,255,255,0.07)',
                      color: active ? ACCENT : 'rgba(255,255,255,0.62)',
                      fontSize: isMobile ? 10 : 11,
                      fontWeight: active ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {recommendedArtists.length > 0 && (
            <div style={{ padding: isMobile ? '10px 12px' : '12px 14px', borderRadius: 10, marginBottom: isMobile ? 14 : 16, background: 'rgba(212,165,71,0.06)', border: '1px solid rgba(212,165,71,0.14)' }}>
              <div style={{ fontSize: 8, letterSpacing: '0.18em', color: ACCENT, marginBottom: isMobile ? 6 : 8 }}>
                {birthMonth}월 {birthDay}일, {Math.max(1, new Date().getFullYear() - birthYear)}년 전 예술가들
              </div>
              <div style={{ display: 'flex', gap: isMobile ? 10 : 10 }}>
                {recommendedArtists.slice(0, 4).map((artist, idx) => (
                  <div key={artist.name || idx} style={{ textAlign: 'center' }}>
                    <div style={{ width: isMobile ? 32 : 36, height: isMobile ? 32 : 36, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 4px', border: `1px solid ${DIMMER}` }}>
                      <img src={thumbUrl(artist.artworks?.[0] || artist.image || '', 96)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ fontSize: 8, color: TEXT, whiteSpace: 'nowrap' }}>{String(artist.name || '').split(' ')[0]}</div>
                    <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)' }}>#{idx + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => { if (canProceedStep1) { setSearchByBirthday(true); setStep(1); } }}
            style={{ width: '100%', padding: isMobile ? '13px' : '14px', borderRadius: 10, background: ACCENT, color: '#000', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', marginBottom: isMobile ? 10 : 12 }}
          >
            나의 예술가 찾기 →
          </button>

          <button
            onClick={() => { setSearchByBirthday(false); setArtistSearchQuery(''); setStep(1); }}
            style={{
              width: '100%',
              padding: isMobile ? '12px 14px' : '15px 16px',
              borderRadius: 10,
              border: '1.5px solid rgba(212,165,71,0.62)',
              background: 'linear-gradient(180deg, rgba(212,165,71,0.16), rgba(212,165,71,0.10))',
              color: '#E9FFAA',
              fontSize: isMobile ? 13 : 13,
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left',
              boxShadow: '0 8px 18px rgba(212,165,71,0.13)',
            }}
          >
            작가 직접 검색하기
            <div style={{ fontSize: isMobile ? 10 : 10, color: 'rgba(233,255,170,0.84)', marginTop: 2 }}>이름으로 빠르게 찾기</div>
          </button>
        </div>
      </div>

      <div className="onboarding-scroll" style={{ ...slide(1), overflowY: 'auto', overflowX: 'hidden' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            margin: '0 auto',
            padding: isMobile ? '14px 16px 20px' : '24px 20px 34px',
            boxSizing: 'border-box',
          }}
        >
          <p style={{ fontSize: 9, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.22)', marginBottom: isMobile ? 8 : 10 }}>STEP 2 OF 3</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? 10 : 14, gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 'clamp(21px,5vw,29px)', letterSpacing: '-0.02em', lineHeight: 1.24, minWidth: 0, flex: 1 }}>
              {birthMonth}월 {birthDay}일, {birthYear}년으로부터 {selectedArtistYearsAgo ? ` ${selectedArtistYearsAgo}년 전` : ''}
            </h2>
            <button
              onClick={() => setSearchByBirthday((prev) => !prev)}
              style={{ border: '1.5px solid rgba(212,165,71,0.65)', borderRadius: 999, background: 'rgba(212,165,71,0.15)', color: '#E9FFAA', fontSize: 11, fontWeight: 700, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {searchByBirthday ? '직접 검색' : '생년 기반'}
            </button>
          </div>

          {!searchByBirthday && (
            <div style={{ marginBottom: 12 }}>
              <input
                id="artist-search-input"
                name="artistSearch"
                value={artistSearchQuery}
                onChange={(e) => setArtistSearchQuery(e.target.value)}
                placeholder="작가 이름 검색..."
                style={{ width: '100%', borderRadius: 10, border: `1px solid ${DIMMER}`, background: 'rgba(255,255,255,0.07)', color: TEXT, fontSize: 14, padding: '11px 13px', outline: 'none' }}
              />
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              overflowY: 'hidden',
              paddingBottom: 6,
              marginBottom: isMobile ? 10 : 14,
              scrollbarWidth: 'none',
              // Constrain panning to horizontal only on this row so it
              // doesn't fight the page's vertical scroll when the user
              // swipes the area, and prevent the scroll from chaining out
              // and shifting the rest of the page sideways.
              touchAction: 'pan-x',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {recommendedArtists.map((artist, idx) => {
              const active = selectedArtist?.name === artist.name;
              return (
                <button
                  key={artist.name || idx}
                  onClick={() => { setSelectedArtist(artist); setSelectedImage(artist.artworks?.[0] || artist.image || ''); }}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 999,
                    border: `1px solid ${active ? ACCENT : DIMMER}`,
                    background: active ? 'rgba(212,165,71,0.10)' : 'rgba(255,255,255,0.07)',
                    padding: '7px 11px 7px 7px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${active ? ACCENT : DIMMER}` }}>
                    <img src={thumbUrl(artist.artworks?.[0] || artist.image || '', 96)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 10, color: active ? ACCENT : TEXT, fontWeight: active ? 700 : 500 }}>{String(artist.name || '').split(' ')[0]}</div>
                      <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)' }}>
                        {artist?.deathYear ? `${Math.max(1, Math.abs(birthYear - Number(artist.deathYear)))}년 전` : `#${idx + 1}`}
                      </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedArtist && (
            <div style={{ padding: '12px 14px', borderRadius: 10, marginBottom: 14, background: 'rgba(255,255,255,0.06)', border: `1px solid ${DIMMER}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                  <img src={thumbUrl(selectedArtist.artworks?.[0] || selectedArtist.image || '', 120)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{selectedArtist.name}</div>
                  <div style={{ fontSize: 10, color: DIM, marginTop: 1 }}>
                    {artistYear ? `${artistYear}년 작고 · ${Math.max(1, Math.abs((userYear || artistYear) - artistYear))}년 전` : '추천 작가'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {relevantArtworks.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginBottom: 18 }}>
              {relevantArtworks.map((art, idx) => {
                const active = selectedImage === art.image;
                return (
                  <button
                    key={art.image + idx}
                    onClick={() => setSelectedImage(art.image)}
                    style={{
                      border: `1px solid ${active ? ACCENT : DIMMER}`,
                      borderRadius: 10,
                      background: 'transparent',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <div style={{ aspectRatio: '1 / 1', position: 'relative' }}>
                      <img
                        src={thumbUrl(art.image, 220)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ position: 'absolute', inset: 0, background: active ? 'linear-gradient(to top, rgba(212,165,71,0.18), transparent)' : 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)' }} />
                      <div style={{ position: 'absolute', left: 6, right: 6, bottom: 6, fontSize: 8, color: '#fff', fontWeight: 700, textAlign: 'left' }}>
                        Artwork {idx + 1}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: DIM, fontSize: 12, padding: '22px 8px' }}>
              {artistDataLoading ? '작가 데이터를 불러오는 중...' : '선택 가능한 작품이 없습니다.'}
            </div>
          )}

          <div
            style={{
              position: 'sticky',
              bottom: 0,
              paddingTop: 10,
              // Respect iOS home-indicator + Android navigation bar so
              // the next-step button isn't hidden behind the system UI.
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
              background: 'linear-gradient(to top, #111111 68%, rgba(17,17,17,0.18))',
            }}
          >
            <button
              onClick={() => selectedImage && setStep(2)}
              disabled={!selectedImage}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 10,
                border: 'none',
                background: selectedImage ? ACCENT : DIMMER,
                color: selectedImage ? '#000' : DIM,
                fontSize: 13,
                fontWeight: 800,
                cursor: selectedImage ? 'pointer' : 'not-allowed',
              }}
            >
              {selectedImage ? '다음 단계로 →' : '작품 선택 후 다음 단계'}
            </button>
          </div>
        </div>
      </div>

      <div className="onboarding-scroll" style={{ ...slide(2), overflowY: 'auto', overflowX: 'hidden' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            margin: '0 auto',
            padding: isMobile ? '14px 16px 20px' : '24px 20px 34px',
            boxSizing: 'border-box',
          }}
        >
          <p style={{ fontSize: 9, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.22)', marginBottom: 10 }}>STEP 3 OF 3</p>
          <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(24px,5.8vw,34px)', letterSpacing: '-0.02em' }}>프로필 영역 선택</h2>
          <p style={{ fontSize: 12, color: DIM, marginBottom: 16 }}>작품 이미지를 드래그해 프로필에 사용할 영역을 조정하세요.</p>

          <div
            onPointerDown={onCropPointerDown}
            onPointerMove={onCropPointerMove}
            onPointerUp={onCropPointerUp}
            onPointerCancel={onCropPointerUp}
            style={{
              width: '100%',
              maxWidth: cropPreviewSize,
              height: 360,
              margin: '0 auto',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 8,
              background: '#0d0d0d',
              border: `1px solid ${DIMMER}`,
              cursor: isCropDragging ? 'grabbing' : 'grab',
              touchAction: 'none',
            }}
          >
            {selectedImage && (
              <img
                src={thumbUrl(selectedImage, 800)}
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    const a = img.naturalHeight / img.naturalWidth;
                    if (Number.isFinite(a) && a > 0 && Math.abs(a - cropImgAspect) > 0.001) {
                      setCropImgAspect(a);
                    }
                  }
                }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: cropPreviewSize,
                  height: cropPreviewSize * cropImgAspect,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  transform: `translate(-50%,-50%) translate(${crop.x * cropScaleFactor}px,${crop.y * cropScaleFactor}px) scale(${crop.scale})`,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            )}

            {/* Darkened overlay with circular cutout */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                pointerEvents: 'none',
                WebkitMaskImage: `radial-gradient(circle ${cropMaskSize / 2}px at 50% 50%, transparent 100%, black 100%)`,
                maskImage: `radial-gradient(circle ${cropMaskSize / 2}px at 50% 50%, transparent 100%, black 100%)`,
              }}
            />

            {/* Circle border */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: cropMaskSize,
                height: cropMaskSize,
                transform: 'translate(-50%,-50%)',
                borderRadius: '50%',
                border: `2px solid ${ACCENT}`,
                pointerEvents: 'none',
              }}
            />
          </div>

          <div style={{ marginTop: 14, marginBottom: 16 }}>
            <input
              type="range"
              id="profile-crop-scale-range"
              name="profileCropScale"
              min="0.2"
              max="3"
              step="0.05"
              value={crop.scale}
              onChange={(e) => setCrop((prev) => ({ ...prev, scale: parseFloat(e.target.value) }))}
              style={{ width: '100%', accentColor: ACCENT }}
            />
          </div>

          {selectedArtist && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${ACCENT}` }}>
                <img src={thumbUrl(selectedImage || selectedArtist.artworks?.[0] || selectedArtist.image || '', 128)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Art Explorer</div>
                <div style={{ fontSize: 11, color: DIM }}>{selectedArtist.name}</div>
              </div>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !selectedImage}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 10,
              border: 'none',
              background: loading || !selectedImage ? DIMMER : ACCENT,
              color: loading || !selectedImage ? DIM : '#000',
              fontSize: 13,
              fontWeight: 800,
              cursor: loading || !selectedImage ? 'not-allowed' : 'pointer',
              // Reserve room below the button for the iOS home indicator
              // / Android nav bar so it isn't hidden behind system UI.
              marginBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            {loading ? '저장 중...' : '저장하기 ✓'}
          </button>
        </div>
      </div>
      </div>

      <TransitionBadge show={artistDataLoading && step === 1} />

      <style>{`
        .onboarding-shell,
        .onboarding-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(212,165,71,0.62) rgba(255,255,255,0.08);
        }
        .onboarding-shell::-webkit-scrollbar,
        .onboarding-scroll::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .onboarding-shell::-webkit-scrollbar-track,
        .onboarding-scroll::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.08);
          border-radius: 999px;
        }
        .onboarding-shell::-webkit-scrollbar-thumb,
        .onboarding-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(212,165,71,0.84), rgba(212,165,71,0.52));
          border-radius: 999px;
          border: 1px solid rgba(212,165,71,0.35);
        }
        .onboarding-shell::-webkit-scrollbar-thumb:hover,
        .onboarding-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(212,165,71,0.96), rgba(212,165,71,0.66));
        }
      `}</style>
    </div>
  );
};

export default OnboardingPage;
