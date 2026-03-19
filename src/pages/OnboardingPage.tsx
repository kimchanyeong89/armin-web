import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { exhibitions } from "../data/exhibitions";
import { getCanonicalName } from "../utils/canonicalArtist";
import DrawingLoader, { TransitionBadge } from "../components/DrawingLoader";

// ── Design Tokens ──────────────────────────────────────────────────
const BG = '#111111';
const TEXT = '#FFFFFF';
const ACCENT = '#CCFF00';
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
              boxShadow: isSelected ? `0 0 10px rgba(204,255,0,0.25)` : 'none',
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
    setCrop((p: any) => ({
      ...p,
      x: p.x + e.clientX - lastPos.current.x,
      y: p.y + e.clientY - lastPos.current.y,
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
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: grabbing ? 'grabbing' : 'grab', touchAction: 'none' }}
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
          <input type="range" min="0.2" max="3" step="0.05" value={crop.scale}
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

// ── Main Component ─────────────────────────────────────────────────
const OnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0); // 0=welcome, 1=profile, 2=soulmate

  const [nickname, setNickname] = useState("");
  const [birthDateInput, setBirthDateInput] = useState("");

  const [recommendedArtists, setRecommendedArtists] = useState<Array<any>>([]);
  const [selectedArtist, setSelectedArtist] = useState<any>(null);
  const [artistDatabase, setArtistDatabase] = useState<Record<string, Array<any>>>({});
  const [selectedImage, setSelectedImage] = useState<string>("");

  const [showCropModal, setShowCropModal] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0, scale: 1 });
  const [currentImageIsLandscape, setCurrentImageIsLandscape] = useState(true);

  const [loading, setLoading] = useState(false);
  const [artistDataLoading, setArtistDataLoading] = useState(true); // true while collection files are fetching

  const [searchByBirthday, setSearchByBirthday] = useState(true);
  const [artistSearchQuery, setArtistSearchQuery] = useState('');
  const [allArtists, setAllArtists] = useState<any[]>([]);

  // Touch swipe state for artist navigation
  const swipeStartX = useRef<number | null>(null);

  const initialUserPref = React.useRef<{ artistName: string; photoURL: string; crop: any } | null>(null);

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
        if (data.birthDate) setBirthDateInput(data.birthDate);
        if (data.soulmateArtist || data.photoURL) {
          initialUserPref.current = { artistName: data.soulmateArtist, photoURL: data.photoURL, crop: data.profileImageCrop };
        }
      };
      loadUser();
    }
  }, [user]);

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
      if (pref.photoURL) setSelectedImage(pref.photoURL);
      else if (selectedArtist.artworks?.[0]) setSelectedImage(selectedArtist.artworks[0]);
      else setSelectedImage(selectedArtist.image);
      if (pref.crop) setCrop(pref.crop);
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

  const handleSubmit = async () => {
    if (!user || !nickname || birthDateInput.length !== 10) return;
    setLoading(true);
    try {
      const db = getFirestore();
      await setDoc(doc(db, "users", user.uid), {
        nickname, birthDate: birthDateInput, photoURL: selectedImage,
        displayName: nickname, email: user.email, isOnboarded: true,
        updatedAt: new Date(), soulmateArtist: selectedArtist ? selectedArtist.name : null,
        profileImageCrop: crop
      }, { merge: true });
      try { await updateProfile(user, { displayName: nickname, photoURL: selectedImage || "" }); } catch (e) { }
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
    if (step !== 2) return;
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
    if (selectedArtist.artworks?.length > 0) {
      return Array.from(new Set(selectedArtist.artworks as string[])).filter(Boolean).map((url: string) => ({ image: url }));
    }
    return [];
  })();

  const canProceedStep1 = nickname.trim().length > 0 && birthDateInput.length === 10;
  const artistYear = selectedArtist?.deathYear;
  const userYear = birthDateInput.length === 10 ? parseInt(birthDateInput.split('.')[0]) : null;

  // ── Step slide style ───────────────────────────────────────────
  const slide = (s: number): React.CSSProperties => ({
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    opacity: step === s ? 1 : 0,
    transform: step === s ? 'translateY(0)' : step > s ? 'translateY(-24px)' : 'translateY(24px)',
    transition: 'opacity 0.45s cubic-bezier(0.25,1,0.5,1), transform 0.45s cubic-bezier(0.25,1,0.5,1)',
    pointerEvents: step === s ? 'auto' : 'none',
  });

  // No full-screen blocking — badge floats above onboarding UI

  return (
    <div style={{ position: 'fixed', inset: 0, background: BG, zIndex: 1000, fontFamily: MONO, color: TEXT, overflow: 'hidden' }}>

      {/* ── STEP 0: WELCOME ─────────────────────────────────────── */}
      <div style={{ ...slide(0), alignItems: 'center', justifyContent: 'center', padding: '40px 40px' }}>
        <div style={{ position: 'relative', marginBottom: 36 }}>
          <GlobeIcon />
        </div>
        <div style={{ fontSize: 9, letterSpacing: '0.5em', color: DIM, marginBottom: 16, textAlign: 'center' }}>A R M I N</div>
        <h1 style={{ fontSize: 'clamp(36px, 12vw, 54px)', fontWeight: 700, lineHeight: 0.95, textAlign: 'center', margin: '0 0 8px', letterSpacing: '-0.02em', width: '100%' }}>
          WELCOME
        </h1>
        <h1 style={{ fontSize: 'clamp(36px, 12vw, 54px)', fontWeight: 700, lineHeight: 0.95, textAlign: 'center', margin: '0 0 36px', letterSpacing: '-0.02em', color: ACCENT, width: '100%' }}>
          ABOARD
        </h1>
        <p style={{ fontSize: 10, color: DIM, textAlign: 'center', maxWidth: 260, lineHeight: 1.9, marginBottom: 52, letterSpacing: '0.08em' }}>
          EXPLORE MUSEUM COLLECTIONS<br />FROM AROUND THE WORLD.<br />LET'S BUILD YOUR PROFILE.
        </p>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <Corners color={ACCENT} size={12} />
          <button onClick={() => setStep(1)} style={{
            display: 'block', padding: '18px 48px', background: ACCENT, color: '#111', border: 'none',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.3em', fontWeight: 700, cursor: 'pointer',
          }}>
            BEGIN →
          </button>
        </div>
        <button onClick={() => navigate('/')} style={{ marginTop: 28, background: 'none', border: 'none', color: DIM, fontFamily: MONO, fontSize: 9, letterSpacing: '0.15em', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 4 }}>
          SKIP FOR NOW
        </button>
      </div>

      {/* ── STEP 1: PROFILE ─────────────────────────────────────── */}
      <div style={{ ...slide(1), overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 28px', flexShrink: 0 }}>
          <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', color: DIM, fontFamily: MONO, fontSize: 9, letterSpacing: '0.15em', cursor: 'pointer' }}>← BACK</button>
          <span style={{ fontSize: 9, color: DIM, letterSpacing: '0.2em' }}>01 / 02</span>
        </div>
        <div style={{ height: 1, background: DIMMER, flexShrink: 0 }}>
          <div style={{ height: '100%', width: '50%', background: ACCENT, transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ flex: 1, padding: '36px 28px 32px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: 'clamp(28px, 9vw, 40px)', fontWeight: 700, lineHeight: 1, margin: '0 0 48px', letterSpacing: '-0.02em' }}>
            TELL US<br />ABOUT<br /><span style={{ color: ACCENT }}>YOURSELF</span>
          </h2>
          <div style={{ marginBottom: 40 }}>
            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.3em', color: DIM, marginBottom: 14 }}>YOUR NAME</label>
            <input
              value={nickname} onChange={e => setNickname(e.target.value)} placeholder="nickname..." autoFocus
              style={{ background: 'none', border: 'none', borderBottom: `1px solid ${nickname ? ACCENT : DIMMER}`, color: TEXT, fontFamily: MONO, fontSize: 24, padding: '8px 0', outline: 'none', width: '100%', transition: 'border-color 0.3s' }}
            />
          </div>
          <div style={{ marginBottom: 40 }}>
            <label style={{ display: 'block', fontSize: 9, letterSpacing: '0.3em', color: DIM, marginBottom: 14 }}>DATE OF BIRTH</label>
            <input
              value={birthDateInput} onChange={handleBirthDateChange} placeholder="YYYY.MM.DD" maxLength={10}
              style={{ background: 'none', border: 'none', borderBottom: `1px solid ${birthDateInput.length === 10 ? ACCENT : DIMMER}`, color: birthDateInput.length === 10 ? ACCENT : TEXT, fontFamily: MONO, fontSize: 22, fontWeight: 700, padding: '8px 0', outline: 'none', width: '100%', letterSpacing: '0.04em', transition: 'all 0.3s' }}
            />
            <p style={{ fontSize: 9, color: DIM, marginTop: 10, letterSpacing: '0.08em', lineHeight: 1.7 }}>
              WE'LL FIND AN ARTIST WHO DIED<br />ON YOUR BIRTHDAY
            </p>
          </div>
          <div style={{ marginTop: 'auto' }}>
            <button
              onClick={() => { if (canProceedStep1) setStep(2); }}
              style={{
                width: '100%', padding: '18px', background: canProceedStep1 ? ACCENT : DIMMER,
                border: 'none', color: canProceedStep1 ? '#111' : DIM,
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', fontWeight: 700,
                cursor: canProceedStep1 ? 'pointer' : 'not-allowed', transition: 'all 0.3s',
              }}
            >
              FIND MY ART SOULMATE →
            </button>
          </div>
        </div>
      </div>

      {/* ── STEP 2: ART SOULMATE ─────────────────────────────────── */}
      <div style={{ ...slide(2), overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', flexShrink: 0 }}>
          <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: DIM, fontFamily: MONO, fontSize: 9, letterSpacing: '0.15em', cursor: 'pointer' }}>← BACK</button>
          <span style={{ fontSize: 9, color: DIM, letterSpacing: '0.2em' }}>02 / 02</span>
        </div>
        <div style={{ height: 1, background: DIMMER, flexShrink: 0 }}>
          <div style={{ height: '100%', width: '100%', background: ACCENT }} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 24px 32px', gap: 16 }}>

          {/* Mode toggle + search */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.35em', color: ACCENT, marginBottom: 10 }}>YOUR ART SOULMATE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setSearchByBirthday(true); setArtistSearchQuery(''); }}
                style={{ padding: '5px 12px', background: searchByBirthday ? ACCENT : 'none', border: `1px solid ${searchByBirthday ? ACCENT : DIMMER}`, color: searchByBirthday ? '#111' : DIM, fontFamily: MONO, fontSize: 8, letterSpacing: '0.15em', cursor: 'pointer', transition: 'all 0.2s' }}>
                BY BIRTHDAY
              </button>
              <button onClick={() => setSearchByBirthday(false)}
                style={{ padding: '5px 12px', background: !searchByBirthday ? ACCENT : 'none', border: `1px solid ${!searchByBirthday ? ACCENT : DIMMER}`, color: !searchByBirthday ? '#111' : DIM, fontFamily: MONO, fontSize: 8, letterSpacing: '0.15em', cursor: 'pointer', transition: 'all 0.2s' }}>
                BY NAME
              </button>
            </div>
            {!searchByBirthday && (
              <div style={{ marginTop: 10 }}>
                <input
                  value={artistSearchQuery} onChange={e => setArtistSearchQuery(e.target.value)}
                  placeholder="Search artist name..." autoFocus
                  style={{ background: 'none', border: 'none', borderBottom: `1px solid ${DIMMER}`, color: TEXT, fontFamily: MONO, fontSize: 15, padding: '6px 0', outline: 'none', width: '100%' }}
                />
                {artistSearchQuery && (
                  <span style={{ fontSize: 8, color: DIM, letterSpacing: '0.1em' }}>{recommendedArtists.length} FOUND</span>
                )}
              </div>
            )}
          </div>

          {/* Artist navigation row */}
          {recommendedArtists.length > 0 ? (
            <div style={{ flexShrink: 0 }}>
              {/* Artist name + info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                <div>
                  <h2 style={{ fontSize: 'clamp(18px, 5vw, 26px)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                    {selectedArtist?.name?.toUpperCase() || ''}
                  </h2>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                    {artistYear && (
                      <span style={{ fontSize: 9, color: DIM, letterSpacing: '0.08em' }}>
                        DIED {artistYear}.{birthDateInput.split('.')[1] || '??'}.{birthDateInput.split('.')[2] || '??'}
                      </span>
                    )}
                    {artistYear && userYear && (
                      <span style={{ fontSize: 8, background: ACCENT, color: '#111', padding: '2px 7px', letterSpacing: '0.08em', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {Math.abs(userYear - artistYear)}Y APART
                      </span>
                    )}
                  </div>
                </div>
                {total > 1 && (
                  <span style={{ fontSize: 9, color: DIM, letterSpacing: '0.08em', flexShrink: 0 }}>
                    {curIdx + 1} / {total}
                  </span>
                )}
              </div>

              {/* Three-circle navigation */}
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, userSelect: 'none' }}
                onTouchStart={onSwipeStart}
                onTouchEnd={onSwipeEnd}
              >
                {/* Prev */}
                <div onClick={goToPrev} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  cursor: total > 1 ? 'pointer' : 'default', opacity: total > 1 ? 1 : 0,
                }}>
                  <div style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: DIM }}>‹</span>
                  </div>
                  {prevArtist && (
                    <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${DIMMER}`, opacity: 0.5, flexShrink: 0, background: DIMMER }}>
                      <img src={prevArtist.artworks?.[0] || prevArtist.image || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  )}
                  {prevArtist && (
                    <span style={{ fontSize: 7, color: DIM, letterSpacing: '0.06em', textAlign: 'center', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {prevArtist.name.split(' ').pop()?.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Current (main circle) — tap to adjust crop */}
                <div onClick={() => selectedImage && setShowCropModal(true)} style={{
                  width: 164, height: 164, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                  border: `3px solid ${ACCENT}`, boxShadow: `0 0 32px rgba(204,255,0,0.2), 0 0 0 1px rgba(204,255,0,0.05)`,
                  position: 'relative', cursor: selectedImage ? 'pointer' : 'default', background: '#1c1c1c',
                }}>
                  {selectedImage ? (
                    <img
                      src={selectedImage}
                      onLoad={e => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; setCurrentImageIsLandscape(w >= h); }}
                      style={{
                        position: 'absolute', top: '50%', left: '50%',
                        width: currentImageIsLandscape ? 'auto' : 164,
                        height: currentImageIsLandscape ? 164 : 'auto',
                        minWidth: 164, minHeight: 164, maxWidth: 'none', maxHeight: 'none',
                        transform: `translate(-50%,-50%) translate(${crop.x * (164 / 240)}px,${crop.y * (164 / 240)}px) scale(${crop.scale})`,
                        objectFit: 'contain', pointerEvents: 'none',
                      }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 28, color: DIM }}>?</span>
                    </div>
                  )}
                  {selectedImage && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '12px 0 5px', textAlign: 'center', pointerEvents: 'none' }}>
                      <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em' }}>✎ ADJUST</span>
                    </div>
                  )}
                </div>

                {/* Next */}
                <div onClick={goToNext} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  cursor: total > 1 ? 'pointer' : 'default', opacity: total > 1 ? 1 : 0,
                }}>
                  <div style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: DIM }}>›</span>
                  </div>
                  {nextArtist && (
                    <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${DIMMER}`, opacity: 0.5, flexShrink: 0, background: DIMMER }}>
                      <img src={nextArtist.artworks?.[0] || nextArtist.image || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  )}
                  {nextArtist && (
                    <span style={{ fontSize: 7, color: DIM, letterSpacing: '0.06em', textAlign: 'center', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nextArtist.name.split(' ').pop()?.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {total > 1 && (
                <div style={{ textAlign: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 7, color: DIM, letterSpacing: '0.15em' }}>← SWIPE OR CLICK TO BROWSE →</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ flexShrink: 0, textAlign: 'center', padding: '24px 0', color: DIM, fontSize: 11, letterSpacing: '0.1em' }}>
              {Object.keys(artistDatabase).length === 0 ? 'LOADING ARTISTS...' : 'NO MATCH FOUND'}
            </div>
          )}

          {/* Artwork grid */}
          {relevantArtworks.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <ArtworkGrid items={relevantArtworks} selectedImage={selectedImage} onSelect={setSelectedImage} />
            </div>
          )}

          {/* Submit */}
          <div style={{ flexShrink: 0, marginTop: 'auto' }}>
            <button onClick={handleSubmit} disabled={loading}
              style={{ width: '100%', padding: '18px', background: loading ? DIMMER : ACCENT, border: 'none', color: '#111', fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', fontWeight: 700, cursor: loading ? 'wait' : 'pointer', transition: 'all 0.3s' }}>
              {loading ? 'SAVING...' : 'START EXPLORING →'}
            </button>
          </div>
        </div>
      </div>

      {/* Artist data loading badge — floats above step 2 content */}
      <TransitionBadge show={artistDataLoading && step === 2} />

      {/* Crop Modal */}
      {showCropModal && (
        <ImageCropModal key={selectedImage} imageUrl={selectedImage} initialCrop={crop}
          onClose={() => setShowCropModal(false)}
          onSave={(newCrop: any) => { setCrop(newCrop); setShowCropModal(false); }}
        />
      )}
    </div>
  );
};

export default OnboardingPage;
