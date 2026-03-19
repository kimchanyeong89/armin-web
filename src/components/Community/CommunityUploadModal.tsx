import React, { useState, useRef } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { exhibitions } from '../../data/exhibitions';
import { scanImage, manualPerspectiveCrop } from '../../utils/scanner';
import CornerCropModal from './CornerCropModal';

interface CommunityUploadModalProps {
    onClose: () => void;
    onComplete: (data: Array<{
        imageUrl: string;
        file: File;
        originalFile?: File;
        metadata: {
            title: string;
            artist: string;
            year: string;
            museum?: string;
            exhibition?: string;
            submissionPayload?: any;
        };
        currentCorners?: { x: number; y: number }[];
    }>) => void;
}



interface UploadItem {
    id: string;
    file: File;
    preview: string;
    title: string;
    artist: string;
    year: string;
    status: 'pending' | 'uploading' | 'completed' | 'error';
    progress: number;
    error?: string;
    uploadedUrl?: string; // If 'completed', this holds the URL
    submissionPayload?: any;
    isScanning?: boolean;
    originalFile?: File;
    currentCorners?: { x: number; y: number }[];
}

interface ConflictState {
    currentItem: UploadItem;
    existingArtwork: any;
    queue: UploadItem[];
    processed: UploadItem[];
}

