import { useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import CurationPublishSheet from "../../../features/collectors/CurationPublishSheet";

/**
 * The Curation room's own door for the reader: one line and a circled gold
 * plus. It opens the sheet where they choose what of theirs goes on show.
 * Signed out, there is nothing of theirs to show, so it is not drawn.
 */
export default function CurationInvite({ ko }: { ko: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user || user.isAnonymous) return null;
  return (
    <>
      <button type="button" className="ca-invite" onClick={() => setOpen(true)}>
        <span className="ca-invite__mark" aria-hidden="true">+</span>
        <span className="ca-invite__text">
          <b>{ko ? "내 큐레이션 올리기" : "Put yours on Curation"}</b>
          <small>{ko ? "좋아요한 작품과 플레이리스트 중 보여 줄 것만 골라요" : "Choose which likes and playlists to show"}</small>
        </span>
      </button>
      {open && <CurationPublishSheet uid={user.uid} onClose={() => setOpen(false)} onChange={() => window.dispatchEvent(new Event("colly:curation"))} />}
    </>
  );
}
