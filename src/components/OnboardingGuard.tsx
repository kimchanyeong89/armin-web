
import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

export const OnboardingGuard = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (loading || !user) return;

        // Allow access to onboarding, login callback
        if (location.pathname === '/onboarding' || location.pathname === '/login/callback' || location.pathname === '/login') return;

        // Check if we already validated this session to avoid redundant Firestore reads
        const cached = sessionStorage.getItem(`onboarded_${user.uid}`);
        if (cached === 'true') return;

        // Bypass check removed to restore enforcement

        const checkOnboarding = async () => {
            try {
                const db = getFirestore();
                const ref = doc(db, 'users', user.uid);
                const snap = await getDoc(ref);

                // If user doc missing, or not marked onboarded, OR missing critical info like birthDate
                const data = snap.data();
                if (!snap.exists() || !data?.isOnboarded || !data?.birthDate) {
                    // If we are redirecting, clear the session cache so we re-check next time (until they complete it)
                    sessionStorage.removeItem(`onboarded_${user.uid}`);
                    navigate('/onboarding');
                } else {
                    // Mark as validated for session
                    sessionStorage.setItem(`onboarded_${user.uid}`, 'true');
                }
            } catch (e) {
                console.error('Onboarding check failed', e);
            }
        };

        checkOnboarding();
    }, [user, loading, location.pathname, navigate]); // This still runs on nav change, but cached check prevents Firestore hit

    return null;
};
