import React, { useState, useEffect, useMemo } from "react";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

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
  const panelBg = isLight ? "rgba(250,250,250,0.97)" : "rgba(10,10,10,0.95)";
  const panelBorder = isLight ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)";
  const panelShadow = isLight ? "0 24px 48px rgba(0,0,0,0.16)" : "0 28px 56px rgba(0,0,0,0.62)";
  const textPrimary = isLight ? "rgba(0,0,0,0.88)" : "rgba(255,255,255,0.92)";
  const textSecondary = isLight ? "rgba(0,0,0,0.60)" : "rgba(255,255,255,0.64)";
  const textMuted = isLight ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.42)";
  const divider = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  const limeText = isLight ? "#4E6700" : "#D9FF6E";
  const limeBg = isLight ? "rgba(90,120,0,0.10)" : "rgba(191,255,10,0.14)";
  const limeBorder = isLight ? "rgba(90,120,0,0.25)" : "rgba(191,255,10,0.30)";
  const controlBg = isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)";

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

      onClose();
    } catch (err) {
      console.error("Error saving to playlist:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: isLight ? "rgba(12,12,12,0.40)" : "rgba(0,0,0,0.62)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 260200,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(100%, 520px)",
          maxHeight: "min(82vh, 760px)",
          overflow: "hidden",
          borderRadius: 18,
          background: panelBg,
          borderTop: `1px solid ${panelBorder}`,
          borderRight: `1px solid ${panelBorder}`,
          borderBottom: `1px solid ${panelBorder}`,
          borderLeft: `1px solid ${panelBorder}`,
          boxShadow: panelShadow,
          fontFamily: "'Space Grotesk', sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${divider}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  color: textPrimary,
                }}
              >
                Add to Playlist
              </h2>
              <div style={{ marginTop: 5, fontSize: 11, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Save this item for later
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: controlBg,
                borderTop: `1px solid ${divider}`,
                borderRight: `1px solid ${divider}`,
                borderBottom: `1px solid ${divider}`,
                borderLeft: `1px solid ${divider}`,
                cursor: "pointer",
                padding: 8,
                borderRadius: 999,
                display: "flex",
                color: textSecondary,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div style={{ padding: "16px 20px 20px" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, position: "relative" }}>
              <input
                type="text"
                placeholder="New playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 10,
                  borderTop: `1px solid ${divider}`,
                  borderRight: `1px solid ${divider}`,
                  borderBottom: `1px solid ${divider}`,
                  borderLeft: `1px solid ${divider}`,
                  fontSize: 13,
                  fontWeight: 500,
                  outline: "none",
                  color: textPrimary,
                  background: controlBg,
                  transition: "border-color 0.2s ease, background-color 0.2s ease",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = limeBorder;
                  e.currentTarget.style.background = isLight ? "rgba(90,120,0,0.06)" : "rgba(191,255,10,0.07)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = divider;
                  e.currentTarget.style.background = controlBg;
                }}
                onKeyDown={(e) => e.key === "Enter" && void handleCreateAndSave()}
              />
              <button
                onClick={() => void handleCreateAndSave()}
                disabled={!newPlaylistName.trim() || saving || !user}
                style={{
                  background: newPlaylistName.trim() && !saving && user ? limeBg : controlBg,
                  color: newPlaylistName.trim() && !saving && user ? limeText : textMuted,
                  borderTop: `1px solid ${newPlaylistName.trim() && !saving && user ? limeBorder : divider}`,
                  borderRight: `1px solid ${newPlaylistName.trim() && !saving && user ? limeBorder : divider}`,
                  borderBottom: `1px solid ${newPlaylistName.trim() && !saving && user ? limeBorder : divider}`,
                  borderLeft: `1px solid ${newPlaylistName.trim() && !saving && user ? limeBorder : divider}`,
                  borderRadius: 10,
                  padding: "0 14px",
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: newPlaylistName.trim() && !saving && user ? "pointer" : "not-allowed",
                  minWidth: 92,
                }}
              >
                {saving ? "Saving" : "Create"}
              </button>
            </div>
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, color: textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.15em" }}>
            Your Playlists
          </div>

          {!user ? (
            <div
              style={{
                textAlign: "center",
                padding: "26px 14px",
                borderRadius: 12,
                borderTop: `1px solid ${divider}`,
                borderRight: `1px solid ${divider}`,
                borderBottom: `1px solid ${divider}`,
                borderLeft: `1px solid ${divider}`,
                color: textSecondary,
                background: controlBg,
                fontSize: 13,
              }}
            >
              Sign in to save items to playlists.
            </div>
          ) : loading ? (
            <div style={{ textAlign: "center", padding: "30px 12px", color: textSecondary, fontSize: 13 }}>Loading playlists...</div>
          ) : playlists.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "30px 14px",
                borderTop: `1px solid ${divider}`,
                borderRight: `1px solid ${divider}`,
                borderBottom: `1px solid ${divider}`,
                borderLeft: `1px solid ${divider}`,
                borderRadius: 12,
                color: textSecondary,
                background: controlBg,
                fontSize: 13,
              }}
            >
              No playlists yet. Create your first one above.
            </div>
          ) : (
            <div
              className="playlist-scroll"
              style={{
                maxHeight: "44vh",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                paddingRight: 2,
                scrollbarWidth: "thin",
                scrollbarColor: isLight ? "rgba(90,120,0,0.35) rgba(0,0,0,0.05)" : "rgba(191,255,10,0.35) rgba(255,255,255,0.05)",
              }}
            >
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => void handleSaveToExisting(pl.id, pl.coverImage)}
                  disabled={saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: 10,
                    borderTop: `1px solid ${divider}`,
                    borderRight: `1px solid ${divider}`,
                    borderBottom: `1px solid ${divider}`,
                    borderLeft: `1px solid ${divider}`,
                    borderRadius: 10,
                    background: controlBg,
                    cursor: saving ? "default" : "pointer",
                    textAlign: "left",
                    transition: "border-color 0.18s ease, background-color 0.18s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) {
                      e.currentTarget.style.borderColor = limeBorder;
                      e.currentTarget.style.background = isLight ? "rgba(90,120,0,0.07)" : "rgba(191,255,10,0.07)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) {
                      e.currentTarget.style.borderColor = divider;
                      e.currentTarget.style.background = controlBg;
                    }
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      background: isLight ? "#fff" : "rgba(255,255,255,0.06)",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {pl.coverImage ? (
                      <img src={pl.coverImage} alt={pl.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pl.name}
                    </div>
                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Tap to save
                    </div>
                  </div>
                  <div style={{ color: textMuted, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}

          <style>{`
            .playlist-scroll::-webkit-scrollbar {
              width: 6px;
            }
            .playlist-scroll::-webkit-scrollbar-track {
              background: ${isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)"};
              border-radius: 999px;
            }
            .playlist-scroll::-webkit-scrollbar-thumb {
              background: ${isLight ? "rgba(90,120,0,0.36)" : "rgba(191,255,10,0.34)"};
              border-radius: 999px;
            }
            .playlist-scroll::-webkit-scrollbar-thumb:hover {
              background: ${isLight ? "rgba(90,120,0,0.55)" : "rgba(191,255,10,0.54)"};
            }
          `}</style>
        </div>
      </div>
    </div>
  );
};
