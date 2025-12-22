import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { publicUrl } from "../utils/publicUrl";
import type { Exhibition, ExhibitionItem } from "../types/Exhibition";
import { HeartOverlay } from "./HeartOverlay";
import { db, auth } from "../firebase";
import { collection, doc, setDoc, deleteDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

interface ExhibitionDetailsProps {
  exhibition: Exhibition;
  onClose: () => void;
  isOpen: boolean;
  onSelectExhibition: (exhibitionItem: ExhibitionItem) => void;
}

export default function ExhibitionDetails({
  exhibition,
  onClose,
  isOpen,
  onSelectExhibition
}: ExhibitionDetailsProps) {
  // Cache of computed poster fallbacks per exhibition item id
  const posterCacheRef = useRef<Record<string, string>>({});
  // Track exhibitions whose modal dataset has no usable images
  const datasetEmptyRef = useRef<Record<string, boolean>>({});
  // Liked exhibitions feature
  const [likedExhibitions, setLikedExhibitions] = useState<Set<string>>(new Set());
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Slide-in animation state - starts false to trigger animation on mount
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM is ready, then trigger slide-in
      const timer = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => cancelAnimationFrame(timer);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) setLikedExhibitions(new Set());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const q = collection(db, `users/${currentUser.uid}/liked_exhibitions`);
    const unsub = onSnapshot(q, (snap) => {
      const s = new Set<string>();
      snap.forEach(doc => {
        // Use the original exhibitionId from document data, not the sanitized doc.id
        const data = doc.data();
        const originalId = data.exhibitionId || doc.id;
        s.add(originalId);
      });
      setLikedExhibitions(s);
    });
    return () => unsub();
  }, [currentUser]);

  const toggleExhibitionLike = useCallback(async (e: React.MouseEvent, item: ExhibitionItem) => {
    e.stopPropagation();
    e.preventDefault();
    let userToUse = currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await signInWithPopup(auth, provider);
        userToUse = result.user;
      } catch (err) {
        console.error("Login failed", err);
        return;
      }
    }
    if (!userToUse) return;
    // Sanitize exhibition ID: replace slashes and special characters for Firestore path compatibility
    const rawId = item.id;
    const exhibitionId = rawId.replace(/[\/\\#\[\].*]/g, '_').replace(/^https?:_+/i, '').slice(0, 200);
    const isLiked = likedExhibitions.has(rawId);
    const ref = doc(db, `users/${userToUse.uid}/liked_exhibitions/${exhibitionId}`);
    try {
      if (isLiked) {
        setLikedExhibitions(prev => { const next = new Set(prev); next.delete(rawId); return next; });
        await deleteDoc(ref);
      } else {
        setLikedExhibitions(prev => { const next = new Set(prev); next.add(rawId); return next; });
        // Get image: first try item.image, if empty use getFirstArtworkImage
        let exhibitionImage = (item as any).image || '';
        if (!exhibitionImage) {
          const fallbackImage = await getFirstArtworkImage(item.id);
          exhibitionImage = fallbackImage || '';
        }
        await setDoc(ref, {
          likedAt: serverTimestamp(),
          exhibitionId: rawId, // Store original ID for reference
          sanitizedId: exhibitionId, // Store sanitized ID
          name: item.name || '',
          image: exhibitionImage,
          museumName: exhibition.name || '', // Parent museum/gallery name
        });
      }
    } catch (error) {
      console.error("Failed to toggle exhibition like", error);
    }
  }, [currentUser, likedExhibitions]);

  const getFirstArtworkImage = async (exhibitionItemId: string): Promise<string | null> => {
    // cached?
    if (posterCacheRef.current[exhibitionItemId]) return posterCacheRef.current[exhibitionItemId];
    const put = (url?: string | null) => {
      const val = (url && typeof url === 'string' && url.trim()) ? url : '';
      if (val) posterCacheRef.current[exhibitionItemId] = val;
      return val || null;
    };
    try {
      // Known local datasets mirrored by ExhibitionModal
      if (exhibitionItemId === 'vam-painting') {
        const res = await fetch('/data/vam-paintings.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'vam-portraits') {
        const res = await fetch('/data/vam-portraits.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'vam-posters') {
        const res = await fetch('/data/vam-posters.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'vam-photographs') {
        const res = await fetch('/data/vam-photographs.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'npg-floor3-rooms') {
        const res = await fetch('/data/npg-floor3.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const rooms: Array<{ items?: any[] }> = Array.isArray(data.rooms) ? data.rooms : [];
          for (const room of rooms) {
            const pick = (room.items || []).find((it: any) => it && typeof it.image === 'string' && it.image && !/(?:exhibition1\.png|\/(?:1|1\.jpg|1\.png)$)/i.test(it.image));
            if (pick) return put(pick.image);
          }
          datasetEmptyRef.current[exhibitionItemId] = true;
        }
      } else if (exhibitionItemId === 'tm-perm-1') {
        const res = await fetch('/data/tate-collection-highlights-artworks.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const img = items.find((it: any) => it && (it.image || it.thumb))?.image || items.find((it: any) => it && it.thumb)?.thumb || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && (it.image || it.thumb)));
          return put(img);
        }
      } else if (exhibitionItemId === 'tm-perm-3') {
        const res = await fetch('/data/tate-artworks.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const img = items.find((it: any) => it && (it.image || it.thumb))?.image || items.find((it: any) => it && it.thumb)?.thumb || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && (it.image || it.thumb)));
          return put(img);
        }
      } else if (exhibitionItemId === 'tsi-perm-1') {
        // Tate St Ives Collection
        const res = await fetch('/data/tate-st-ives-artworks.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'tbc-perm-1') {
        // Tate Britain Collection
        const res = await fetch('/data/tate-britain-artworks.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'ng-1') {
        // National Gallery Permanent Collection
        const res = await fetch('/data/national-gallery-permanent.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'dpg-1') {
        // Dulwich Picture Gallery Collection
        const res = await fetch('/data/dulwich-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'hayward-gallery-collection') {
        // Hayward Gallery Collection
        const res = await fetch('/data/hayward-gallery-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'ra-1') {
        // Royal Academy Collection
        const res = await fetch('/data/royal-academy-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'serp-collection') {
        // Serpentine Gallery Collection
        const res = await fetch('/data/serpentine-gallery-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'cg-1') {
        // Courtauld Gallery Collection
        const res = await fetch('/data/courtauld-gallery-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'wag-collection') {
        // Walker Art Gallery Collection
        const res = await fetch('/data/walker-art-gallery-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'sng-collection') {
        // Scottish National Gallery Collection
        const res = await fetch('/data/scottish-national-gallery-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'snpg-collection') {
        // Scottish National Portrait Gallery Collection
        const res = await fetch('/data/scottish-national-portrait-gallery-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'sngma-collection') {
        // Scottish National Gallery of Modern Art Collection
        const res = await fetch('/data/scottish-national-gallery-of-modern-art-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'bm-collection') {
        // British Museum Collection
        const res = await fetch('/data/the-british-museum-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'orsay-collection') {
        // Musée d'Orsay Collection
        const res = await fetch('/data/orsay-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'orangerie-collection') {
        // Musée de l'Orangerie Collection
        const res = await fetch('/data/orangerie-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'pinault-collection') {
        // Pinault Collection
        const res = await fetch('/data/pinault-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'mep-photography') {
        // MEP Photography Collection
        const res = await fetch('/data/mep-photography-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.objects) ? data.objects : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'pompidou-cinema') {
        // Centre Pompidou Cinema Collection
        const res = await fetch('/data/pompidou-cinema-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.artworks) ? data.artworks : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'pompidou-painting') {
        // Centre Pompidou Painting Collection
        const res = await fetch('/data/pompidou-painting-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.artworks) ? data.artworks : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'pompidou-drawing') {
        // Centre Pompidou Drawing Collection
        const res = await fetch('/data/pompidou-drawing-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.artworks) ? data.artworks : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'pompidou-newmedia') {
        // Centre Pompidou New Media Collection
        const res = await fetch('/data/pompidou-newmedia-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.artworks) ? data.artworks : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'pompidou-design') {
        // Centre Pompidou Design Collection
        const res = await fetch('/data/pompidou-design-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.artworks) ? data.artworks : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      } else if (exhibitionItemId === 'mam-perm-painting') {
        // MAM Paris Painting Collection
        const res = await fetch('/data/mam-painting-collection.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.artworks) ? data.artworks : [];
          const img = items.find((it: any) => it && it.image)?.image || null;
          datasetEmptyRef.current[exhibitionItemId] = !(items && items.some((it: any) => it && it.image));
          return put(img);
        }
      }
      // Generic: try local cache populated by ExhibitionModal snapshots
      try {
        const cached = localStorage.getItem(`artworks_${exhibitionItemId}`);
        if (cached) {
          const arr = JSON.parse(cached);
          if (Array.isArray(arr)) {
            const hit = arr.find((it: any) => it && it.image)?.image;
            if (hit) return put(hit);
          }
        }
      } catch { }
    } catch {
      // ignore errors, fall through
    }
    return put(null);
  };

  const PosterImg: React.FC<{ item: ExhibitionItem; width?: number; height?: number }> = ({ item, width = 80, height = 100 }) => {
    // Transparent 1x1 PNG as placeholder to avoid showing a visible '1' graphic
    const PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XjVvcAAAAASUVORK5CYII=';
    const isBannedImage = (u?: string | null) => {
      if (!u) return false;
      const s = String(u).trim();
      if (!s) return false;
      // Block our old demo asset and obvious numeric placeholders
      if (/exhibition1\.png$/i.test(s)) return true;
      if (/\/(?:1|1\.jpg|1\.png)$/i.test(s)) return true;
      if (s === '1' || s === '1.jpg' || s === '1.png') return true;
      return false;
    };
    const [src, setSrc] = useState<string | null>(() => {
      // Prefer coverImage first (for display exhibitions), then fallback to image
      const coverImage = (item as any).coverImage as string | undefined;
      const provided = (item as any).image as string | undefined;
      const imageToUse = coverImage || provided;
      return imageToUse && !isBannedImage(imageToUse) ? imageToUse : null;
    });
    const [showUpdateSoon, setShowUpdateSoon] = useState<boolean>(false);
    useEffect(() => {
      let cancelled = false;
      async function ensure() {
        // Check coverImage first, then image
        const coverImage = (item as any).coverImage as string | undefined;
        const imageToCheck = coverImage || (item as any).image;
        if (imageToCheck && !isBannedImage(imageToCheck)) return; // has valid image
        const url = await getFirstArtworkImage(item.id);
        if (cancelled) return;
        if (url) {
          setSrc(url);
        } else {
          // No modal image; if dataset is empty and no homepage image, show 'update soon'
          if (datasetEmptyRef.current[item.id]) {
            setShowUpdateSoon(true);
          } else {
            setSrc(PLACEHOLDER);
          }
        }
      }
      ensure();
      return () => { cancelled = true; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id]);
    if (showUpdateSoon) {
      return (
        <div aria-label="update soon" role="img" title="update soon" style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f0f0', color: '#999', fontSize: 10, fontWeight: 700, textTransform: 'lowercase', letterSpacing: 0.5 }}>
          update soon
        </div>
      );
    }
    return (
      <img
        src={src || PLACEHOLDER}
        alt={item.name}
        style={{ width, height, objectFit: 'cover', display: 'block' }}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          // Try modal-first fallback if not already used
          const target = e.currentTarget;
          (async () => {
            const url = await getFirstArtworkImage(item.id);
            if (!target) return; // Element might be unmounted
            if (url && target.src !== url) {
              target.src = url;
              setShowUpdateSoon(false);
            } else {
              if (datasetEmptyRef.current[item.id] && !(item as any).image) {
                setShowUpdateSoon(true);
              } else if (target.src !== PLACEHOLDER) {
                target.src = PLACEHOLDER;
              }
            }
          })();
        }}
      />
    );
  };
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Format to YYYY-MM-DD from various possible inputs (ISO, yyyy/mm/dd, yyyy.mm.dd, ISO datetime)
  const formatYMD = (input?: string | null): string => {
    if (!input) return "";
    const s = String(input).trim();
    // ISO date-time or date, prefer first 10 chars when in ISO 8601
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
    // yyyy-mm-dd / yyyy.mm.dd / yyyy/mm/dd
    const m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) {
      const [, y, mo, d] = m;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    // Fallback: Date parse and format in UTC to avoid TZ shifts
    const dObj = new Date(s);
    if (!isNaN(dObj.getTime())) {
      const y = dObj.getUTCFullYear();
      const mo = String(dObj.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(dObj.getUTCDate()).padStart(2, "0");
      return `${y}-${mo}-${dd}`;
    }
    return s; // As-is fallback
  };
  const [checking, setChecking] = useState(false);
  async function runHealthcheck() {
    setChecking(true);
    try {
      const { testStorageConnection, testFirestoreConnection } = await import("../utils/firebaseHealth");
      const s = await testStorageConnection();
      const f = await testFirestoreConnection();
      alert(
        `Storage: ${s.ok ? "OK" : `FAIL (${s.code || "unknown"}) - ${s.error}`}\n` +
        `Firestore: ${f.ok ? "OK" : `FAIL (${f.code || "unknown"}) - ${f.error}`}`
      );
    } finally {
      setChecking(false);
    }
  }

  // Local-only image policy: always use exhibition.representativeImage (local)
  const [isPermanentCollapsed, setIsPermanentCollapsed] = useState(false);
  const [isTemporaryCollapsed, setIsTemporaryCollapsed] = useState(false);
  const [isCurrentExhibitionsCollapsed, setIsCurrentExhibitionsCollapsed] = useState(false);
  const [isPastExhibitionsCollapsed, setIsPastExhibitionsCollapsed] = useState(false);
  const [isUpcomingExhibitionsCollapsed, setIsUpcomingExhibitionsCollapsed] = useState(false);
  // Debug overlay removed with header image

  // Optional auto-feed for supported museums: load from local JSON if present
  const [ngOverride, setNgOverride] = useState<Partial<Exhibition> | null>(null);
  useEffect(() => {
    let aborted = false;

    async function loadJsonFeed() {
      if (aborted) return;
      // Determine which JSON file to load based on museum ID
      // Note: Dulwich handled separately via ExhibitionModal for dpg-perm-1
      const feedPath = exhibition.id === 'tate-modern'
        ? '/data/tate-modern.json'
        : exhibition.id === 'tate-britain'
          ? '/data/tate-britain.json'
          : exhibition.id === 'national-gallery'
            ? '/data/national-gallery-exhibitions.json'
            : null;

      if (!feedPath) {
        setNgOverride(null);
        return;
      }

      try {
        const res = await fetch(feedPath, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (aborted) return;

        // Helper to map scraped items to exhibition format
        const mapItem = (it: any) => ({
          id: String(it.id || it.slug || cryptoRandom()),
          name: String(it.name || it.title || ""),
          title: String(it.title || it.name || ""),
          description: String(it.description || ""),
          descriptionHtml: typeof it.descriptionHtml === 'string' ? it.descriptionHtml : undefined,
          detailedDescription: typeof it.detailedDescription === 'string' ? it.detailedDescription : undefined,
          startDate: String(it.startDate || it.start || ""),
          endDate: String(it.endDate || it.end || ""),
          image: typeof it.image === 'string' ? it.image : (typeof it.imageUrl === 'string' ? it.imageUrl : undefined),
          coverImage: typeof it.coverImage === 'string' ? it.coverImage : undefined,
          dateRange: typeof it.dateRange === 'string' ? it.dateRange : undefined,
          url: typeof it.url === 'string' ? it.url : undefined,
        });

        const hasItems = Array.isArray((data as any).items);
        const over: Partial<Exhibition> = {
          representativeImage: exhibition.representativeImage,
          description: typeof data.description === 'string' && data.description ? data.description : exhibition.description,
          temporaryExhibitions: (exhibition.id.startsWith('tate-') || hasItems)
            ? (hasItems ? (data.items as any[]).map(mapItem) : exhibition.temporaryExhibitions)
            : ([
              ...(Array.isArray(data.special) ? data.special.map(mapItem) : []),
              ...(Array.isArray(data.upcoming) ? data.upcoming.map(mapItem) : []),
            ].length ? [
              ...(Array.isArray(data.special) ? data.special.map(mapItem) : []),
              ...(Array.isArray(data.upcoming) ? data.upcoming.map(mapItem) : []),
            ] : exhibition.temporaryExhibitions),
          pastExhibitions: exhibition.id.startsWith('tate-')
            ? (exhibition.pastExhibitions || [])
            : (Array.isArray((data as any).past) ? (data.past as any[]).map(mapItem) : (exhibition.pastExhibitions || [])),
        } as Partial<Exhibition>;

        setNgOverride(over);
      } catch { }
    }

    loadJsonFeed();
    return () => { aborted = true; };
  }, [exhibition]);

  // Load Tate Modern artworks archive (scraped) when viewing tate-modern panel
  useEffect(() => {
    let cancelled = false;
    async function loadTateArtworks() {
      if (!exhibition || (exhibition.id !== 'tate-modern' && exhibition.id !== 'tm-perm-1')) { return; }
      try {
        const dataFile = exhibition.id === 'tm-perm-1' ? '/data/tate-collection-highlights-artworks.json' : '/data/tate-artworks.json';
        const res = await fetch(dataFile, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const items = Array.isArray(json.items) ? json.items : [];
        // Light filtering: drop entries missing title or image entirely
        items.filter((it: any) => it && it.title && (it.thumb || it.image));
        // Limit to first 60 to keep side panel light; can expand later
        // Removed: setTateArtworks(cleaned.slice(0, 60));
      } catch {
        // ignore failures (keep null)
      }
    }
    loadTateArtworks();
    return () => { cancelled = true; };
  }, [exhibition]);

  function cryptoRandom() {
    try {
      const arr = new Uint32Array(2);
      crypto.getRandomValues(arr);
      return `${arr[0].toString(16)}${arr[1].toString(16)}`;
    } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  }

  // Categorize temporary (special) exhibitions by date: upcoming / current / expired
  const { upcomingSpecials, currentSpecials, expiredSpecials } = useMemo(() => {
    const temps = (ngOverride?.temporaryExhibitions ?? exhibition.temporaryExhibitions) || [];
    const now = new Date();
    // Normalize to start of today for comparisons
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const parseSafe = (s?: string | null) => {
      if (!s) return null;
      const d = new Date(s);
      if (isNaN(d.getTime())) return null;
      return d;
    };
    const upcoming: typeof temps = [];
    const current: typeof temps = [];
    const expired: typeof temps = [];
    for (const item of temps) {
      const start = parseSafe(item.startDate as any);
      const end = parseSafe(item.endDate as any);
      // If end is before todayStart, it's expired
      if (end && end < todayStart) {
        expired.push(item);
        continue;
      }
      // If start is after todayStart, it's upcoming
      if (start && start > todayStart) {
        upcoming.push(item);
        continue;
      }
      // Otherwise, consider it current (also covers missing/invalid dates)
      current.push(item);
    }
    return { upcomingSpecials: upcoming, currentSpecials: current, expiredSpecials: expired };
  }, [ngOverride?.temporaryExhibitions, exhibition.temporaryExhibitions]);

  // Merge any expired special exhibitions into the past list for display
  const pastList = useMemo(() => {
    const pastFromData = (ngOverride?.pastExhibitions ?? exhibition.pastExhibitions) || [];
    return [...pastFromData, ...(expiredSpecials || [])];
  }, [ngOverride?.pastExhibitions, exhibition.pastExhibitions, expiredSpecials]);

  // Defensive: hide any stray heading labeled 'EXHIBITIONS' that may be injected by older markup/styles
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll('h1,h2,h3,h4,p,span,div');
    nodes.forEach((el) => {
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      const up = txt.toUpperCase();
      if (up === 'EXHIBITIONS' || up === 'EXHIBITION') {
        (el as HTMLElement).style.display = 'none';
      }
    });
  }, [isOpen, exhibition.id]);

  // Isolate scroll: prevent wheel events from bubbling to the globe/map and stop chain at edges
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Always stop propagation so map listeners never see this wheel
      e.stopPropagation();

      // If we're at the top and scrolling up, or at the bottom and scrolling down,
      // prevent default to avoid scroll chaining to the page/map.
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      const scrollingUp = e.deltaY < 0;
      const scrollingDown = e.deltaY > 0;
      if ((atTop && scrollingUp) || (atBottom && scrollingDown)) {
        e.preventDefault();
      }
    };
    // Use capture and passive: false so we can preventDefault when necessary
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      try { el.removeEventListener('wheel', onWheel, true); } catch { }
    };
  }, [isOpen]);

  return createPortal(
    <div
      ref={rootRef}
      onWheelCapture={(e) => {
        // Prevent wheel events in the details panel from reaching the map/globe
        e.stopPropagation();
      }}
      onWheel={(e) => {
        // Extra safety in bubble phase
        e.stopPropagation();
      }}
      style={{
        position: "fixed",
        top: window.innerWidth < 768 ? 0 : "20px", // Full screen on mobile
        right: 0,
        width: window.innerWidth < 768 ? "100vw" : "min(400px, 90vw)",
        height: window.innerWidth < 768 ? "100%" : "calc(100% - 20px)", // Full height on mobile
        backgroundColor: "#fff",
        overflowY: "auto",
        paddingLeft: "30px",
        paddingRight: "30px", // Make right spacing equal to left spacing
        boxSizing: "border-box", // Include padding within width to avoid clipping on small screens
        boxShadow: "none",
        // Slide-in animation
        transform: isVisible ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        zIndex: 9999,
        // Prevent scroll chaining/propagation to underlying page or map
        overscrollBehavior: "contain",
        // Improve touch/trackpad behavior; allow vertical scrolling only
        touchAction: "pan-y"
      }}
    >
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          fontSize: "1.5rem",
          cursor: "pointer",
          marginBottom: "10px",
          padding: 0,
          color: "#000", // Set arrow color to black
        }}
        aria-label="Back"
      >
        ←
      </button>
      <h2>{exhibition.name}</h2>
      {/* 상단 대표 이미지를 로컬 아카이브에서 표시 (외부 링크/리다이렉트 금지) */}
      {(() => {
        const rep = exhibition.representativeImage || "";
        const isUrl = /^https?:\/\//.test(rep);
        const cleaned = rep.replace(/^\//, "");
        const isLocal = /^images\//.test(cleaned); // only allow files under public/images
        if (!isLocal && !isUrl) return null;
        const src = isUrl ? rep : publicUrl(rep);
        return (
          <div
            style={{
              width: "100%",
              height: "180px",
              margin: "8px 0 10px",
              overflow: "hidden",
              borderRadius: 6,
              background: "#f2f2f2",
              border: "1px solid #e5e5e5"
            }}
            aria-hidden={!src}
          >
            {src ? (
              <img
                src={src}
                alt={`${exhibition.name} building exterior`}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block" }}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : null}
          </div>
        );
      })()}
      {(() => {
        // Build a concise one-line intro from description
        const full = (ngOverride?.description || exhibition.description || "").trim();
        const firstSentence = (() => {
          const match = full.match(/^[^.!?\n]+[.!?]?/);
          return match ? match[0] : full;
        })();
        const intro = firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}…` : firstSentence;
        return (
          <p
            style={{
              fontSize: "0.72rem",
              fontWeight: 400,
              color: "#555",
              marginBottom: "12px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
            title={full}
          >
            {intro}
          </p>
        );
      })()}

      {/* Permanent exhibitions - Top level section */}
      <h3>
        <button
          onClick={() => setIsPermanentCollapsed(!isPermanentCollapsed)}
          style={{
            marginRight: "8px",
            fontSize: "0.7rem",
            padding: "2px 5px",
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: "3px",
            cursor: "pointer"
          }}
        >
          {isPermanentCollapsed ? "▶" : "▼"}
        </button>
        Permanent
      </h3>

      {!isPermanentCollapsed && (
        <>
          {(() => {
            const list = exhibition.permanentExhibitions || [];
            if (!list.length) return <p>No permanent items.</p>;
            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 100px)",
                  gap: "10px",
                  justifyContent: "center",
                }}
              >
                {list.map((item) => {
                  // Rename European Paintings -> NATIONAL GALLERY COLLECTION for NG
                  let displayName = item.name;
                  if (exhibition.id === 'national-gallery' || exhibition.id === 'ng-1') {
                    if (/European Paintings/i.test(displayName)) {
                      displayName = 'NATIONAL GALLERY COLLECTION';
                    }
                  }

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelectExhibition(item);
                      }}
                      style={{
                        width: "100px",
                        height: "160px",
                        border: "1px solid #ccc",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ position: 'relative', width: "80px", height: "100px", backgroundColor: "#eee", marginBottom: "3px", overflow: 'hidden', borderRadius: 3 }}>
                        <PosterImg item={item} width={80} height={100} />
                        <HeartOverlay
                          isLiked={likedExhibitions.has(item.id)}
                          onToggle={(e) => toggleExhibitionLike(e, item)}
                          style={{ position: 'absolute', bottom: 4, right: 4, padding: 0, background: 'none', zIndex: 10, pointerEvents: 'auto' }}
                          size={16}
                          color="#e11d48"
                          emptyColor="#fff"
                        />
                      </div>
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          width: "80px",
                          position: "relative"
                        }}
                      >
                        <div
                          style={{
                            display: "inline-block",
                            animation: "marquee 5s linear infinite",
                            animationPlayState: "paused",
                            whiteSpace: "nowrap"
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.animationPlayState = "running";
                          }}
                          onMouseLeave={(e) => {
                            const target = e.currentTarget as HTMLElement;
                            target.style.animationPlayState = "paused";
                            target.style.animation = "none";
                            target.offsetHeight;
                            target.style.animation = "marquee 5s linear infinite";
                            target.style.animationPlayState = "paused";
                            target.style.transform = "translateX(0)";
                          }}
                        >
                          {displayName}
                        </div>
                      </div>
                      <div style={{ textAlign: "center", fontSize: "0.65rem", color: "#555", marginTop: 2 }}>
                        <div style={{ fontWeight: 600 }}>{(item.startDate || '').toString().toLowerCase().includes('permanent') ? 'Permanent' : (item.startDate || 'Permanent')}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}

      {/* Temporary exhibitions - Top level section */}
      <h3>
        <button
          onClick={() => setIsTemporaryCollapsed(!isTemporaryCollapsed)}
          style={{
            marginRight: "8px",
            fontSize: "0.7rem",
            padding: "2px 5px",
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: "3px",
            cursor: "pointer"
          }}
        >
          {isTemporaryCollapsed ? "▶" : "▼"}
        </button>
        Temporary
      </h3>

      {!isTemporaryCollapsed && (
        <>
          {/* Current temporary exhibitions */}
          <h4 style={{ marginLeft: "20px" }}>
            <button
              onClick={() => setIsCurrentExhibitionsCollapsed(!isCurrentExhibitionsCollapsed)}
              style={{
                marginRight: "6px",
                fontSize: "0.65rem",
                padding: "1px 4px",
                background: "#333",
                color: "#fff",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer"
              }}
            >
              {isCurrentExhibitionsCollapsed ? "▶" : "▼"}
            </button>
            Current
          </h4>
          {!isCurrentExhibitionsCollapsed && (
            currentSpecials && currentSpecials.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 100px)",
                  gap: "10px",
                  justifyContent: "center",
                }}
              >
                {currentSpecials.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectExhibition(item);
                    }}
                    style={{
                      width: "100px",
                      height: "180px",
                      border: "1px solid #ccc",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ position: 'relative', width: "80px", height: "100px", backgroundColor: "#eee", marginBottom: "5px", overflow: 'hidden', borderRadius: 3 }}>
                      <PosterImg item={item} width={80} height={100} />
                      <HeartOverlay
                        isLiked={likedExhibitions.has(item.id)}
                        onToggle={(e) => toggleExhibitionLike(e, item)}
                        style={{ position: 'absolute', bottom: 4, right: 4, padding: 0, background: 'none', zIndex: 10, pointerEvents: 'auto' }}
                        size={16}
                        color="#e11d48"
                        emptyColor="#fff"
                      />
                    </div>
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        width: "80px",
                        position: "relative"
                      }}
                    >
                      <div
                        style={{
                          display: "inline-block",
                          animation: "marquee 5s linear infinite",
                          animationPlayState: "paused",
                          whiteSpace: "nowrap"
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.animationPlayState = "running";
                        }}
                        onMouseLeave={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          target.style.animationPlayState = "paused";
                          target.style.animation = "none";
                          target.offsetHeight;
                          target.style.animation = "marquee 5s linear infinite";
                          target.style.animationPlayState = "paused";
                          target.style.transform = "translateX(0)";
                        }}
                      >
                        {item.name}
                      </div>
                    </div>
                    <div style={{ textAlign: "center", fontSize: "0.65rem", color: "#555", marginTop: 2, lineHeight: 1.2 }}>
                      {(item as any).dateRange ? (
                        <div>{(item as any).dateRange}</div>
                      ) : (
                        <>
                          <div>{formatYMD(item.startDate as any) || ""}</div>
                          <div>{formatYMD(item.endDate as any) || ""}</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ marginLeft: "20px" }}>No current items.</p>
            )
          )}

          {/* Upcoming temporary exhibitions */}
          <h4 style={{ marginLeft: "20px" }}>
            <button
              onClick={() => setIsUpcomingExhibitionsCollapsed(!isUpcomingExhibitionsCollapsed)}
              style={{
                marginRight: "6px",
                fontSize: "0.65rem",
                padding: "1px 4px",
                background: "#333",
                color: "#fff",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer"
              }}
            >
              {isUpcomingExhibitionsCollapsed ? "▶" : "▼"}
            </button>
            Upcoming
          </h4>
          {!isUpcomingExhibitionsCollapsed && (
            upcomingSpecials && upcomingSpecials.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 100px)", gap: "10px", justifyContent: "center" }}>
                {upcomingSpecials.map((item) => (
                  <div
                    key={`up-${item.id}`}
                    onClick={() => onSelectExhibition(item)}
                    style={{
                      width: "100px",
                      height: "180px",
                      border: "1px solid #ccc",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ position: 'relative', width: "80px", height: "100px", backgroundColor: "#eee", marginBottom: "5px", overflow: 'hidden', borderRadius: 3 }}>
                      <PosterImg item={item as any} width={80} height={100} />
                      <HeartOverlay
                        isLiked={likedExhibitions.has(item.id)}
                        onToggle={(e) => toggleExhibitionLike(e, item)}
                        style={{ position: 'absolute', bottom: 4, right: 4, padding: 0, background: 'none', zIndex: 10, pointerEvents: 'auto' }}
                        size={16}
                        color="#e11d48"
                        emptyColor="#fff"
                      />
                    </div>
                    <div style={{ textAlign: "center", fontSize: "0.75rem", fontWeight: 700, width: "80px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                    <div style={{ textAlign: "center", fontSize: "0.65rem", color: "#555", marginTop: 2, lineHeight: 1.2 }}>
                      {(item as any).dateRange ? (
                        <div>{(item as any).dateRange}</div>
                      ) : (
                        <>
                          <div>{formatYMD(item.startDate as any) || ""}</div>
                          <div>{formatYMD(item.endDate as any) || ""}</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ marginLeft: "20px" }}>No upcoming items.</p>
            )
          )}

          {/* Past temporary exhibitions */}
          <h4 style={{ marginLeft: "20px" }}>
            <button
              onClick={() => setIsPastExhibitionsCollapsed(!isPastExhibitionsCollapsed)}
              style={{
                marginRight: "6px",
                fontSize: "0.65rem",
                padding: "1px 4px",
                background: "#333",
                color: "#fff",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer"
              }}
            >
              {isPastExhibitionsCollapsed ? "▶" : "▼"}
            </button>
            Past
          </h4>
          {!isPastExhibitionsCollapsed && (
            pastList && pastList.length > 0 ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 100px)",
                  gap: "10px",
                  justifyContent: "center",
                }}
              >
                {pastList.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onSelectExhibition(item)}
                    style={{
                      width: "100px",
                      height: "180px",
                      border: "1px solid #ccc",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ position: 'relative', width: "80px", height: "100px", backgroundColor: "#eee", marginBottom: "5px", overflow: 'hidden', borderRadius: 3 }}>
                      <PosterImg item={item as any} width={80} height={100} />
                      <HeartOverlay
                        isLiked={likedExhibitions.has(item.id)}
                        onToggle={(e) => toggleExhibitionLike(e, item)}
                        style={{ position: 'absolute', bottom: 4, right: 4, padding: 0, background: 'none', zIndex: 10, pointerEvents: 'auto' }}
                        size={16}
                        color="#e11d48"
                        emptyColor="#fff"
                      />
                    </div>
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        width: "80px",
                        position: "relative"
                      }}
                    >
                      <div
                        style={{
                          display: "inline-block",
                          animation: "marquee 5s linear infinite",
                          animationPlayState: "paused",
                          whiteSpace: "nowrap"
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.animationPlayState = "running";
                        }}
                        onMouseLeave={(e) => {
                          const target = e.currentTarget as HTMLElement;
                          target.style.animationPlayState = "paused";
                          target.style.animation = "none";
                          target.offsetHeight;
                          target.style.animation = "marquee 5s linear infinite";
                          target.style.animationPlayState = "paused";
                          target.style.transform = "translateX(0)";
                        }}
                      >
                        {item.name}
                      </div>
                    </div>
                    <div style={{ textAlign: "center", fontSize: "0.65rem", color: "#555", marginTop: 2, lineHeight: 1.2 }}>
                      {(item as any).dateRange ? (
                        <div>{(item as any).dateRange}</div>
                      ) : (
                        <>
                          <div>{formatYMD(item.startDate as any) || ""}</div>
                          <div>{formatYMD(item.endDate as any) || ""}</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ marginLeft: "20px" }}>No past items.</p>
            )
          )}
        </>
      )}

      {/* Dev: Firebase connection healthcheck */}
      <div style={{ marginTop: 12 }}>
        <button onClick={runHealthcheck} disabled={checking} style={{ fontSize: "0.85rem" }}>
          {checking ? "Checking..." : "Check Firebase connection"}
        </button>
      </div>
    </div>,
    document.body
  );
}