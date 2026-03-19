
import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import ArtworkSelector from "./ArtworkSelector";

interface ProfileEditModalProps {
    onClose: () => void;
    onUpdate: () => void;
    initialData: {
        nickname: string;
        birthDate: string;
        photoURL: string;
    };
}

const ProfileEditModal: React.FC<ProfileEditModalProps> = ({ onClose, onUpdate, initialData }) => {
    const { user } = useAuth();
    const [nickname, setNickname] = useState(initialData.nickname || "");
    const [birthDate, setBirthDate] = useState(initialData.birthDate || "");
    const [selectedImage, setSelectedImage] = useState<string | null>(initialData.photoURL || null);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<'info' | 'image'>('info');

    const handleSave = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const db = getFirestore();
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, {
                nickname,
                birthDate,
                photoURL: selectedImage
            });
            onUpdate();
            onClose();
        } catch (e) {
            console.error(e);
            alert("Error saving profile");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 6000
        }} onClick={onClose}>
            <div style={{
                background: 'white',
                padding: '24px',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '500px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
            }} onClick={e => e.stopPropagation()}>
                <h2 style={{ marginBottom: 20, fontSize: 20, fontWeight: 'bold' }}>프로필 수정</h2>

                {mode === 'info' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Image Preview */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                            <div
                                onClick={() => setMode('image')}
                                style={{
                                    width: 100,
                                    height: 100,
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    border: '2px solid #333',
                                    cursor: 'pointer',
                                    position: 'relative'
                                }}>
                                <img src={selectedImage || user?.photoURL || ''} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <div style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)',
                                    color: 'white', fontSize: 10, textAlign: 'center', padding: 4
                                }}>변경</div>
                            </div>
                        </div>

                        <div>
                            <label style={{ display: "block", marginBottom: 6, fontWeight: "bold", fontSize: 14 }}>닉네임</label>
                            <input
                                type="text"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid #ddd" }}
                            />
                        </div>

                        <div>
                            <label style={{ display: "block", marginBottom: 6, fontWeight: "bold", fontSize: 14 }}>생년월일</label>
                            <input
                                type="date"
                                value={birthDate}
                                onChange={(e) => setBirthDate(e.target.value)}
                                style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid #ddd" }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                style={{ flex: 1, padding: 12, background: 'black', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                            >
                                {loading ? '저장 중...' : '저장'}
                            </button>
                            <button
                                onClick={onClose}
                                style={{ flex: 1, padding: 12, background: '#eee', color: 'black', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                            >
                                취소
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 'bold', margin: 0 }}>프로필 이미지 선택</h3>
                            <button onClick={() => setMode('info')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
                                Close
                            </button>
                        </div>
                        <ArtworkSelector onSelect={(url) => { setSelectedImage(url); setMode('info'); }} selectedImage={selectedImage} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfileEditModal;
