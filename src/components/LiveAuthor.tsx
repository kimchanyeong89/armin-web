import React, { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import ProfileAvatar from "./ProfileAvatar";

const profileCache: Record<string, { name: string; photo: string; rank: string; crop: any } | null> = {};

export const useLiveAuthor = (uid?: string, fallbackName?: string, fallbackPhoto?: string) => {
  const [profile, setProfile] = useState<{ name: string; photo: string; rank: string; crop: any } | null>(
    uid ? profileCache[uid] || null : null
  );

  useEffect(() => {
    if (!uid) return;
    if (profileCache[uid]) {
      setProfile(profileCache[uid]);
    }

    const unlisten = onSnapshot(doc(db, "users", uid), (snap) => {
      if (!snap.exists()) return;

      const data = snap.data();
      const newProfile = {
        name: data.displayName || data.name || fallbackName || "Unknown",
        photo: data.photoURL || data.profileImage || fallbackPhoto || "",
        rank: data.rank || "",
        crop: data.profileImageCrop || null,
      };

      profileCache[uid] = newProfile;
      setProfile(newProfile);
    });

    return () => unlisten();
  }, [uid, fallbackName, fallbackPhoto]);

  return profile || { name: fallbackName || "Unknown", photo: fallbackPhoto || "", rank: "", crop: null };
};

export const LiveAvatar = ({ uid, fallbackName, fallbackPhoto, size = 32, style = {} }: { uid?: string, fallbackName?: string, fallbackPhoto?: string, size?: number, style?: React.CSSProperties }) => {
  const profile = useLiveAuthor(uid, fallbackName, fallbackPhoto);
  
  return (
    <div style={style}>
      <ProfileAvatar
        src={profile.photo || fallbackPhoto}
        crop={profile.crop}
        size={size}
        alt={profile.name || fallbackName || "Profile"}
        fallback={<span style={{ color: "#000", fontWeight: 700, fontSize: size * 0.4 }}>{(profile.name || fallbackName || "A").slice(0, 1).toUpperCase()}</span>}
      />
    </div>
  );
};

export const LiveName = ({ uid, fallbackName, style = {} }: { uid?: string, fallbackName?: string, style?: React.CSSProperties }) => {
  const profile = useLiveAuthor(uid, fallbackName);
  return <span style={style}>{profile.name || fallbackName || "Unknown"}</span>;
};
