import React, { useState, useEffect, useRef } from 'react';
import { LiveAvatar, LiveName } from './LiveAuthor';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, Timestamp, doc, setDoc, increment, updateDoc, getDoc, arrayUnion, arrayRemove, getDocs, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { shouldLimitNetwork } from '../utils/network';
import type { CommunityUserProfile } from '../types/Community';

interface Comment {
  id: string;
  text: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  createdAt: Timestamp | null;
  likes?: string[]; // Array of user IDs
  parentId?: string | null; // ID of the comment this is replying to
  // Transient property for sorting/display
  _tempId?: number;
}

type UserProfile = CommunityUserProfile;

interface CommentModalProps {
  artworkId: string;
  isOpen?: boolean;
  onClose: () => void;
}

// Firestore document IDs cannot contain '/'. For artwork-linked docs (stats),
// normalize IDs by replacing '/' with a safe separator.
const normalizeArtworkIdForFirestore = (id: string | number): string => String(id).replace(/\//g, '__');

const formatDate = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}. ${hh}:${mi}`;
};

const CommentModal: React.FC<CommentModalProps> = ({ artworkId, isOpen = true, onClose }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [newComment, setNewComment] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('homeTheme') !== 'light'; } catch { return true; }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNetworkConstrained = shouldLimitNetwork();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const syncTheme = () => {
      try { setIsDark(localStorage.getItem('homeTheme') !== 'light'); } catch { setIsDark(true); }
    };
    window.addEventListener('theme-changed', syncTheme);
    window.addEventListener('storage', syncTheme);
    return () => {
      window.removeEventListener('theme-changed', syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!artworkId) return;
    console.log("CommentModal: initializing for artworkId:", artworkId);

    // Query comments for this artwork
    const q = query(
      collection(db, 'comments'),
      where('artworkId', '==', artworkId)
    );

    if (isNetworkConstrained) {
      getDocs(q).then((snapshot) => {
        const msgMap = new Map<string, Comment>();

        snapshot.docs.forEach(doc => {
          msgMap.set(doc.id, {
            id: doc.id,
            ...doc.data()
          } as Comment);
        });

        const msgs = Array.from(msgMap.values());

        msgs.sort((a, b) => {
          const t1 = a.createdAt?.toMillis() || Date.now();
          const t2 = b.createdAt?.toMillis() || Date.now();
          return t1 - t2;
        });

        setComments(msgs);
      }).catch((err) => {
        console.error("Comments fetch error:", err);
      });

      return () => { };
    }

    const unsubscribe = onSnapshot(q, {
      next: (snapshot) => {
        // Use a Map to prevent duplicates based on ID
        const msgMap = new Map<string, Comment>();

        snapshot.docs.forEach(doc => {
          msgMap.set(doc.id, {
            id: doc.id,
            ...doc.data()
          } as Comment);
        });

        const msgs = Array.from(msgMap.values());

        // Sort in memory by createdAt
        msgs.sort((a, b) => {
          const t1 = a.createdAt?.toMillis() || Date.now();
          const t2 = b.createdAt?.toMillis() || Date.now();
          return t1 - t2;
        });

        setComments(msgs);
      },
      error: (err) => {
        console.error("Comments listener error:", err);
      }
    });

    return () => unsubscribe();
  }, [artworkId, isNetworkConstrained]);

  // Fetch user profiles
  useEffect(() => {
    const fetchProfiles = async () => {
      const uniqueIds = new Set(comments.map(c => c.userId));
      if (user) uniqueIds.add(user.uid);

      // Filter out IDs we already fetched
      const idsToFetch = Array.from(uniqueIds).filter(uid => !userProfiles[uid]);

      idsToFetch.forEach(async (uid) => {
        if (!uid) return;
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            const d = snap.data();
            setUserProfiles(prev => ({
              ...prev,
              [uid]: { nickname: d.nickname, photoURL: d.photoURL }
            }));
          }
        } catch (e) {
          console.error("Error fetching profile for", uid, e);
        }
      });
    };
    if (comments.length > 0 || user) {
      fetchProfiles();
    }
  }, [comments, user?.uid]); // removed userProfiles from dep array to prevent loop


  const handleSend = async (parentId: string | null = null, textOverride?: string) => {
    if (isSubmitting) return;

    const textToSend = (textOverride !== undefined ? textOverride : newComment) || '';

    if (!textToSend.trim()) return;
    if (!user) {
      alert("Please sign in to comment.");
      return;
    }

    setIsSubmitting(true);

    try {
      // If parentId is provided, check if that parent itself has a parentId.
      // If so, we should use the grandfather ID to flatten the structure.
      // BUT user requested: "not infinite nesting, but all replies under first comment".
      // So if parentId points to a comment that IS a reply, we change parentId to ITS parent.

      let effectiveParentId = parentId;
      if (parentId) {
        const parentComment = comments.find(c => c.id === parentId);
        if (parentComment && parentComment.parentId) {
          effectiveParentId = parentComment.parentId;
        }
      }

      if (!artworkId) {
        alert("Cannot comment: No artwork ID found.");
        setIsSubmitting(false);
        return;
      }

      const docRef = await addDoc(collection(db, 'comments'), {
        artworkId: String(artworkId),
        text: textToSend.trim(),
        userId: user.uid,
        userName: user.displayName || user.email || 'Anonymous',
        userPhotoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
        parentId: effectiveParentId || null,
        likes: []
      });

      const newCommentObj: Comment = {
        id: docRef.id,
        text: textToSend.trim(),
        userId: user.uid,
        userName: user.displayName || user.email || 'Anonymous',
        userPhotoURL: user.photoURL || undefined,
        createdAt: Timestamp.now(),
        parentId: effectiveParentId || null,
        likes: []
      };

      setComments(prev => [...prev, newCommentObj]);

      try {
        const statsRef = doc(db, 'artwork_stats', normalizeArtworkIdForFirestore(artworkId));
        await setDoc(statsRef, {
          commentCount: increment(1),
          artworkId,
        }, { merge: true });
      } catch (statErr) {
        console.error("Failed to update comment stats:", statErr);
      }

      if (effectiveParentId) {
        setReplyingToId(null);
      } else {
        setNewComment('');
        // Scroll to bottom on new top-level comment
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 100);
      }

    } catch (error) {
      console.error("Error sending comment:", error);
      alert("Failed to send comment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
      console.log('Deleting comment:', commentId);
      // Find replies to delete along with parent
      const repliesQuery = query(collection(db, 'comments'), where('parentId', '==', commentId));
      const repliesSnap = await getDocs(repliesQuery);

      const batch = writeBatch(db);

      // Delete target comment
      batch.delete(doc(db, 'comments', commentId));

      // Delete all replies
      repliesSnap.forEach(r => batch.delete(r.ref));

      await batch.commit();
      console.log('Deleted comment and replies:', 1 + repliesSnap.size);

      const totalDeleted = 1 + repliesSnap.size;

      try {
        const statsRef = doc(db, 'artwork_stats', normalizeArtworkIdForFirestore(artworkId));
        await setDoc(statsRef, {
          commentCount: increment(-totalDeleted),
          artworkId,
        }, { merge: true });
      } catch (statErr) {
        console.error("Failed to update comment stats:", statErr);
      }
    } catch (e) {
      console.error("Failed to delete comment", e);
      alert("Failed to delete comment");
    }
  };

  const startEditing = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditText(comment.text);
    setReplyingToId(null);
  };

  const cancelEditing = () => {
    setEditingCommentId(null);
    setEditText('');
  };

  const saveEdit = async (commentId: string) => {
    if (!editText.trim()) return;
    try {
      console.log('Saving edit for:', commentId);
      await updateDoc(doc(db, 'comments', commentId), {
        text: editText.trim()
      });
      console.log('Edit saved');
      setEditingCommentId(null);
      setEditText('');
    } catch (e) {
      console.error("Failed to update comment", e);
      alert("Failed to update comment");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleLike = async (comment: Comment) => {
    if (!user) {
      alert("Please sign in to like comments.");
      return;
    }
    const isLiked = comment.likes?.includes(user.uid);
    const ref = doc(db, 'comments', comment.id);
    try {
      if (isLiked) {
        await updateDoc(ref, {
          likes: arrayRemove(user.uid)
        });
      } else {
        await updateDoc(ref, {
          likes: arrayUnion(user.uid)
        });
      }
    } catch (e) {
      console.error("Failed to toggle like", e);
    }
  };

  const t = !isDark;
  const fgHigh = t ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.92)';
  const fgMed = t ? 'rgba(0,0,0,0.66)' : 'rgba(255,255,255,0.72)';
  const fgLow = t ? 'rgba(0,0,0,0.44)' : 'rgba(255,255,255,0.52)';
  const divider = t ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.09)';
  const lime = t ? '#5A7800' : '#BFFF0A';
  const limeSoft = t ? 'rgba(90,120,0,0.12)' : 'rgba(191,255,10,0.14)';
  const fallbackAvatar = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

  const renderComment = (c: Comment, isReply = false) => {
    const isOwner = user && user.uid === c.userId;
    const isEditing = editingCommentId === c.id;
    const isReplying = replyingToId === c.id;

    const profile = userProfiles[c.userId];
    const displayName = profile?.nickname || c.userName;
    const displayPhoto = (isOwner && user?.photoURL)
      ? user.photoURL
      : (profile?.photoURL || c.userPhotoURL || fallbackAvatar);

    const likeCount = c.likes?.length || 0;
    const isLiked = user ? c.likes?.includes(user.uid) : false;

    return (
      <div key={c.id} style={{
        marginBottom: 10,
        marginLeft: isReply ? 34 : 0,
        borderTop: `1px solid ${divider}`,
        borderRight: `1px solid ${divider}`,
        borderBottom: `1px solid ${divider}`,
        borderLeft: `1px solid ${divider}`,
        background: t ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.03)',
        padding: isReply ? '10px 11px' : '12px 13px',
        display: 'flex',
        gap: 10,
      }}>
        <LiveAvatar uid={c.userId} fallbackName={c.userName} fallbackPhoto={c.userPhotoURL} size={isReply ? 24 : 30} style={{ flexShrink: 0, border: `1px solid ${divider}`, backgroundColor: t ? '#f4f4f4' : '#1a1a1a', borderRadius: '50%' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: fgHigh, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <LiveName uid={c.userId} fallbackName={c.userName} />
              </div>
              <span style={{ fontSize: 10, color: fgLow }}>
                {c.createdAt ? formatDate(c.createdAt.toDate()) : ''}
              </span>

              <button
                onClick={() => toggleLike(c)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 3,
                  color: isLiked ? lime : fgLow, marginLeft: 6
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                {likeCount > 0 && <span style={{ fontSize: 10 }}>{likeCount}</span>}
              </button>
            </div>

            {isOwner && !isEditing && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => startEditing(c)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: fgLow, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase'
                }}>Edit</button>
                <button onClick={() => deleteComment(c.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: t ? '#9b2c2c' : '#ff7e7e', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase'
                }}>Delete</button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div style={{ marginTop: 8 }}>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderTop: `1px solid ${divider}`,
                  borderRight: `1px solid ${divider}`,
                  borderBottom: `1px solid ${divider}`,
                  borderLeft: `1px solid ${divider}`,
                  background: t ? '#fff' : 'rgba(255,255,255,0.03)',
                  color: fgHigh,
                  fontSize: 12,
                  lineHeight: 1.4,
                  resize: 'none',
                  minHeight: 72,
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 7, justifyContent: 'flex-end' }}>
                <button onClick={cancelEditing} style={{
                  borderTop: `1px solid ${divider}`,
                  borderRight: `1px solid ${divider}`,
                  borderBottom: `1px solid ${divider}`,
                  borderLeft: `1px solid ${divider}`,
                  background: 'transparent',
                  color: fgLow,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '6px 10px',
                  cursor: 'pointer'
                }}>Cancel</button>
                <button onClick={() => saveEdit(c.id)} style={{
                  borderTop: `1px solid ${t ? 'rgba(90,120,0,0.45)' : 'rgba(191,255,10,0.4)'}`,
                  borderRight: `1px solid ${t ? 'rgba(90,120,0,0.45)' : 'rgba(191,255,10,0.4)'}`,
                  borderBottom: `1px solid ${t ? 'rgba(90,120,0,0.45)' : 'rgba(191,255,10,0.4)'}`,
                  borderLeft: `1px solid ${t ? 'rgba(90,120,0,0.45)' : 'rgba(191,255,10,0.4)'}`,
                  background: limeSoft,
                  color: lime,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '6px 10px',
                  cursor: 'pointer'
                }}>Save</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{
                marginTop: 6,
                color: fgMed,
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {c.text}
              </div>
              <button
                onClick={() => {
                  if (!user) { alert("Please sign in to reply."); return; }
                  setReplyingToId(isReplying ? null : c.id);
                  setEditingCommentId(null);
                }}
                style={{
                  marginTop: 7,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  color: isReplying ? lime : fgLow,
                  fontSize: 10,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase'
                }}
              >
                {isReplying ? 'Cancel Reply' : 'Reply'}
              </button>
            </>
          )}

          {isReplying && (
            <div style={{ marginTop: 8 }}>
              <input
                autoFocus
                placeholder={`Reply to ${displayName}...`}
                type="text"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(c.id, (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 11px',
                  borderTop: `1px solid ${divider}`,
                  borderRight: `1px solid ${divider}`,
                  borderBottom: `1px solid ${divider}`,
                  borderLeft: `1px solid ${divider}`,
                  background: t ? '#fff' : 'rgba(255,255,255,0.03)',
                  color: fgHigh,
                  outline: 'none',
                  fontSize: 12
                }}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const topLevelComments = comments.filter(c => !c.parentId);
  const getReplies = (parentId: string) => comments.filter(c => c.parentId === parentId);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: t ? 'rgba(10,10,10,0.24)' : 'rgba(0,0,0,0.62)',
      backdropFilter: 'blur(7px)',
      WebkitBackdropFilter: 'blur(7px)',
      zIndex: 20000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px'
    }} onClick={onClose}>
      <div style={{
        width: 'min(520px, 100%)',
        height: 'min(78vh, 720px)',
        background: t
          ? 'linear-gradient(180deg, rgba(250,250,250,1) 0%, rgba(244,245,241,1) 100%)'
          : 'linear-gradient(180deg, rgba(13,13,13,0.98) 0%, rgba(8,8,8,0.98) 100%)',
        borderTop: `1px solid ${divider}`,
        borderRight: `1px solid ${divider}`,
        borderBottom: `1px solid ${divider}`,
        borderLeft: `1px solid ${divider}`,
        boxShadow: t ? '0 22px 48px rgba(0,0,0,0.14)' : '0 26px 56px rgba(0,0,0,0.55)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: `1px solid ${divider}`,
          background: t ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.3)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, color: fgHigh, fontWeight: 600, letterSpacing: '0.03em' }}>Comments</span>
            <span style={{ fontSize: 10, color: fgLow, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {comments.length.toLocaleString()} entries
            </span>
          </div>
          <button onClick={onClose} style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            borderTop: `1px solid ${divider}`,
            borderRight: `1px solid ${divider}`,
            borderBottom: `1px solid ${divider}`,
            borderLeft: `1px solid ${divider}`,
            background: t ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.06)',
            color: fgMed,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}>&times;</button>
        </div>

        <div ref={scrollRef} style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          background: t ? 'rgba(0,0,0,0.015)' : 'rgba(255,255,255,0.02)',
          scrollbarWidth: 'thin',
        }}>
          {comments.length === 0 ? (
            <div style={{
              height: '100%',
              minHeight: 220,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: fgLow,
              fontSize: 12,
              lineHeight: 1.7,
              letterSpacing: '0.03em',
              borderTop: `1px dashed ${divider}`,
              borderRight: `1px dashed ${divider}`,
              borderBottom: `1px dashed ${divider}`,
              borderLeft: `1px dashed ${divider}`,
              background: t ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.02)',
            }}>
              No comments yet.
              <br />
              Start the first conversation around this artwork.
            </div>
          ) : (
            topLevelComments.map(c => (
              <div key={c.id}>
                {renderComment(c)}
                {getReplies(c.id).map(r => renderComment(r, true))}
              </div>
            ))
          )}
        </div>

        <div style={{
          padding: '11px 12px',
          borderTop: `1px solid ${divider}`,
          background: t ? 'rgba(255,255,255,0.74)' : 'rgba(0,0,0,0.25)',
          display: 'flex',
          gap: 8,
          alignItems: 'center'
        }}>
          {(userProfiles[user?.uid || '']?.photoURL || user?.photoURL) ? (
            <img
              src={userProfiles[user?.uid || '']?.photoURL || user?.photoURL || ''}
              alt="me"
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `1px solid ${divider}`,
                backgroundColor: t ? '#f0f0f0' : '#1a1a1a',
              }}
            />
          ) : (
            <div style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              borderTop: `1px solid ${divider}`,
              borderRight: `1px solid ${divider}`,
              borderBottom: `1px solid ${divider}`,
              borderLeft: `1px solid ${divider}`,
              background: t ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
            }} />
          )}
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={user ? "Share your thought on this piece..." : "Sign in to comment"}
            disabled={!user || isSubmitting}
            style={{
              flex: 1,
              padding: '9px 11px',
              borderTop: `1px solid ${divider}`,
              borderRight: `1px solid ${divider}`,
              borderBottom: `1px solid ${divider}`,
              borderLeft: `1px solid ${divider}`,
              outline: 'none',
              fontSize: 12,
              background: user ? (t ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.05)') : (t ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)'),
              color: fgHigh
            }}
          />
          <button
            onClick={() => handleSend(null)}
            disabled={!newComment.trim() || !user || isSubmitting}
            style={{
              minWidth: 58,
              padding: '9px 10px',
              borderTop: `1px solid ${newComment.trim() && user && !isSubmitting ? (t ? 'rgba(90,120,0,0.52)' : 'rgba(191,255,10,0.5)') : divider}`,
              borderRight: `1px solid ${newComment.trim() && user && !isSubmitting ? (t ? 'rgba(90,120,0,0.52)' : 'rgba(191,255,10,0.5)') : divider}`,
              borderBottom: `1px solid ${newComment.trim() && user && !isSubmitting ? (t ? 'rgba(90,120,0,0.52)' : 'rgba(191,255,10,0.5)') : divider}`,
              borderLeft: `1px solid ${newComment.trim() && user && !isSubmitting ? (t ? 'rgba(90,120,0,0.52)' : 'rgba(191,255,10,0.5)') : divider}`,
              background: newComment.trim() && user && !isSubmitting ? limeSoft : 'transparent',
              color: newComment.trim() && user && !isSubmitting ? lime : fgLow,
              fontSize: 10,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              cursor: newComment.trim() && user && !isSubmitting ? 'pointer' : 'default'
            }}
          >
            {isSubmitting ? 'Sending' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentModal;
