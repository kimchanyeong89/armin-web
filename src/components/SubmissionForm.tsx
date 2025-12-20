import React, { useState, useCallback } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

interface SubmissionFormProps {
    exhibitionId: string;
    exhibitionName: string;
    museumName?: string; // Parent museum/gallery name
    onClose: () => void;
    onSuccess?: () => void;
}

export const SubmissionForm: React.FC<SubmissionFormProps> = ({
    exhibitionId,
    exhibitionName,
    museumName,
    onClose,
    onSuccess,
}) => {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [year, setYear] = useState('');
    const [width, setWidth] = useState('');
    const [height, setHeight] = useState('');
    const [materials, setMaterials] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!imageFile) {
            setError('Please select an image');
            return;
        }
        if (!title.trim()) {
            setError('Please enter a title');
            return;
        }

        setSubmitting(true);

        try {
            // Ensure user is logged in with Google
            let user = auth.currentUser;
            if (!user || user.isAnonymous) {
                const provider = new GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                const result = await signInWithPopup(auth, provider);
                user = result.user;
            }

            if (!user) {
                setError('Login required');
                setSubmitting(false);
                return;
            }

            // Generate a unique submission ID
            const submissionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

            // R2 Worker URL - using public bucket URL for now
            // TODO: Deploy Cloudflare Worker and update this URL
            const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL || '';

            // Compress and convert image to WebP (max 1600px longest dimension, max 500KB target)
            const compressImage = (file: File): Promise<Blob> => {
                return new Promise((resolve, reject) => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const img = new Image();

                    img.onerror = () => reject(new Error('Failed to load image'));
                    img.onload = () => {
                        // Limit longest dimension to 1600px
                        const MAX_DIMENSION = 1600;
                        const ratio = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));

                        canvas.width = Math.round(img.width * ratio);
                        canvas.height = Math.round(img.height * ratio);

                        // Use high-quality image rendering
                        if (ctx) {
                            ctx.imageSmoothingEnabled = true;
                            ctx.imageSmoothingQuality = 'high';
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        }

                        // Convert to WebP with quality adjustment for file size
                        let quality = 0.85;
                        const tryCompress = () => {
                            canvas.toBlob((blob) => {
                                if (!blob) {
                                    reject(new Error('Failed to compress image'));
                                    return;
                                }
                                // If still too large and quality can be reduced, try again
                                if (blob.size > 500 * 1024 && quality > 0.5) {
                                    quality -= 0.1;
                                    tryCompress();
                                } else {
                                    resolve(blob);
                                }
                            }, 'image/webp', quality);
                        };
                        tryCompress();
                    };
                    img.src = URL.createObjectURL(file);
                });
            };

            const compressedImage = await compressImage(imageFile);
            console.log(`Image compressed: ${(compressedImage.size / 1024).toFixed(1)}KB`);

            // Try R2 upload first, fallback to base64 if worker not deployed
            let imageUrl = '';
            if (R2_WORKER_URL) {
                try {
                    const formData = new FormData();
                    formData.append('file', compressedImage, `${submissionId}.webp`);
                    formData.append('exhibitionId', exhibitionId);
                    formData.append('submissionId', submissionId);

                    const uploadRes = await fetch(`${R2_WORKER_URL}/upload`, {
                        method: 'POST',
                        body: formData,
                    });

                    if (uploadRes.ok) {
                        const result = await uploadRes.json();
                        imageUrl = result.url;
                        console.log('Image uploaded to R2:', imageUrl);
                    }
                } catch (uploadError) {
                    console.warn('R2 upload failed, using base64 fallback:', uploadError);
                }
            }

            // Fallback: store base64 if R2 upload fails or not configured
            let imageBase64 = '';
            if (!imageUrl) {
                const reader = new FileReader();
                imageBase64 = await new Promise<string>((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(compressedImage);
                });
            }

            // Create pending submission in Firestore
            await addDoc(collection(db, 'pending_submissions'), {
                exhibitionId,
                exhibitionName,
                museumName: museumName || '', // Parent museum/gallery name
                title: title.trim(),
                artist: artist.trim(),
                year: year.trim() ? parseInt(year, 10) : null,
                dimensions: (width.trim() && height.trim()) ? `${width.trim()} x ${height.trim()} cm` : '',
                materials: materials.trim(),
                imageUrl, // R2 URL if uploaded
                imageBase64: imageUrl ? '' : imageBase64, // Base64 fallback only if R2 failed
                imageName: imageFile.name,
                imageType: 'image/webp',
                status: 'pending',
                submittedBy: user.uid,
                submitterEmail: user.email,
                submitterName: user.displayName,
                submittedAt: serverTimestamp(),
            });

            setSuccess(true);
            setTimeout(() => {
                onSuccess?.();
                onClose();
            }, 2000);
        } catch (err) {
            console.error('Submission failed:', err);
            setError('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 20000,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: 12,
                    padding: 24,
                    maxWidth: 420,
                    width: '90%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>Submit Artwork</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
                </div>

                <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
                    Submitting to: <strong>{exhibitionName}</strong>
                </p>

                {success ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                        <p style={{ color: '#16a34a', fontWeight: 600 }}>Submission received!</p>
                        <p style={{ fontSize: 12, color: '#666' }}>Your artwork will be reviewed by an admin.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        {/* Image Upload */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Image *</label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                style={{ width: '100%' }}
                            />
                            {imagePreview && (
                                <img
                                    src={imagePreview}
                                    alt="Preview"
                                    style={{ width: '100%', maxHeight: 200, objectFit: 'contain', marginTop: 8, borderRadius: 4 }}
                                />
                            )}
                        </div>

                        {/* Title */}
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Title *</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Artwork title"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                            />
                        </div>

                        {/* Artist */}
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Artist</label>
                            <input
                                type="text"
                                value={artist}
                                onChange={(e) => setArtist(e.target.value)}
                                placeholder="Artist name"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                            />
                        </div>

                        {/* Year */}
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Year</label>
                            <input
                                type="number"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                placeholder="e.g. 2024"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                            />
                        </div>

                        {/* Dimensions */}
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Dimension (cm)</label>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    type="number"
                                    value={width}
                                    onChange={(e) => setWidth(e.target.value)}
                                    placeholder="Width"
                                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                                />
                                <span style={{ color: '#666' }}>×</span>
                                <input
                                    type="number"
                                    value={height}
                                    onChange={(e) => setHeight(e.target.value)}
                                    placeholder="Height"
                                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                                />
                                <span style={{ color: '#666', fontSize: 12 }}>cm</span>
                            </div>
                        </div>

                        {/* Materials */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Materials</label>
                            <input
                                type="text"
                                value={materials}
                                onChange={(e) => setMaterials(e.target.value)}
                                placeholder="e.g. Oil on canvas"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
                            />
                        </div>

                        {error && (
                            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: submitting ? '#ccc' : '#111',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: submitting ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {submitting ? 'Submitting...' : 'Submit for Review'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default SubmissionForm;
