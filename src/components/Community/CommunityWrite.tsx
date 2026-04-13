import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import HeaderSelector, { type HeaderItem } from './HeaderSelector';
import { getOptimizedImageUrl } from '../../utils/imageProxy';
import { CommunityUploadModal } from './CommunityUploadModal';
import CornerCropModal from './CornerCropModal';
import { manualPerspectiveCrop } from '../../utils/scanner';
import { getWorkerNetworkMode } from '../../utils/network';

interface CommunityWriteProps {
    onBack: () => void;
    onComplete: () => void;
}

// Helper: Image Compression
const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url); // Free memory immediately after load
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const MAX_DIM = 1600;
            const ratio = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
            canvas.width = Math.round(img.width * ratio);
            canvas.height = Math.round(img.height * ratio);
            if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
            let quality = 0.85;
            const tryCompress = () => {
                canvas.toBlob((blob) => {
                    if (!blob) reject(new Error('Compression failed'));
                    else if (blob.size > 500 * 1024 && quality > 0.5) {
                        quality -= 0.1;
                        tryCompress();
                    } else {
                        resolve(blob);
                    }
                }, 'image/webp', quality);
            };
            tryCompress();
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
        img.src = url;
    });
};

// Helper: Upload to R2 (with Firebase fallback)
const uploadToCloud = async (file: File, submissionId: string): Promise<string> => {
    const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL;
    try {
        const compressedBlob = await compressImage(file);

        // Try R2
        if (R2_WORKER_URL) {
            const formData = new FormData();
            formData.append('file', compressedBlob, `${submissionId}.webp`);
            formData.append('submissionId', submissionId);
            formData.append('exhibitionId', 'community');

            const res = await fetch(`${R2_WORKER_URL}/upload`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                const data = await res.json();
                return data.url;
            }
        }
        throw new Error('R2 skipped or failed');
    } catch (e) {
        console.warn('R2 upload failed, fallback to Firebase', e);
        // Fallback to Firebase Storage (reuse blob if already compressed)
        const compressedBlob = await compressImage(file);
        const storageRef = ref(storage, `community/${submissionId}.webp`);
        const snapshot = await uploadBytes(storageRef, compressedBlob);
        return await getDownloadURL(snapshot.ref);
    }
};


// Helper to get corners array from object
const cornersToArray = (c: { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] }) => {
    return [
        { x: c.tl[0], y: c.tl[1] },
        { x: c.tr[0], y: c.tr[1] },
        { x: c.br[0], y: c.br[1] },
        { x: c.bl[0], y: c.bl[1] }
    ];
};

interface Attachment {
    id: string;
    type: 'upload' | 'artwork';
    file?: File;
    originalFile?: File;
    currentCorners?: { x: number; y: number }[];
    imageUrl: string;
    artworkId?: string;
    title: string;
    metadata?: any;
}