export const CommunityUploadModal: React.FC<CommunityUploadModalProps> = ({ onClose, onComplete }) => {
    // Global exhibition selection
    const [submitToExhibition, setSubmitToExhibition] = useState(false);
    const [museumSearchTerm, setMuseumSearchTerm] = useState('');
    const [showMuseumSuggestions, setShowMuseumSuggestions] = useState(false);
    const [selectedMuseumId, setSelectedMuseumId] = useState('');
    const [selectedExhibitionId, setSelectedExhibitionId] = useState('');

    const [items, setItems] = useState<UploadItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [globalError, setGlobalError] = useState<string | null>(null);

    // Conflict Resolution State
    const [conflict, setConflict] = useState<ConflictState | null>(null);

    // Manual corner crop state
    const [cornerCropItem, setCornerCropItem] = useState<UploadItem | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Manual crop URL management
    const [cornerCropUrl, setCornerCropUrl] = useState<string | null>(null);

    // Open/Close logic for manual crop
    const openManualCrop = (item: UploadItem) => {
        if (item.originalFile || item.file) {
            const file = item.originalFile || item.file;
            const url = URL.createObjectURL(file);
            setCornerCropUrl(url);
            setCornerCropItem(item);
        }
    };

    const closeManualCrop = () => {
        if (cornerCropUrl) URL.revokeObjectURL(cornerCropUrl);
        setCornerCropUrl(null);
        setCornerCropItem(null);
    };

    const handleManualCrop = async (corners: { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] }) => {
        if (!cornerCropItem) return;
        const item = cornerCropItem;
        closeManualCrop(); // Close modal first
        updateItem(item.id, { isScanning: true, error: undefined }); // clear previous errors
        try {
            const sourceFile = item.originalFile || item.file;
            const croppedBlob = await manualPerspectiveCrop(sourceFile, corners);
            const croppedFile = new File([croppedBlob], sourceFile.name.replace(/\.[^/.]+$/, '.webp'), { type: 'image/webp' });
            const croppedUrl = URL.createObjectURL(croppedBlob);
            updateItem(item.id, {
                file: croppedFile,
                preview: croppedUrl,
                isScanning: false,
                currentCorners: [
                    { x: corners.tl[0], y: corners.tl[1] },
                    { x: corners.tr[0], y: corners.tr[1] },
                    { x: corners.br[0], y: corners.br[1] },
                    { x: corners.bl[0], y: corners.bl[1] }
                ]
            });
        } catch (e) {
            console.error('Manual crop failed:', e);
            updateItem(item.id, { isScanning: false, error: 'Manual crop failed' });
        }
    };

    const handleScan = async (item: UploadItem) => {
        updateItem(item.id, { isScanning: true });
        try {
            // Always scan from original file to ensure best quality/re-try
            const sourceFile = item.originalFile || item.file;
            const { blob: processedBlob, metadata, original: convertedOriginal, corners: detectedCorners } = await scanImage(sourceFile);
            const processedFile = new File([processedBlob], sourceFile.name.replace(/\.[^/.]+$/, ".webp"), { type: 'image/webp' });
            const processedUrl = URL.createObjectURL(processedBlob);

            // Update with scanned image AND valid metadata if existing fields are empty
            const updates: Partial<UploadItem> = {
                file: processedFile,
                preview: processedUrl,
                isScanning: false
            };

            // If scanner returned a converted original (e.g. HEIC -> JPEG), update it so Undo works correctly
            if (convertedOriginal) {
                updates.originalFile = convertedOriginal;
            }

            if (metadata) {
                if (metadata.title && (!item.title || item.title === sourceFile.name.replace(/\.[^/.]+$/, ""))) {
                    updates.title = metadata.title;
                }
                if (metadata.artist && !item.artist) {
                    updates.artist = metadata.artist;
                }
                if (metadata.year && !item.year) {
                    updates.year = metadata.year;
                }
            }

            if (detectedCorners) {
                updates.currentCorners = detectedCorners;
            }

            updateItem(item.id, updates);
        } catch (e) {
            console.error("Scan/OCR failed", e);
            // If scan/ocr explicitly failed (thrown error), we stop scanning.
            // But if it was just OCR fail, scanImage catches it and returns the blob without metadata.
            // So if we are here, it means critical failure (e.g. HEIC conversion or CV load)
            updateItem(item.id, { isScanning: false, error: e instanceof Error ? e.message : "Scan failed" });
            // Optionally set error state on item?
        }
    };
    const handleUndo = (item: UploadItem) => {
        if (!item.originalFile) return;
        updateItem(item.id, {
            file: item.originalFile,
            preview: URL.createObjectURL(item.originalFile),
            isScanning: false
        });
    };

    const handleFilesSelected = async (files: FileList | null) => {
        if (!files) return;
        const shouldAutoScan = true;
        const timestamp = Date.now();
        const newItems: UploadItem[] = Array.from(files).map((file, index) => ({
            id: `${timestamp}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            file,
            originalFile: file,
            preview: URL.createObjectURL(file), // Create preview URL
            title: file.name.replace(/\.[^/.]+$/, ""), // Default title from filename
            artist: '',
            year: '',
            status: 'pending',
            progress: 0,
            isScanning: shouldAutoScan // Mobile: skip automatic heavy scan
        }));
        setItems(prev => [...prev, ...newItems]);

        if (!shouldAutoScan) {
            return;
        }

        // Process scans sequentially with delay to avoid Gemini rate limiting
        for (const [i, item] of newItems.entries()) {
            if (i > 0) await new Promise(r => setTimeout(r, 4000)); // 4s delay between scans
            await handleScan(item);
        }
    };

    const updateItem = (id: string, updates: Partial<UploadItem>) => {
        setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };



    const finishUpload = (finalItems: UploadItem[]) => {
        // Just pass data back to parent (CommunityWrite), do NOT upload here.
        // Parent will handle the upload on final submission.
        const completData = finalItems.map(item => ({
            imageUrl: item.preview, // Blob URL
            file: item.file,        // Actual File object
            originalFile: item.originalFile, // Keep original for re-cropping
            metadata: {
                title: item.title,
                artist: item.artist,
                year: item.year,
                museum: submitToExhibition ? exhibitions.find(e => e.id === selectedMuseumId)?.name : undefined,
                exhibition: submitToExhibition ? (
                    exhibitions.find(e => e.id === selectedMuseumId)?.permanentExhibitions.find(e => e.id === selectedExhibitionId)?.name ||
                    exhibitions.find(e => e.id === selectedMuseumId)?.temporaryExhibitions.find(e => e.id === selectedExhibitionId)?.name
                ) : undefined,
                submissionPayload: null // Will be generated by parent
            },
            currentCorners: item.currentCorners
        }));

        onComplete(completData);
        onClose();
    };

    // Check for duplicates before uploading
    const processQueue = async (queue: UploadItem[], processed: UploadItem[]) => {
        if (queue.length === 0) {
            // All checked, proceed to upload 'processed' items
            finishUpload(processed);
            return;
        }

        const [currentItem, ...remaining] = queue;

        // Check exhibition_artworks for same title
        try {
            const q = query(
                collection(db, 'exhibition_artworks'),
                where('name', '==', currentItem.title.trim()),
                limit(1)
            );
            const snap = await getDocs(q);

            if (!snap.empty) {
                // Conflict found!
                const existing = snap.docs[0].data();
                setConflict({
                    currentItem,
                    existingArtwork: { ...existing, id: snap.docs[0].id },
                    queue: remaining,
                    processed
                });
                return; // Stop and wait for user interaction
            }
        } catch (e) {
            console.warn("Failed to check duplicates", e);
        }

        // No conflict, add to processed and continue
        processQueue(remaining, [...processed, currentItem]);
    };

    const handleResolveConflict = (useExisting: boolean) => {
        if (!conflict) return;

        const { currentItem, existingArtwork, queue, processed } = conflict;
        let nextProcessed = processed;

        if (useExisting) {
            // Use existing data
            const resolvedItem: UploadItem = {
                ...currentItem,
                status: 'completed',
                progress: 100,
                uploadedUrl: existingArtwork.image, // Use existing image URL
                title: existingArtwork.name,
                artist: existingArtwork.artist ? (existingArtwork.artist || '') : currentItem.artist,
                year: existingArtwork.year ? (existingArtwork.year?.toString() || '') : currentItem.year,
            };
            nextProcessed = [...processed, resolvedItem];
        } else {
            // Register New (Proceed with original item)
            nextProcessed = [...processed, currentItem];
        }

        setConflict(null);
        // Continue checking queue
        processQueue(queue, nextProcessed);
    };

    const handleUploadAll = async () => {
        setGlobalError(null);
        if (items.length === 0) {
            setGlobalError('Please add images');
            return;
        }
        if (submitToExhibition && (!selectedMuseumId || !selectedExhibitionId)) {
            setGlobalError('Please select a museum and exhibition');
            return;
        }

        // Check required fields
        const missingTitle = items.find(i => !i.title.trim());
        if (missingTitle) {
            setGlobalError('All items must have a title');
            return;
        }

        setIsSubmitting(true);

        // Start checking duplicates
        await processQueue(items, []);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20000 }} onClick={onClose}>
            <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column', position: 'relative' }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Add Images</h2>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', padding: 4 }}>×</button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', position: 'relative' }}>
                    {/* Exhibition Selector */}
                    <div style={{ marginBottom: 24, padding: '16px', background: '#f8f8f8', borderRadius: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={submitToExhibition} onChange={e => setSubmitToExhibition(e.target.checked)} />
                            <span style={{ fontWeight: 600, fontSize: 14 }}>Submit to Exhibition?</span>
                        </label>

                        {submitToExhibition && (
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                                    <input
                                        type="text"
                                        value={museumSearchTerm}
                                        onChange={e => {
                                            setMuseumSearchTerm(e.target.value);
                                            setShowMuseumSuggestions(true);
                                            if (!e.target.value) {
                                                setSelectedMuseumId('');
                                                setSelectedExhibitionId('');
                                            }
                                        }}
                                        onFocus={() => setShowMuseumSuggestions(true)}
                                        placeholder="Search Museum"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
                                    />
                                    {showMuseumSuggestions && museumSearchTerm && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 6, maxHeight: 200, overflowY: 'auto', zIndex: 10, marginTop: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                            {exhibitions.filter(m => m.name.toLowerCase().includes(museumSearchTerm.toLowerCase())).map(m => (
                                                <div key={m.id} onClick={() => { setSelectedMuseumId(m.id); setMuseumSearchTerm(m.name); setShowMuseumSuggestions(false); setSelectedExhibitionId(''); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 13 }} onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                    {m.name}
                                                </div>
                                            ))}
                                            {exhibitions.filter(m => m.name.toLowerCase().includes(museumSearchTerm.toLowerCase())).length === 0 && (
                                                <div style={{ padding: '8px 12px', color: '#888', fontSize: 13 }}>No results</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <select value={selectedExhibitionId} onChange={e => setSelectedExhibitionId(e.target.value)} disabled={!selectedMuseumId} style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, background: !selectedMuseumId ? '#eee' : '#fff' }}>
                                        <option value="">Select Exhibition</option>
                                        {selectedMuseumId && (() => {
                                            const m = exhibitions.find(e => e.id === selectedMuseumId);
                                            if (!m) return null;
                                            return [...(m.permanentExhibitions || []), ...(m.temporaryExhibitions || [])].map(ex => (
                                                <option key={ex.id} value={ex.id}>{ex.name}</option>
                                            ));
                                        })()}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Items List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {items.map((item) => (
                            <div key={item.id} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: 16, border: '1px solid #eaeaea', borderRadius: 8, background: '#fff' }}>
                                {/* Thumbnail */}
                                <div style={{ width: 80, height: 80, flexShrink: 0, background: '#f5f5f5', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                    <img src={item.preview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: item.isScanning ? 0.5 : 1 }} />
                                    {item.isScanning && (
                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                                        </div>
                                    )}
                                </div>

                                {/* Inputs */}
                                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <input
                                            type="text"
                                            value={item.title}
                                            onChange={e => updateItem(item.id, { title: e.target.value })}
                                            placeholder="Title *"
                                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={item.artist}
                                        onChange={e => updateItem(item.id, { artist: e.target.value })}
                                        placeholder="Artist"
                                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                                    />
                                    <input
                                        type="number"
                                        value={item.year}
                                        onChange={e => updateItem(item.id, { year: e.target.value })}
                                        placeholder="Year"
                                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                                    />
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <button
                                        type="button"
                                        onClick={() => removeItem(item.id)}
                                        style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#f5f5f5', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Remove"
                                    >
                                        ✕
                                    </button>
                                    {!item.isScanning && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setCornerCropItem(null); setCornerCropUrl(null); handleScan(item); }}
                                                style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#f0f0f0', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
                                                title="Auto-Crop"
                                            >
                                                ✂️
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); openManualCrop(item); }}
                                                style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#f0f0f0', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
                                                title="Manual Corner Crop"
                                            >
                                                📐
                                            </button>
                                            {item.originalFile && item.file !== item.originalFile && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleUndo(item)}
                                                    style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#f0f0f0', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
                                                    title="Undo / Revert to Original"
                                                >
                                                    ↩️
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Drop Zone / Add Button */}
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: '2px dashed #ddd', borderRadius: 8, padding: 32,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                                cursor: 'pointer', background: '#fcfcfc', color: '#888', transition: 'all 0.2s', marginTop: 8
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = '#ccc'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = '#ddd'}
                        >
                            <span style={{ fontSize: 24 }}>+</span>
                            <span style={{ fontSize: 14, fontWeight: 500 }}>Add Images</span>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={e => handleFilesSelected(e.target.files)}
                                multiple
                                accept="image/*, .heic, .heif"
                                style={{ display: 'none' }}
                            />
                        </div>
                    </div>

                    {/* Conflict Resolution Modal Overlay */}
                    {conflict && (
                        <div style={{
                            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.96)', zIndex: 100,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 8
                        }}>
                            <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
                                <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
                                <h3 style={{ fontSize: 18, marginBottom: 12, fontWeight: 700 }}>Duplicate Artwork Found</h3>
                                <p style={{ marginBottom: 24, fontSize: 14, lineHeight: 1.5, color: '#555' }}>
                                    A work named <b>"{conflict.currentItem.title}"</b> already exists.
                                </p>

                                <div style={{ display: "flex", gap: 24, marginBottom: 24, justifyContent: 'center' }}>
                                    <div style={{ width: 120 }}>
                                        <div style={{ fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#888' }}>You Uploaded</div>
                                        <div style={{ width: '100%', aspectRatio: '1/1', background: '#f5f5f5', borderRadius: 8, overflow: 'hidden' }}>
                                            <img src={conflict.currentItem.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                    </div>
                                    <div style={{ width: 120 }}>
                                        <div style={{ fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#888' }}>Existing</div>
                                        <div style={{ width: '100%', aspectRatio: '1/1', background: '#f5f5f5', borderRadius: 8, overflow: 'hidden' }}>
                                            <img src={conflict.existingArtwork.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleResolveConflict(true)}
                                        style={{ padding: '12px', background: '#111', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
                                    >
                                        Use Existing Image (Skip Upload)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleResolveConflict(false)}
                                        style={{ padding: '12px', background: '#fff', color: '#111', borderRadius: 8, border: '1px solid #ddd', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
                                    >
                                        Register as New
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '20px 24px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                    <div style={{ color: 'red', fontSize: 13 }}>{globalError}</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button type="button" onClick={onClose} style={{ padding: '10px 20px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', color: '#555', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                        <button
                            type="button"
                            onClick={handleUploadAll}
                            disabled={isSubmitting || items.length === 0 || !!conflict}
                            style={{ padding: '10px 24px', border: 'none', borderRadius: 8, background: '#111', color: '#fff', cursor: isSubmitting ? 'wait' : 'pointer', fontWeight: 600, opacity: isSubmitting || items.length === 0 || !!conflict ? 0.5 : 1 }}
                        >
                            {isSubmitting ? 'Processing...' : `Attach ${items.length > 0 ? `(${items.length})` : ''}`}
                        </button>
                    </div>
                </div>
            </div>

            {/* Corner Crop Modal */}
            {cornerCropItem && cornerCropUrl && (
                <CornerCropModal
                    imageUrl={cornerCropUrl}
                    initialCorners={cornerCropItem.currentCorners}
                    onApply={handleManualCrop}
                    onCancel={closeManualCrop}
                />
            )}
        </div>
    );
};
