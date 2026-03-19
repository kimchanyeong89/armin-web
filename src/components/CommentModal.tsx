import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, Timestamp, doc, setDoc, increment, updateDoc, getDoc, arrayUnion, arrayRemove, getDocs, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { shouldLimitNetwork } from '../utils/network';

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

interface UserProfile {
  nickname?: string;
  photoURL?: string;
}

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNetworkConstrained = shouldLimitNetwork();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

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

  const renderComment = (c: Comment, isReply = false) => {
    const isOwner = user && user.uid === c.userId;
    const isEditing = editingCommentId === c.id;
    const isReplying = replyingToId === c.id;

    const profile = userProfiles[c.userId];
    const displayName = profile?.nickname || c.userName;
    const displayPhoto = (isOwner && user?.photoURL)
      ? user.photoURL
      : (profile?.photoURL || c.userPhotoURL || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y");

    const likeCount = c.likes?.length || 0;
    const isLiked = user ? c.likes?.includes(user.uid) : false;


    // Animation for new comments
    const isNew = (Date.now() - (c.createdAt?.toMillis() || Date.now())) < 5000;

    return (
      <div key={c.id} style={{
        marginBottom: 12, display: 'flex', gap: 10, paddingLeft: isReply ? 30 : 0,
        animation: isNew ? 'fadeIn 0.5s ease-out' : 'none'
      }}>
        <style>
          {`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}
        </style>
        <img
          src={displayPhoto}
          alt={displayName}
          title={displayName}
          onError={(e) => {
            const target = e.currentTarget;
            if (target.src !== "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y") {
              target.src = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";
            }
          }}
          style={{
            width: isReply ? 24 : 32, height: isReply ? 24 : 32,
            borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
            border: '1px solid #eee',
            backgroundColor: '#f0f0f0'
          }}
        />
        <div style={{ flex: 1 }}>
          {/* Header Line: Name + Time + Heart */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>
                {displayName}
              </div>
              <span style={{ fontSize: 11, fontWeight: 400, color: '#999' }}>
                {c.createdAt ? formatDate(c.createdAt.toDate()) : ''}
              </span>

              {/* Heart Icon moved here, next to time */}
              <button
                onClick={() => toggleLike(c)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 3,
                  color: isLiked ? '#ff4444' : '#ccc', marginLeft: 6
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                {likeCount > 0 && <span style={{ fontSize: 10, color: '#999' }}>{likeCount}</span>}
              </button>
            </div>

            {isOwner && !isEditing && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => startEditing(c)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: '#999', fontSize: 11
                }}>Edit</button>
                <button onClick={() => deleteComment(c.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: '#ff4444', fontSize: 11
                }}>Del</button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div style={{ marginTop: 4 }}>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                style={{
                  width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd',
                  fontSize: 13, resize: 'none', minHeight: 60
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
                <button onClick={cancelEditing} style={{
                  padding: '4px 8px', fontSize: 11, background: '#f0f0f0', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer'
                }}>Cancel</button>
                <button onClick={() => saveEdit(c.id)} style={{
                  padding: '4px 8px', fontSize: 11, background: '#0095f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer'
                }}>Save</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#444', lineHeight: 1.3, whiteSpace: 'pre-wrap', marginTop: 2 }}>
                {c.text}
              </div>

              {/* Reply Button - moved closer below text */}
              <div style={{ marginTop: 0, lineHeight: 1 }}>
                <button
                  onClick={() => {
                    if (!user) { alert("Please sign in to reply."); return; }
                    setReplyingToId(isReplying ? null : c.id);
                    setEditingCommentId(null);
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: '#999', fontSize: 11, fontWeight: 500
                  }}
                >
                  Reply
                </button>
              </div>
            </>
          )}

          {/* Reply Input */}
          {isReplying && (
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <input
                autoFocus
                placeholder={`Reply to ${displayName}...`}
                type="text"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(c.id, (e.target as HTMLInputElement).value);
                  }
                }}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 16,
                  border: '1px solid #ddd', outline: 'none', fontSize: 12
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
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.5)', zIndex: 20000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div style={{
        width: '90%', maxWidth: 400, height: '80vh', maxHeight: 600,
        background: '#fff', borderRadius: 12, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #eee',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Comments</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: 0, color: '#333'
          }}>&times;</button>
        </div>

        {/* List */}
        <div ref={scrollRef} style={{
          flex: 1, overflowY: 'auto', padding: '16px', background: '#fafafa'
        }}>
          {comments.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', marginTop: 40, fontSize: 13 }}>
              No comments yet.<br />Be the first to share your thoughts!
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

        {/* Footer / Input */}
        <div style={{
          padding: '12px', borderTop: '1px solid #eee', background: '#fff',
          display: 'flex', gap: 8, alignItems: 'center'
        }}>
          {(userProfiles[user?.uid || '']?.photoURL || user?.photoURL) && (
            <img
              src={userProfiles[user?.uid || '']?.photoURL || user?.photoURL || ''}
              alt="me"
              style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
            />
          )}
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={user ? "Add a comment..." : "Sign in to comment"}
            disabled={!user || isSubmitting}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 20,
              border: '1px solid #ddd', outline: 'none', fontSize: 13,
              background: user ? '#fff' : '#f0f0f0'
            }}
          />
          <button
            onClick={() => handleSend(null)}
            disabled={!newComment.trim() || !user || isSubmitting}
            style={{
              background: 'transparent', border: 'none',
              color: (newComment.trim() && !isSubmitting) ? '#0095f6' : '#b2dffc',
              fontWeight: 600, fontSize: 13, cursor: (newComment.trim() && !isSubmitting) ? 'pointer' : 'default',
              padding: '8px'
            }}
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentModal;
