import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';

export const LoginButton: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        let mounted = true;
        const unsub = onAuthStateChanged(auth, (u) => {
            if (mounted) setUser(u);
        });
        return () => {
            mounted = false;
            unsub();
        };
    }, []);

    const handleLogin = async () => {
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Login failed", error);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
    };

    const [showDropdown, setShowDropdown] = useState(false);

    if (!user) {
        return (
            <button
                onClick={handleLogin}
                style={{
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    color: '#333',
                    fontFamily: 'inherit',
                    textTransform: 'lowercase',
                    letterSpacing: 0.4,
                    padding: 0,
                    ...style
                }}
            >
                login
            </button>
        );
    }

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...style }}>
            <div
                onClick={() => setShowDropdown(!showDropdown)}
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
            >
                {user.photoURL ? (
                    <img
                        src={user.photoURL}
                        alt="Profile"
                        style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid #ddd' }}
                    />
                ) : (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                        {user.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                )}
            </div>

            {showDropdown && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 8,
                    background: '#fff',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                    borderRadius: 8,
                    padding: '8px 0',
                    zIndex: 1000,
                    minWidth: 100
                }}>
                    <button
                        onClick={handleLogout}
                        style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 16px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 12,
                            color: '#333',
                            fontWeight: 600
                        }}
                    >
                        Logout
                    </button>
                </div>
            )}
        </div>
    );
};
