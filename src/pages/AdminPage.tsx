import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

// Admin email whitelist
const ADMIN_EMAILS = ['kietzland@gmail.com'];

interface Submission {
    id: string;
    exhibitionId: string;
    exhibitionName: string;
    museumName?: string; // Parent museum/gallery name
    title: string;
    artist: string;
    year: number | null;
    dimensions: string;
    materials: string;
    imageUrl?: string; // R2 URL if uploaded
    imageBase64: string;
    imageName: string;
    imageType: string;
    status: 'pending' | 'approved' | 'rejected';
    submittedBy: string;
    submitterEmail: string;
    submitterName: string;
    submittedAt: any;
}

const AdminPage: React.FC = () => {
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

    // Check if current user is admin
    useEffect(() => {
        const unsubAuth = onAuthStateChanged(auth, (user) => {
            if (user && ADMIN_EMAILS.includes(user.email || '')) {
                setIsAdmin(true);
            } else {
                setIsAdmin(false);
            }
            setLoading(false);
        });
        return () => unsubAuth();
    }, []);

    // Fetch submissions
    useEffect(() => {
        if (!isAdmin) return;

        const q = query(collection(db, 'pending_submissions'), orderBy('submittedAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            const items: Submission[] = [];
            snap.forEach((docSnap) => {
                items.push({ id: docSnap.id, ...docSnap.data() } as Submission);
            });
            setSubmissions(items);
        });
        return () => unsub();
    }, [isAdmin]);

    const filteredSubmissions = filter === 'all'
        ? submissions
        : submissions.filter((s) => s.status === filter);

    const handleApprove = useCallback(async (submission: Submission) => {
        if (processingId) return;
        setProcessingId(submission.id);

        try {
            // Sanitize exhibition ID for Firestore path
            const sanitizedExhibitionId = submission.exhibitionId
                .replace(/[\/\\#\[\].*]/g, '_')
                .replace(/^https?:_+/i, '')
                .slice(0, 100);

            // 1. First, add to exhibition_artworks collection
            const artworkData = {
                id: `user_${submission.id}`,
                title: submission.title,
                name: submission.title, // Some components use 'name'
                artist: submission.artist,
                year: submission.year,
                dimensions: submission.dimensions,
                materials: submission.materials,
                image: submission.imageUrl || submission.imageBase64, // Use R2 URL if available
                exhibitionId: submission.exhibitionId,
                exhibitionName: submission.exhibitionName,
                submittedBy: submission.submittedBy,
                approvedAt: serverTimestamp(),
                source: 'user_submission',
            };

            // Add to exhibition_artworks collection with sanitized path
            await setDoc(doc(db, 'exhibition_artworks', `${sanitizedExhibitionId}_${submission.id}`), artworkData);

            // 2. Only update status after artwork is successfully added
            await updateDoc(doc(db, 'pending_submissions', submission.id), {
                status: 'approved',
                approvedAt: serverTimestamp(),
            });

            alert('Submission approved and added to exhibition!');
        } catch (err) {
            console.error('Failed to approve:', err);
            alert('Failed to approve submission: ' + (err as Error).message);
        } finally {
            setProcessingId(null);
        }
    }, [processingId]);

    const handleReject = useCallback(async (submission: Submission) => {
        if (processingId) return;
        setProcessingId(submission.id);

        try {
            await updateDoc(doc(db, 'pending_submissions', submission.id), {
                status: 'rejected',
                rejectedAt: serverTimestamp(),
            });
            alert('Submission rejected');
        } catch (err) {
            console.error('Failed to reject:', err);
            alert('Failed to reject submission');
        } finally {
            setProcessingId(null);
        }
    }, [processingId]);

    const handleDelete = useCallback(async (submission: Submission) => {
        if (processingId) return;
        if (!confirm('Are you sure you want to permanently delete this submission?')) return;
        setProcessingId(submission.id);

        try {
            await deleteDoc(doc(db, 'pending_submissions', submission.id));
        } catch (err) {
            console.error('Failed to delete:', err);
            alert('Failed to delete submission');
        } finally {
            setProcessingId(null);
        }
    }, [processingId]);

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate?.() || new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <p>Loading...</p>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16 }}>
                <h1 style={{ fontSize: 24 }}>Access Denied</h1>
                <p>You don't have permission to view this page.</p>
                <button onClick={() => navigate('/')} style={{ padding: '8px 16px', cursor: 'pointer' }}>Go Home</button>
            </div>
        );
    }


    return (
        <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
                <button onClick={() => navigate('/')} style={{ padding: '8px 16px', cursor: 'pointer' }}>← Back</button>
            </div>

            {/* Exhibition Sync Section */}
            <div style={{
                background: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)',
                padding: 20,
                borderRadius: 12,
                marginBottom: 24,
                color: '#fff'
            }}>
                <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>🖥️ Terminal Commands</h2>
                <p style={{ margin: '0 0 16px 0', fontSize: 14, opacity: 0.9 }}>
                    Copy commands and run them in your terminal. These buttons do NOT run automatically.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText('npm run sync-new');
                            alert('📋 Copied to clipboard!\n\nNow open your terminal and paste:\nnpm run sync-new\n\n⚠️ Note: This feature is experimental and may not work perfectly.');
                        }}
                        style={{
                            padding: '10px 20px',
                            background: '#fff',
                            color: '#374151',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                        }}
                    >
                        📋 Copy Sync Command
                    </button>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText('npm run restore-backup');
                            alert('📋 Copied to clipboard!\n\nNow open your terminal and paste:\nnpm run restore-backup\n\nThis will restore the previous data.');
                        }}
                        style={{
                            padding: '10px 20px',
                            background: 'rgba(255,255,255,0.15)',
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: 8,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                        }}
                    >
                        📋 Copy Restore Command
                    </button>
                </div>
                <p style={{ margin: '12px 0 0 0', fontSize: 12, opacity: 0.6 }}>
                    ⚠️ Experimental: Auto-sync may not work correctly. Manual data entry is more reliable.
                </p>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                <div style={{ background: '#fef3c7', padding: 16, borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{submissions.filter(s => s.status === 'pending').length}</div>
                    <div style={{ fontSize: 12, color: '#92400e' }}>Pending</div>
                </div>
                <div style={{ background: '#d1fae5', padding: 16, borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{submissions.filter(s => s.status === 'approved').length}</div>
                    <div style={{ fontSize: 12, color: '#065f46' }}>Approved</div>
                </div>
                <div style={{ background: '#fee2e2', padding: 16, borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{submissions.filter(s => s.status === 'rejected').length}</div>
                    <div style={{ fontSize: 12, color: '#991b1b' }}>Rejected</div>
                </div>
                <div style={{ background: '#e0e7ff', padding: 16, borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{submissions.length}</div>
                    <div style={{ fontSize: 12, color: '#3730a3' }}>Total</div>
                </div>
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: 6,
                            background: filter === f ? '#111' : '#f3f4f6',
                            color: filter === f ? '#fff' : '#111',
                            cursor: 'pointer',
                            fontWeight: 500,
                        }}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* Submissions list */}
            {filteredSubmissions.length === 0 ? (
                <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>No submissions found.</p>
            ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                    {filteredSubmissions.map((sub) => (
                        <div
                            key={sub.id}
                            style={{
                                background: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: 8,
                                padding: 16,
                                display: 'grid',
                                gridTemplateColumns: '120px 1fr auto',
                                gap: 16,
                                alignItems: 'start',
                            }}
                        >
                            {/* Image thumbnail */}
                            <img
                                src={sub.imageUrl || sub.imageBase64}
                                alt={sub.title}
                                style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                                onClick={() => setSelectedSubmission(sub)}
                            />

                            {/* Details */}
                            <div>
                                <h3 style={{ margin: '0 0 4px 0', fontSize: 16 }}>{sub.title}</h3>
                                <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#666' }}>
                                    {sub.artist || 'Unknown artist'} {sub.year ? `(${sub.year})` : ''}
                                </p>
                                {sub.museumName && (
                                    <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#065f46', fontWeight: 600 }}>
                                        <strong>🏛️ Museum:</strong> {sub.museumName}
                                    </p>
                                )}
                                <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#3730a3', fontWeight: 600 }}>
                                    <strong>📍 Exhibition:</strong> {sub.exhibitionName}
                                </p>
                                <p style={{ margin: '0 0 4px 0', fontSize: 11, color: '#666', wordBreak: 'break-all' }}>
                                    <strong>ID:</strong> {sub.exhibitionId?.slice(0, 50)}{sub.exhibitionId?.length > 50 ? '...' : ''}
                                </p>
                                <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#888' }}>
                                    <strong>Dimensions:</strong> {sub.dimensions || 'N/A'}
                                </p>
                                <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#888' }}>
                                    <strong>Materials:</strong> {sub.materials || 'N/A'}
                                </p>
                                <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#888' }}>
                                    <strong>Submitted by:</strong> {sub.submitterName || sub.submitterEmail}
                                </p>
                                <p style={{ margin: 0, fontSize: 12, color: '#888' }}>
                                    <strong>Date:</strong> {formatDate(sub.submittedAt)}
                                </p>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <span
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: 4,
                                        fontSize: 11,
                                        fontWeight: 600,
                                        textAlign: 'center',
                                        background: sub.status === 'pending' ? '#fef3c7' : sub.status === 'approved' ? '#d1fae5' : '#fee2e2',
                                        color: sub.status === 'pending' ? '#92400e' : sub.status === 'approved' ? '#065f46' : '#991b1b',
                                    }}
                                >
                                    {sub.status.toUpperCase()}
                                </span>

                                {sub.status === 'pending' && (
                                    <>
                                        <button
                                            onClick={() => handleApprove(sub)}
                                            disabled={processingId === sub.id}
                                            style={{
                                                padding: '8px 12px',
                                                background: '#16a34a',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: 4,
                                                cursor: processingId === sub.id ? 'not-allowed' : 'pointer',
                                                fontSize: 12,
                                                fontWeight: 600,
                                            }}
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => handleReject(sub)}
                                            disabled={processingId === sub.id}
                                            style={{
                                                padding: '8px 12px',
                                                background: '#dc2626',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: 4,
                                                cursor: processingId === sub.id ? 'not-allowed' : 'pointer',
                                                fontSize: 12,
                                                fontWeight: 600,
                                            }}
                                        >
                                            Reject
                                        </button>
                                    </>
                                )}

                                <button
                                    onClick={() => handleDelete(sub)}
                                    disabled={processingId === sub.id}
                                    style={{
                                        padding: '8px 12px',
                                        background: '#f3f4f6',
                                        color: '#666',
                                        border: 'none',
                                        borderRadius: 4,
                                        cursor: processingId === sub.id ? 'not-allowed' : 'pointer',
                                        fontSize: 12,
                                    }}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Image preview modal */}
            {selectedSubmission && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 50000,
                        cursor: 'pointer',
                    }}
                    onClick={() => setSelectedSubmission(null)}
                >
                    <img
                        src={selectedSubmission.imageUrl || selectedSubmission.imageBase64}
                        alt={selectedSubmission.title}
                        style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                    />
                </div>
            )}
        </div>
    );
};

export default AdminPage;