const CommunityWrite: React.FC<CommunityWriteProps> = ({ onBack, onComplete }) => {
    const { user } = useAuth();

    const [title, setTitle] = useState('');
    const [editorHtml, setEditorHtml] = useState('');
    const [header, setHeader] = useState<HeaderItem | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]); // Keep tracking for upload purposes if needed
    const [showUploadModal, setShowUploadModal] = useState(false);

    // Mention State
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionResults, setMentionResults] = useState<HeaderItem[]>([]);
    const [mentionRange, setMentionRange] = useState<Range | null>(null);
    const [mentionPosition, setMentionPosition] = useState<{ top: number, left: number } | null>(null);

    const [editingAttachment, setEditingAttachment] = useState<Attachment | null>(null);
    const [metadataEditTarget, setMetadataEditTarget] = useState<Attachment | null>(null); // NEW
    const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null); // NEW
    const workerRef = useRef<Worker | null>(null);
    const editorRef = useRef<HTMLDivElement>(null);

    const ensureEditorCaretReady = () => {
        const editor = editorRef.current;
        if (!editor) return;

        const hasNode = Array.from(editor.childNodes).some(
            (node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE,
        );
        if (!hasNode) {
            editor.appendChild(document.createTextNode('\u200B'));
        }

        const selection = window.getSelection();
        if (!selection) return;
        if (selection.rangeCount > 0 && editor.contains(selection.anchorNode)) return;

        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    };

    const focusEditorFromTouch = () => {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
            active.blur();
        }

        requestAnimationFrame(() => {
            editorRef.current?.focus();
            ensureEditorCaretReady();
        });
    };

    const attachmentsRef = useRef<Attachment[]>([]); // NEW
    useEffect(() => { // NEW
        attachmentsRef.current = attachments; // NEW
    }, [attachments]); // NEW

    // Manual Crop Handler (Re-crop after attach)
    const handleReCrop = async (corners: { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] }) => {
        if (!editingAttachment || !editingAttachment.originalFile) return;

        try {
            const croppedBlob = await manualPerspectiveCrop(editingAttachment.originalFile, corners);
            const croppedFile = new File([croppedBlob], editingAttachment.file?.name || 'edited.webp', { type: 'image/webp' });
            const newUrl = URL.createObjectURL(croppedBlob);

            // Save normalized corners for next time
            const cornersArr = cornersToArray(corners);

            // Update state
            setAttachments(prev => prev.map(a => {
                if (a.id === editingAttachment.id) {
                    return { ...a, file: croppedFile, imageUrl: newUrl, currentCorners: cornersArr };
                }
                return a;
            }));

            // Update HTML content
            if (editorRef.current) {
                const container = editorRef.current.querySelector(`.post-image-container[data-attachment-id="${editingAttachment.id}"]`);
                if (container) {
                    const img = container.querySelector('img');
                    if (img) img.src = newUrl;
                }
                setEditorHtml(editorRef.current.innerHTML);
            }
        } catch (e) {
            console.error('Re-crop failed', e);
            alert('Failed to crop image');
        } finally {
            setEditingAttachment(null);
            if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl); // NEW
            setCropPreviewUrl(null); // NEW
        }
    };

    // Lazy-init Search Worker: only load when user starts typing @mention
    // This prevents loading the search index (can be MBs) on page mount
    const initWorker = () => {
        if (workerRef.current) return;
        workerRef.current = new Worker(new URL('../../workers/search.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current.onmessage = (e) => {
            const { type, results } = e.data;
            if (type === 'RESULTS') {
                const formatted: HeaderItem[] = (results || []).slice(0, 10).map((art: any) => ({
                    id: art.id,
                    type: 'artwork',
                    name: art.name || art.n,
                    image: art.image || art.i,
                    subtext: art.artist || art.a,
                    year: art.year || art.date || art.d,
                    museum: art.museumName || art.m,
                    exhibition: art.exhibitionId || art.e
                }));
                setMentionResults(formatted);
            }
        };
        workerRef.current.postMessage({ type: 'SET_MODE', mode: getWorkerNetworkMode() });
        workerRef.current.postMessage({ type: 'LOAD' });
    };

    // Cleanup worker on unmount
    useEffect(() => {
        return () => workerRef.current?.terminate();
    }, []);

    // Handle Mention Search — init worker on first @mention
    useEffect(() => {
        if (mentionQuery && mentionQuery.length >= 1) {
            initWorker(); // Lazy init
            workerRef.current?.postMessage({ type: 'SEARCH', query: mentionQuery });
        } else {
            setMentionResults([]);
        }
    }, [mentionQuery]);

    // Handle Input in ContentEditable
    const handleInput = () => {
        if (!editorRef.current) return;
        const html = editorRef.current.innerHTML;
        setEditorHtml(html);

        // Detect @mention
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const node = range.startContainer;

            // Should be text node
            if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                const text = node.textContent;
                const cursor = range.startOffset;
                // Look backwards from cursor for @
                const textBefore = text.slice(0, cursor);
                const lastAt = textBefore.lastIndexOf('@');

                if (lastAt !== -1) {
                    // Check spaces/newlines
                    const charBeforeAt = lastAt > 0 ? textBefore[lastAt - 1] : ' ';
                    if (charBeforeAt === ' ' || charBeforeAt === '\u00A0' || charBeforeAt === '\n') {
                        const query = textBefore.slice(lastAt + 1);
                        if (!query.includes('\n')) {
                            setMentionQuery(query);

                            // Save range to replace later
                            const newRange = document.createRange();
                            try {
                                newRange.setStart(node, lastAt);
                                newRange.setEnd(node, cursor);
                                setMentionRange(newRange);
                            } catch (e) {
                                // Ignore indexing errors
                            }
                            // Calculate position relative to editor
                            const rect = newRange.getBoundingClientRect();
                            const editorRect = editorRef.current.getBoundingClientRect();
                            setMentionPosition({
                                top: rect.bottom - editorRect.top + 5, // 5px offset
                                left: rect.left - editorRect.left
                            });
                            return;
                        }
                    }
                }
            }
        }
        setMentionQuery(null);
        setMentionRange(null);
        setMentionPosition(null);
    };

    // Metadata Edit Handler // NEW
    const handleMetaSave = (title: string, artist: string, year: string) => { // NEW
        if (!metadataEditTarget) return; // NEW

        setAttachments(prev => prev.map(a => { // NEW
            if (a.id === metadataEditTarget.id) { // NEW
                return { // NEW
                    ...a, // NEW
                    title, // NEW
                    metadata: { ...a.metadata, artist, year } // NEW
                }; // NEW
            } // NEW
            return a; // NEW
        })); // NEW

        // Update HTML // NEW
        if (editorRef.current) { // NEW
            const container = editorRef.current.querySelector(`.post-image-container[data-attachment-id="${metadataEditTarget.id}"]`); // NEW
            if (container) { // NEW
                const titleEl = container.querySelector('.att-title'); // NEW
                const artistEl = container.querySelector('.att-artist'); // NEW
                if (titleEl) titleEl.textContent = `${title}${year ? ` (${year})` : ''}`; // NEW
                if (artistEl) artistEl.textContent = artist; // NEW
            } // NEW
            setEditorHtml(editorRef.current.innerHTML); // NEW
        } // NEW
        setMetadataEditTarget(null); // NEW
    }; // NEW

    // Editor Click Handler for Crop Button & Meta Edit // NEW
    const handleEditorClick = (e: React.MouseEvent) => { // NEW
        const target = e.target as HTMLElement; // NEW

        const removeTrigger = target.closest('.remove-attachment-trigger');
        if (removeTrigger) {
            e.preventDefault();
            e.stopPropagation();
            const container = removeTrigger.closest('.post-image-container') as HTMLElement | null;
            if (container) {
                const id = container.getAttribute('data-attachment-id');
                container.remove();
                if (id) {
                    setAttachments(prev => prev.filter(a => a.id !== id));
                }
                if (editorRef.current) {
                    setEditorHtml(editorRef.current.innerHTML);
                }
            }
            return;
        }

        // Crop Trigger // NEW
        const cropTrigger = target.closest('.crop-trigger'); // NEW
        if (cropTrigger) { // NEW
            e.preventDefault(); // NEW
            e.stopPropagation(); // NEW
            const container = cropTrigger.closest('.post-image-container'); // NEW
            if (container) { // NEW
                const id = container.getAttribute('data-attachment-id'); // NEW
                const att = attachmentsRef.current.find(a => a.id === id); // Use Ref for latest // NEW
                if (att && att.originalFile && att.type === 'upload') { // NEW
                    setEditingAttachment(att); // NEW
                    setCropPreviewUrl(att.imageUrl); // NEW
                } // NEW
            } // NEW
            return; // NEW
        } // NEW

        // Meta Edit Trigger // NEW
        const metaTrigger = target.closest('.edit-meta-trigger'); // NEW
        if (metaTrigger) { // NEW
            e.preventDefault(); // NEW
            e.stopPropagation(); // NEW
            const container = metaTrigger.closest('.post-image-container'); // NEW
            if (container) { // NEW
                const id = container.getAttribute('data-attachment-id'); // NEW
                const att = attachmentsRef.current.find(a => a.id === id); // NEW
                if (att && att.type === 'upload') { // NEW
                    setMetadataEditTarget(att); // NEW
                } // NEW
            } // NEW
        } // NEW

        if (!target.closest('.post-image-container')) {
            focusEditorFromTouch();
        }
    }; // NEW

    const insertImageBlock = (
        imageUrl: string,
        alt: string,
        artworkId?: string,
        metadata?: { title: string, artist?: string, year?: string | number, museum?: string, exhibition?: string },
        options?: { attachmentId?: string; isUpload?: boolean; insertRange?: Range | null }
    ) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'post-image-container';
        wrapper.contentEditable = 'false';
        wrapper.style.margin = '6px 0 10px 0';
        wrapper.style.maxWidth = '100%';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '6px';
        if (options?.attachmentId) wrapper.setAttribute('data-attachment-id', options.attachmentId);
        if (options?.isUpload) wrapper.setAttribute('data-attachment-type', 'upload');
        wrapper.draggable = true;

        const imgWrap = document.createElement('div');
        imgWrap.style.position = 'relative';
        imgWrap.style.display = 'block';
        imgWrap.style.width = '100%';

        const img = document.createElement('img');
        img.src = getOptimizedImageUrl(imageUrl, 600);
        img.alt = alt;
        img.style.width = '100%';
        img.style.borderRadius = '8px';
        img.style.display = 'block';
        img.style.margin = '0';
        if (artworkId) img.dataset.artworkId = artworkId;
        imgWrap.appendChild(img);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove-attachment-trigger';
        remove.title = 'Remove image';
        remove.style.position = 'absolute';
        remove.style.top = '8px';
        remove.style.right = '8px';
        remove.style.width = '26px';
        remove.style.height = '26px';
        remove.style.borderRadius = '999px';
        remove.style.border = '1px solid rgba(255,255,255,0.8)';
        remove.style.background = 'rgba(0,0,0,0.55)';
        remove.style.color = '#fff';
        remove.style.fontSize = '16px';
        remove.style.display = 'flex';
        remove.style.alignItems = 'center';
        remove.style.justifyContent = 'center';
        remove.style.cursor = 'pointer';
        remove.style.zIndex = '6';
        remove.style.padding = '0';
        remove.style.lineHeight = '1';
        remove.textContent = '×';
        imgWrap.appendChild(remove);

        if (options?.isUpload) {
            const crop = document.createElement('div');
            crop.className = 'crop-trigger';
            crop.title = 'Crop';
            crop.style.position = 'absolute';
            crop.style.bottom = '8px';
            crop.style.right = '8px';
            crop.style.width = '28px';
            crop.style.height = '28px';
            crop.style.background = 'rgba(0,0,0,0.6)';
            crop.style.borderRadius = '50%';
            crop.style.display = 'flex';
            crop.style.alignItems = 'center';
            crop.style.justifyContent = 'center';
            crop.style.cursor = 'pointer';
            crop.style.color = 'white';
            crop.style.border = '1.5px solid white';
            crop.style.zIndex = '5';
            crop.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
            crop.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>';
            imgWrap.appendChild(crop);
        }

        wrapper.appendChild(imgWrap);

        if (metadata) {
            const caption = document.createElement('div');
            caption.style.textAlign = 'left';
            caption.style.lineHeight = '1.25';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'att-title';
            titleDiv.style.fontSize = '15px';
            titleDiv.style.fontWeight = '700';
            titleDiv.style.color = '#111';
            let titleText = metadata.title || '';
            if (metadata.year) titleText += ` (${metadata.year})`;
            titleDiv.textContent = titleText;
            if (options?.isUpload) {
                const edit = document.createElement('span');
                edit.className = 'edit-meta-trigger';
                edit.textContent = '✏️';
                edit.style.fontSize = '12px';
                edit.style.cursor = 'pointer';
                edit.style.opacity = '0.5';
                edit.style.marginLeft = '6px';
                titleDiv.appendChild(edit);
            }
            caption.appendChild(titleDiv);

            const artistDiv = document.createElement('div');
            artistDiv.className = 'att-artist';
            artistDiv.style.fontSize = '13px';
            artistDiv.style.color = '#444';
            artistDiv.style.marginTop = '2px';
            artistDiv.textContent = metadata.artist || '';
            caption.appendChild(artistDiv);

            const parts: string[] = [];
            if (metadata.museum) parts.push(metadata.museum);
            if (metadata.exhibition && metadata.exhibition !== metadata.museum) parts.push(metadata.exhibition);
            const metaDiv = document.createElement('div');
            metaDiv.className = 'att-meta';
            metaDiv.style.fontSize = '12px';
            metaDiv.style.color = '#888';
            metaDiv.style.marginTop = '2px';
            metaDiv.textContent = parts.join(' • ');
            caption.appendChild(metaDiv);

            wrapper.appendChild(caption);
        }

        const insertAtRange = options?.insertRange || mentionRange || null;
        if (insertAtRange && editorRef.current) {
            insertAtRange.deleteContents();
            insertAtRange.insertNode(wrapper);
            const spacer = document.createTextNode('\u200B');
            wrapper.after(spacer);
            const selection = window.getSelection();
            if (selection) {
                const range = document.createRange();
                range.setStartAfter(spacer);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            setMentionQuery(null);
            setMentionRange(null);
        } else {
            editorRef.current?.appendChild(wrapper);
            wrapper.after(document.createTextNode('\u200B'));
            if (editorRef.current) editorRef.current.scrollTop = editorRef.current.scrollHeight;
        }

        if (editorRef.current) {
            setEditorHtml(editorRef.current.innerHTML);
        }
    };

    const handleSelectMention = (item: any) => {
        insertImageBlock(
            item.image || '',
            item.name,
            item.id,
            {
                title: item.name,
                artist: item.subtext,
                year: item.year,
                museum: item.museum,
                exhibition: item.exhibition
            },
            { attachmentId: `artwork-${item.id}` }
        );
    };

    const handleUploadComplete = (items: any[]) => {
        const newAttachments: Attachment[] = items.map(item => ({
            id: Math.random().toString(36).substr(2, 9),
            type: 'upload',
            imageUrl: item.imageUrl,
            file: item.file,
            originalFile: item.originalFile,
            title: item.metadata.title,
            metadata: item.metadata,
            currentCorners: item.currentCorners
        }));

        setAttachments(prev => [...prev, ...newAttachments]);

        // Insert into editor at current caret position
        newAttachments.forEach((att) => {
            insertImageBlock(
                att.imageUrl,
                att.title,
                undefined,
                {
                    title: att.title,
                    artist: att.metadata?.artist,
                    year: att.metadata?.year,
                    museum: att.metadata?.museum,
                    exhibition: att.metadata?.exhibition
                },
                { attachmentId: att.id, isUpload: true }
            );
        });

        setShowUploadModal(false);
    };

    const getRangeFromPoint = (x: number, y: number) => {
        const doc = document as any;
        if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y) as Range;
        if (doc.caretPositionFromPoint) {
            const pos = doc.caretPositionFromPoint(x, y);
            if (!pos) return null;
            const range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
            return range;
        }
        return null;
    };

    const syncAttachmentOrder = () => {
        if (!editorRef.current) return;
        const nodes = Array.from(editorRef.current.querySelectorAll('.post-image-container'));
        const order = nodes.map(node => node.getAttribute('data-attachment-id')).filter(Boolean) as string[];
        if (!order.length) return;
        setAttachments(prev => {
            const byId = new Map(prev.map(a => [a.id, a]));
            const ordered = order.map(id => byId.get(id)).filter(Boolean) as Attachment[];
            const remaining = prev.filter(a => !order.includes(a.id));
            return [...ordered, ...remaining];
        });
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const internalId = e.dataTransfer.getData('application/x-community-attachment');
        if (internalId && editorRef.current) {
            const source = editorRef.current.querySelector(`.post-image-container[data-attachment-id="${internalId}"]`);
            const targetEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
            const target = targetEl?.closest('.post-image-container');
            if (source && target && source !== target) {
                const targetRect = target.getBoundingClientRect();
                const insertBefore = e.clientY < targetRect.top + targetRect.height / 2;
                const parent = target.parentNode;
                if (parent) {
                    parent.insertBefore(source, insertBefore ? target : target.nextSibling);
                    syncAttachmentOrder();
                    setEditorHtml(editorRef.current.innerHTML);
                }
            } else if (source && !target) {
                editorRef.current.appendChild(source);
                syncAttachmentOrder();
                setEditorHtml(editorRef.current.innerHTML);
            }
            return;
        }

        const insertRange = getRangeFromPoint(e.clientX, e.clientY);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            // If dropping files directly (without modal), we should ideally open the modal?
            // User requested: "upload button... and drag and drop functionality... as before?"
            // Wait, previously handleDrop just inserted image.
            // If I change it to open modal, it serves the goal "metadata input".
            // But maybe too intrusive?
            // "When a user uploads an artwork through a community post, they should be able to: Select a museum... Input metadata..."
            // This implies ANY upload mechanism.
            // So if I drop a file, I should probably open the modal with that file.

            // For now, let's keep the existing "quick drop" behavior but maybe I should assume
            // if they want metadata they use the button?
            // OR, I can open the modal pre-filled.
            // However, opening modal from drop is tricky if we drop multiple files.
            // Let's stick to existing behavior for drop (quick insert) unless user asks otherwise.
            // BUT, the request "The user also wants to fix the drag-and-drop functionality for inserting artworks from the artist page"
            // That is handled by JSON data below.

            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            files.forEach(file => {
                const url = URL.createObjectURL(file);
                insertImageBlock(url, file.name, undefined, { title: file.name }, { insertRange, attachmentId: url, isUpload: true });

                setAttachments(prev => [...prev, {
                    id: url,
                    type: 'upload',
                    file,
                    originalFile: file,
                    imageUrl: url,
                    title: file.name
                }]);
            });
        }

        const jsonData = e.dataTransfer.getData('application/json');
        if (jsonData) {
            try {
                const data = JSON.parse(jsonData);
                if ((data.id || data.objectID) && (data.image || data.imageUrl)) {
                    const img = data.image || data.imageUrl;
                    const artist = data.artist || data.subtext || '';
                    insertImageBlock(img, data.name || 'Artwork', data.id, {
                        title: data.name,
                        artist,
                        year: data.year,
                        museum: data.museum,
                        exhibition: data.exhibition
                    }, { insertRange, attachmentId: `artwork-${data.id}` });
                    return; // Handled
                }
            } catch (err) { }
        }

        // Fallback: Text Drop (Treat as Mention)
        const textData = e.dataTransfer.getData('text/plain');
        if (textData) {
            // User suggests: "If dragging doesn't work... input name... embedding like mention"
            // We simulate typing "@Name"

            // Focus editor
            editorRef.current?.focus();

            // Insert "@" + text
            // We strip newlines to keep it clean
            const cleanText = textData.trim().replace(/\n/g, ' ');
            if (cleanText) {
                const range = insertRange || getRangeFromPoint(e.clientX, e.clientY);
                if (range) {
                    range.deleteContents();
                    range.insertNode(document.createTextNode(`@${cleanText}`));
                } else {
                    document.execCommand('insertText', false, `@${cleanText}`);
                }
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !title.trim() || !header) return;
        setIsSubmitting(true);

        try {
            // 1. Upload pending attachments
            const uploadedAttachments = await Promise.all(attachments.map(async (att) => {
                if (att.type === 'upload' && att.file && att.imageUrl.startsWith('blob:')) {
                    // Need upload
                    const submissionId = `${Date.now()}-${att.id}`;
                    try {
                        const url = await uploadToCloud(att.file, submissionId);

                        // If it has submission payload (Museum submission), we should ideally send it to pending_submissions too
                        // But for now, let's just use the URL for the community post
                        if (att.metadata?.submissionPayload) {
                            // TODO: Optional: create pending_submission doc here if needed
                        }

                        return { ...att, imageUrl: url, file: undefined }; // Post-upload state
                    } catch (e) {
                        console.error(`Failed to upload ${att.title}`, e);
                        throw new Error(`Failed to upload image: ${att.title}`);
                    }
                }
                return att;
            }));

            // 2. Prepare post data
            const images = uploadedAttachments
                .filter(a => a.type === 'upload')
                .map(a => ({
                    url: a.imageUrl,
                    title: a.title,
                    metadata: a.metadata || {}
                }));

            const artworks = uploadedAttachments
                .filter(a => a.type === 'artwork')
                .map(a => ({
                    id: a.artworkId || '',
                    image: a.imageUrl,
                    title: a.title,
                    artist: a.metadata?.subtext || '',
                    museum: a.metadata?.museum || ''
                }));

            // Replace blob URLs in editorHtml with real URLs
            let finalHtml = editorHtml;


            // Clean Editor HTML: remove failed uploads or temporary blobs? 
            // Actually, we should replace the blob srcs in content with real URLs if we want them embedded.
            // Simple replace:
            const uploadedById = new Map(uploadedAttachments.map(att => [att.id, att]));
            attachments.forEach((oldAtt) => {
                if (oldAtt.imageUrl.startsWith('blob:')) {
                    const updated = uploadedById.get(oldAtt.id);
                    if (updated) finalHtml = finalHtml.replace(oldAtt.imageUrl, updated.imageUrl);
                }
            });

            const postData = {
                title,
                content: finalHtml,
                header: {
                    id: header.id,
                    type: header.type,
                    name: header.name,
                    image: header.image || null,
                    subtext: header.subtext || null
                },
                headerId: header.id,
                headerName: header.name,
                headerType: header.type,
                headerImage: header.image || null,
                authorId: user?.uid,
                authorName: user?.displayName || 'Anonymous',
                authorPhoto: user?.photoURL || null,
                createdAt: serverTimestamp(),
                images,
                artworks,
                likes: 0,
                commentCount: 0,
                isHtml: true
            };

            await addDoc(collection(db, 'community_posts'), postData);

            onComplete();
        } catch (error) {
            console.error('Error creating post:', error);
            alert(`Error creating post: ${(error as Error).message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!user) return null;

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
        >
            <div style={{ padding: '16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#666' }}>취소</button>
                <span style={{ fontWeight: 'bold' }}>새 글 작성</span>
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !title.trim() || !header}
                    style={{
                        background: '#000',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '20px',
                        padding: '6px 16px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        opacity: (isSubmitting || !title.trim() || !header) ? 0.3 : 1
                    }}
                >
                    {isSubmitting ? '...' : '등록'}
                </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, position: 'relative' }}>
                <div style={{ padding: '20px 20px 0 20px' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <HeaderSelector selectedItem={header} onSelect={setHeader} />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onFocus={() => {
                                setMentionQuery(null);
                                setMentionRange(null);
                                setMentionPosition(null);
                            }}
                            placeholder="제목을 입력하세요"
                            autoCapitalize="sentences"
                            autoCorrect="on"
                            enterKeyHint="next"
                            style={{
                                width: '100%',
                                padding: '12px 0',
                                border: 'none',
                                borderBottom: '1px solid #eee',
                                fontSize: '18px',
                                fontWeight: 'bold',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>



                <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', padding: '10px 20px', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 100, background: '#fff' }}>
                    <button
                        onClick={() => setShowUploadModal(true)}
                        style={{
                            padding: '6px 12px',
                            fontSize: '13px',
                            border: '1px solid #eaeaea',
                            borderRadius: '6px',
                            background: '#fff',
                            cursor: 'pointer',
                            color: '#444',
                            fontWeight: '500',
                            transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#ccc'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = '#eaeaea'}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        이미지
                    </button>
                    <button
                        onClick={() => {
                            document.execCommand('formatBlock', false, '<div>');
                            document.execCommand('removeFormat');
                        }}
                        style={{
                            padding: '6px 12px',
                            fontSize: '13px',
                            border: '1px solid #eaeaea',
                            borderRadius: '6px',
                            background: '#fff',
                            cursor: 'pointer',
                            color: '#444',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#ccc'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = '#eaeaea'}
                    >
                        일반 T
                    </button>
                    <button
                        onClick={() => {
                            document.execCommand('formatBlock', false, '<h3>');
                        }}
                        style={{
                            padding: '6px 12px',
                            fontSize: '13px',
                            fontWeight: '700',
                            border: '1px solid #eaeaea',
                            borderRadius: '6px',
                            background: '#fff',
                            cursor: 'pointer',
                            color: '#111',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = '#ccc'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = '#eaeaea'}
                    >
                        제목 (Bold)
                    </button>
                </div>

                <div style={{ position: 'relative', minHeight: '300px', padding: '0 20px 20px 20px' }}>
                    {/* ContentEditable Editor */}
                    {/* ContentEditable Editor */}
                    <div
                        ref={editorRef}
                        className="editor-content"
                        contentEditable
                        onClick={handleEditorClick}
                        onDragStart={(e) => {
                            const target = (e.target as HTMLElement).closest('.post-image-container') as HTMLElement | null;
                            if (!target) return;
                            const id = target.getAttribute('data-attachment-id');
                            if (!id) return;
                            e.dataTransfer.setData('application/x-community-attachment', id);
                            e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                            if (e.dataTransfer.types.includes('application/x-community-attachment')) {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                            }
                        }}
                        onDrop={handleDrop}
                        onInput={handleInput}
                        onFocus={ensureEditorCaretReady}
                        onTouchStart={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest('.remove-attachment-trigger, .crop-trigger, .edit-meta-trigger')) return;
                            focusEditorFromTouch();
                        }}
                        style={{
                            width: '100%',
                            minHeight: '300px',
                            outline: 'none',
                            fontSize: '14px',
                            fontWeight: '400',
                            lineHeight: '1.6',
                            whiteSpace: 'pre-wrap',
                            color: '#333'
                        }}
                        data-placeholder="내용을 입력하세요... (@작품이름 으로 작품 첨부)"
                    />

                    {/* Place holder simulation if empty */}
                    {!editorHtml && (
                        <div style={{ position: 'absolute', top: 0, left: '20px', color: '#ccc', pointerEvents: 'none' }}>
                            내용을 입력하세요... (@작품이름 으로 작품 첨부)
                        </div>
                    )}

                    {/* Mention Dropdown */}
                    {mentionQuery !== null && mentionResults.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: mentionPosition ? mentionPosition.top : '40px',
                            left: mentionPosition ? Math.min(mentionPosition.left, (editorRef.current?.offsetWidth || 300) - 200) : '0', // Prevent overflow right
                            width: '280px',
                            background: 'white',
                            border: '1px solid #eee',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            zIndex: 100,
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            {mentionResults.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => handleSelectMention(item)}
                                    style={{ padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                                >
                                    <img src={getOptimizedImageUrl(item.image || '', 30)} alt="" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4 }} />
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: '500' }}>{item.name}</div>
                                        <div style={{ fontSize: '11px', color: '#666' }}>{item.subtext}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showUploadModal && (
                <CommunityUploadModal
                    onClose={() => setShowUploadModal(false)}
                    onComplete={handleUploadComplete}
                />
            )}

            {/* Re-Crop Modal */}
            {editingAttachment && editingAttachment.originalFile && (
                <CornerCropModal
                    imageUrl={URL.createObjectURL(editingAttachment.originalFile)}
                    initialCorners={editingAttachment.currentCorners}
                    onApply={handleReCrop}
                    onCancel={() => setEditingAttachment(null)}
                />
            )}

            {/* Metadata Edit Modal */}
            {metadataEditTarget && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 2000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setMetadataEditTarget(null)}>
                    <div style={{
                        background: '#fff', width: '90%', maxWidth: '320px',
                        padding: '20px', borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>정보 수정</h3>

                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>작품명</label>
                            <input
                                defaultValue={metadataEditTarget.title}
                                id="meta-title"
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                            />
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>작가</label>
                            <input
                                defaultValue={metadataEditTarget.metadata?.artist || ''}
                                id="meta-artist"
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                            />
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>연도</label>
                            <input
                                defaultValue={metadataEditTarget.metadata?.year || ''}
                                id="meta-year"
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setMetadataEditTarget(null)}
                                style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', background: '#f5f5f5', cursor: 'pointer', fontSize: '13px' }}
                            >
                                취소
                            </button>
                            <button
                                onClick={() => {
                                    const t = (document.getElementById('meta-title') as HTMLInputElement).value;
                                    const a = (document.getElementById('meta-artist') as HTMLInputElement).value;
                                    const y = (document.getElementById('meta-year') as HTMLInputElement).value;
                                    handleMetaSave(t, a, y);
                                }}
                                style={{ padding: '8px 12px', borderRadius: '6px', border: 'none', background: '#000', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                            >
                                저장
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CommunityWrite;
