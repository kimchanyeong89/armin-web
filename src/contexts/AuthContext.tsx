import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "../firebase";

interface AuthContextProps {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextProps>({ user: null, loading: true });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const enableAnonAuth = import.meta.env.VITE_ENABLE_ANON_AUTH === "true";
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [attemptedAnon, setAttemptedAnon] = useState(() => !enableAnonAuth);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("AuthContext.tsx: currentUser ->", currentUser);
      setUser(currentUser);
      if (!currentUser && enableAnonAuth && !attemptedAnon) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.warn(
            "Anonymous sign-in failed (enable in Firebase Console > Authentication or disable via VITE_ENABLE_ANON_AUTH)",
            e
          );
        } finally {
          setAttemptedAnon(true);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [attemptedAnon, enableAnonAuth]);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);