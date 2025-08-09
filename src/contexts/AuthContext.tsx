import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "../firebase";

interface AuthContextProps {
  user: User | null;
}

const AuthContext = createContext<AuthContextProps>({ user: null });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [attemptedAnon, setAttemptedAnon] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("AuthContext.tsx: currentUser ->", currentUser);
      setUser(currentUser);
      if (!currentUser && !attemptedAnon) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.warn("Anonymous sign-in failed (enable in Firebase Console > Authentication)", e);
        } finally {
          setAttemptedAnon(true);
        }
      }
    });
    return () => unsubscribe();
  }, [attemptedAnon]);

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);