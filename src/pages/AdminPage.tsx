import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { GlobalNav } from '../components/GlobalNav';
import { useIsAdmin } from '../lib/admin';

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

interface BugReport {
    id: string;
    title: string;
    description: string;
    status: 'open' | 'closed';
    userEmail: string;
    userId: string;
    createdAt: any;
}

const AdminPage: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin, loading } = useIsAdmin();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [bugReports, setBugReports] = useState<BugReport[]>([]);
    const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [currentTab, setCurrentTab] = useState<'artworks' | 'bugs'>('bugs');

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

    // Fetch bug reports
    useEffect(() => {
        if (!isAdmin) return;

        const q = query(collection(db, 'bug_reports'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            const items: BugReport[] = [];
            snap.forEach((docSnap) => {
                items.push({ id: docSnap.id, ...docSnap.data() } as BugReport);
            });
            setBugReports(items);
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
                title: submission.title || 'Untitled',
                name: submission.title || 'Untitled', // Some components use 'name'
                artist: submission.artist || 'Unknown',
                year: submission.year || null,
                dimensions: submission.dimensions || '',
                materials: submission.materials || '',
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
            // If it was approved, we also need to delete the artwork from 'exhibition_artworks'
            if (submission.status === 'approved') {
                // We need to reconstruct the ID used when approving: `${sanitizedExhibitionId}_${submission.id}`
                const sanitizedExhibitionId = submission.exhibitionId
                    .replace(/[\/\\#\[\].*]/g, '_')
                    .replace(/^https?:_+/i, '')
                    .slice(0, 100);
                const artworkDocId = `${sanitizedExhibitionId}_${submission.id}`;
                await deleteDoc(doc(db, 'exhibition_artworks', artworkDocId));
            }

            // Delete the submission record
            await deleteDoc(doc(db, 'pending_submissions', submission.id));
            alert('Submission deleted successfully');
        } catch (err) {
            console.error('Failed to delete:', err);
            alert('Failed to delete submission');
        } finally {
            setProcessingId(null);
        }
    }, [processingId]);

    const handleToggleBugStatus = useCallback(async (bug: BugReport) => {
        if (processingId) return;
        setProcessingId(bug.id);

        try {
            const newStatus = bug.status === 'open' ? 'closed' : 'open';
            await updateDoc(doc(db, 'bug_reports', bug.id), {
                status: newStatus
            });
        } catch (err) {
            console.error('Failed to update bug report:', err);
            alert('Failed to update bug report status');
        } finally {
            setProcessingId(null);
        }
    }, [processingId]);

    const handleDeleteBug = useCallback(async (bug: BugReport) => {
        if (processingId) return;
        if (!confirm('Are you sure you want to delete this bug report?')) return;
        setProcessingId(bug.id);

        try {
            await deleteDoc(doc(db, 'bug_reports', bug.id));
        } catch (err) {
            console.error('Failed to delete bug report:', err);
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

            {/* TABS */}
            <div style={{ display: 'flex', gap: 16, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
                <button
                    onClick={() => setCurrentTab('bugs')}
                    style={{
                        padding: '12px 24px',
                        border: 'none',
                        background: 'transparent',
                        fontSize: 16,
                        fontWeight: 600,
                        color: currentTab === 'bugs' ? '#000' : '#888',
                        borderBottom: currentTab === 'bugs' ? '4px solid #000' : '4px solid transparent',
                        cursor: 'pointer'
                    }}
                >
                    Bug Reports
                </button>
                <button
                    onClick={() => setCurrentTab('artworks')}
                    style={{
                        padding: '12px 24px',
                        border: 'none',
                        background: 'transparent',
                        fontSize: 16,
                        fontWeight: 600,
                        color: currentTab === 'artworks' ? '#000' : '#888',
                        borderBottom: currentTab === 'artworks' ? '4px solid #000' : '4px solid transparent',
                        cursor: 'pointer'
                    }}
                >
                    Artworks Approvals
                </button>
            </div>

            {currentTab === 'artworks' && (
                <>
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
                </>
            )}

            {currentTab === 'bugs' && (
                <div>
                    <h2>Bug Reports</h2>
                    {bugReports.length === 0 ? (
                        <p style={{ color: '#666', padding: 40 }}>No bug reports found.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {bugReports.map(bug => (
                                <div key={bug.id} style={{
                                    background: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderLeft: bug.status === 'open' ? '4px solid #e11d48' : '4px solid #10b981',
                                    padding: 24,
                                    borderRadius: 8
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                        <div>
                                            <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>{bug.title}</h3>
                                            <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                                                <strong>From:</strong> {bug.userEmail} | <strong>Date:</strong> {formatDate(bug.createdAt)}
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                            <span style={{
                                                padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                                background: bug.status === 'open' ? '#fee2e2' : '#d1fae5',
                                                color: bug.status === 'open' ? '#991b1b' : '#065f46'
                                            }}>
                                                {bug.status.toUpperCase()}
                                            </span>
                                            <button
                                                onClick={() => handleToggleBugStatus(bug)}
                                                disabled={processingId === bug.id}
                                                style={{ padding: '6px 12px', background: '#f3f4f6', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                                            >
                                                Mark as {bug.status === 'open' ? 'Closed' : 'Open'}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteBug(bug)}
                                                disabled={processingId === bug.id}
                                                style={{ padding: '6px 12px', background: '#ffe4e6', color: '#e11d48', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ background: '#f9fafb', padding: 16, borderRadius: 6, fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: '#333' }}>
                                        {bug.description}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {/* Global Navigation */}
            <div style={{ position: "fixed", top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10001 }}>
                <GlobalNav isAdmin={isAdmin} />
            </div>
        </div>
    );
};

export default AdminPage;
