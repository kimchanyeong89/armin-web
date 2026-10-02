import React, { useState, useEffect, useMemo } from "react";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { refreshSharedPlaylist } from "../features/playlists/sharedPlaylists";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import CloseButton from "./CloseButton";
import "./playlistShare.css";

const normalizeArtworkIdForFirestore = (value: unknown): string => String(value ?? "").trim().replace(/\//g, "__");

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
  itemType?: "artwork" | "exhibition" | "museum" | "artist";
  theme?: "light" | "dark";
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  item,
  itemType = "artwork",
  theme,
}) => {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const resolvedTheme = useMemo<"light" | "dark">(() => {
    if (theme) return theme;
    try {
      return localStorage.getItem("homeTheme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  }, [theme]);

  const isLight = resolvedTheme === "light";
  const { t } = useLanguage();
  const title = String(item?.title || item?.name || "").trim();

  useEffect(() => {
    if (!isOpen) return;

    if (!user) {
      setPlaylists([]);
      setLoading(false);
      return;
    }

    const fetchPlaylists = async () => {
      setLoading(true);
      const db = getFirestore();
      try {
        const q = query(collection(db, `users/${user.uid}/playlists`), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setPlaylists(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching playlists", err);
      } finally {
        setLoading(false);
      }
    };

    void fetchPlaylists();
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) {
      setNewPlaylistName("");
      setSaving(false);
      setLoading(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCreateAndSave = async () => {
    if (!newPlaylistName.trim() || !user || !item) return;
    setSaving(true);
    const db = getFirestore();

    try {
      const coverImg = item.image || item.imageUrl || item.thumbnail?.url || "";
      const playlistRef = await addDoc(collection(db, `users/${user.uid}/playlists`), {
        name: newPlaylistName.trim(),
        createdAt: serverTimestamp(),
        coverImage: coverImg,
      });

      const rawItemId = String(item.artworkId || item.id || `${itemType}-${item.title || item.name || "item"}`).trim();
      const itemDocId = normalizeArtworkIdForFirestore(rawItemId);
      await setDoc(doc(db, `users/${user.uid}/playlists/${playlistRef.id}/items/${itemDocId}`), {
        ...item,
        artworkId: item.artworkId || rawItemId,
        itemType,
        addedAt: serverTimestamp(),
      });

      onClose();
    } catch (err) {
      console.error("Error creating playlist:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveToExisting = async (playlistId: string, currentCover: string) => {
    if (!user || !item) return;
    setSaving(true);
    const db = getFirestore();

    try {
      const rawItemId = String(item.artworkId || item.id || `${itemType}-${item.title || item.name || "item"}`).trim();
      const itemDocId = normalizeArtworkIdForFirestore(rawItemId);
      const ref = doc(db, `users/${user.uid}/playlists/${playlistId}/items/${itemDocId}`);
      await setDoc(ref, {
        ...item,
        artworkId: item.artworkId || rawItemId,
        itemType,
        addedAt: serverTimestamp(),
      });

      if (!currentCover) {
        const itemImg = item.image || item.imageUrl || item.thumbnail?.url || "";
        if (itemImg) {
          await setDoc(doc(db, `users/${user.uid}/playlists/${playlistId}`), { coverImage: itemImg }, { merge: true });
        }
      }

      /* a shared playlist's public copy takes the new work too */
      if (playlists.some((pl) => pl.id === playlistId && pl.shared === true)) {
        void refreshSharedPlaylist(user.uid, playlistId).catch(() => {});
      }

      onClose();
    } catch (err) {
      console.error("Error saving to playlist:", err);
    } finally {
      setSaving(false);
    }
  };

  const canCreate = Boolean(newPlaylistName.trim()) && !saving && Boolean(user);

  /* the playlist share sheet's panel: a hairline edge, words for actions, the
     one thing to do as a circled gold mark, the lists as hairline rows */
  return createPortal(
    <div
      className="pls pls--add"
      data-light={isLight || undefined}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="pls__card" role="dialog" aria-modal="true" aria-labelledby="pla-title">
        <CloseButton placement="corner" onClick={onClose} label={t({ ko: "닫기", en: "Close" })} light={isLight} />
        <header>
          <span>{t({ ko: "큐레이션에 담기", en: "ADD TO PLAYLIST" })}</span>
        </header>
        <h2 id="pla-title">{title || t({ ko: "이 작품", en: "This item" })}</h2>

        <div className="pla__new">
          <input
            type="text"
            placeholder={t({ ko: "새 큐레이션 이름", en: "New playlist name" })}
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleCreateAndSave()}
            maxLength={60}
          />
          <button type="button" className="pls__cta" disabled={!canCreate} onClick={() => void handleCreateAndSave()}>
            <span aria-hidden="true"><Plus size={13} strokeWidth={2.2} /></span>
            {saving ? t({ ko: "담는 중", en: "Saving" }) : t({ ko: "만들고 담기", en: "Create" })}
          </button>
        </div>

        <p className="pla__label">{t({ ko: "내 큐레이션", en: "YOUR PLAYLISTS" })}</p>

        {!user ? (
          <p className="pls__body">{t({ ko: "로그인하면 큐레이션에 담을 수 있어요.", en: "Sign in to save items to playlists." })}</p>
        ) : loading ? (
          <p className="pls__body">{t({ ko: "불러오는 중…", en: "Loading…" })}</p>
        ) : playlists.length === 0 ? (
          <p className="pls__body">{t({ ko: "아직 큐레이션이 없어요. 위에서 첫 큐레이션을 만들어 보세요.", en: "No playlists yet. Create your first one above." })}</p>
        ) : (
          <ul className="pla__list">
            {playlists.map((pl) => (
              <li key={pl.id}>
                <button type="button" disabled={saving} onClick={() => void handleSaveToExisting(pl.id, pl.coverImage)}>
                  <span className="pla__shot">{pl.coverImage ? <img src={pl.coverImage} alt="" loading="lazy" decoding="async" /> : null}</span>
                  <span className="pla__name">
                    <b>{pl.name}</b>
                    {pl.shared === true && <small>{t({ ko: "공유 중", en: "SHARED" })}</small>}
                  </span>
                  <span className="pla__put">
                    <Plus size={13} strokeWidth={2} aria-hidden="true" />
                    {t({ ko: "담기", en: "Add" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
};
