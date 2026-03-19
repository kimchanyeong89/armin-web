import React, { useState, useEffect } from "react";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
  itemType?: 'artwork' | 'exhibition' | 'museum' | 'artist';
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({ isOpen, onClose, item, itemType = 'artwork' }) => {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;
    const fetchPlaylists = async () => {
      setLoading(true);
      const db = getFirestore();
      try {
        const q = query(collection(db, `users/${user.uid}/playlists`), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setPlaylists(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching playlists", err);
      }
      setLoading(false);
    };
    fetchPlaylists();
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleCreateAndSave = async () => {
    if (!newPlaylistName.trim() || !user || !item) return;
    setSaving(true);
    const db = getFirestore();
    try {
      const coverImg = item.image || item.imageUrl || item.thumbnail?.url || '';
      const playlistRef = await addDoc(collection(db, `users/${user.uid}/playlists`), {
        name: newPlaylistName.trim(),
        createdAt: serverTimestamp(),
        coverImage: coverImg
      });

      const itemId = item.artworkId || item.id;
      // Also add to subcollection
      await setDoc(doc(db, `users/${user.uid}/playlists/${playlistRef.id}/items/${itemId}`), {
        ...item,
        itemType,
        addedAt: serverTimestamp()
      });

      onClose();
    } catch (err) {
      console.error("Error creating playlist:", err);
    }
    setSaving(false);
  };

  const handleSaveToExisting = async (playlistId: string, currentCover: string) => {
    if (!user || !item) return;
    setSaving(true);
    const db = getFirestore();
    try {
      const itemId = item.artworkId || item.id;
      const ref = doc(db, `users/${user.uid}/playlists/${playlistId}/items/${itemId}`);
      await setDoc(ref, {
        ...item,
        itemType,
        addedAt: serverTimestamp()
      });

      // Update cover image if none exists
      if (!currentCover) {
        const itemImg = item.image || item.imageUrl || item.thumbnail?.url || '';
        if (itemImg) {
          await setDoc(doc(db, `users/${user.uid}/playlists/${playlistId}`), { coverImage: itemImg }, { merge: true });
        }
      }

      onClose();
    } catch (err) {
      console.error("Error saving to playlist:", err);
    }
    setSaving(false);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.2s ease-out',
      backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      <div
        style={{
          background: 'white',
          borderRadius: 24,
          width: '90%',
          maxWidth: 420,
          padding: 32,
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          animation: 'zoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#111' }}>Save to Playlist</h2>
          <button onClick={onClose} style={{ background: '#f5f5f5', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
            <input
              type="text"
              placeholder="New playlist name..."
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              style={{
                flex: 1,
                padding: '16px 20px',
                borderRadius: 12,
                border: '1px solid #e0e0e0',
                fontSize: 16,
                fontWeight: 500,
                outline: 'none',
                background: '#fafafa',
                transition: 'border-color 0.2s'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#111'}
              onBlur={e => e.currentTarget.style.borderColor = '#e0e0e0'}
              onKeyDown={e => e.key === 'Enter' && handleCreateAndSave()}
            />
            <button
              onClick={handleCreateAndSave}
              disabled={!newPlaylistName.trim() || saving}
              style={{
                background: '#111',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                padding: '0 24px',
                fontWeight: 600,
                fontSize: 16,
                cursor: newPlaylistName.trim() && !saving ? 'pointer' : 'not-allowed',
                opacity: newPlaylistName.trim() && !saving ? 1 : 0.4,
                transition: 'background 0.2s, transform 0.1s'
              }}
              onMouseEnter={e => { if (newPlaylistName.trim() && !saving) e.currentTarget.style.transform = 'scale(1.02)' }}
              onMouseLeave={e => { if (newPlaylistName.trim() && !saving) e.currentTarget.style.transform = 'scale(1)' }}
            >
              Create
            </button>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Playlists</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 15 }}>Loading playlists...</div>
          ) : playlists.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, background: '#f9f9f9', borderRadius: 12, color: '#999', fontSize: 15 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /><line x1="12" x2="12" y1="7" y2="13" /><line x1="15" x2="9" y1="10" y2="10" />
              </svg>
              <br />
              No playlists yet. Create your first one above.
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
              {playlists.map(pl => (
                <button
                  key={pl.id}
                  onClick={() => handleSaveToExisting(pl.id, pl.coverImage)}
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    width: '100%',
                    padding: 12,
                    border: '1px solid transparent',
                    borderRadius: 12,
                    background: '#f8f8f8',
                    cursor: saving ? 'default' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    if (!saving) {
                      e.currentTarget.style.background = '#f0f0f0';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!saving) {
                      e.currentTarget.style.background = '#f8f8f8';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }
                  }}
                >
                  <div style={{ width: 56, height: 56, borderRadius: 8, background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    {pl.coverImage ? (
                      <img src={pl.coverImage} alt={pl.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, color: '#111', marginBottom: 2 }}>{pl.name}</div>
                    <div style={{ fontSize: 13, color: '#888' }}>Click to save</div>
                  </div>
                  <div style={{ color: '#111', opacity: 0.5 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
