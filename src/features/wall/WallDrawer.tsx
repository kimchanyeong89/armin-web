import { useEffect, useState } from "react";
import MyWall from "./MyWall";
import WallGrip from "./WallGrip";
import { setWallHeight, useWallHeight } from "./wallPull";
import "./myWall.css";

/* The wall, on every page. It is pulled up from the tab bar by the handle
   that stands on the bar (BottomPageNavigator's `grip`); once out, the handle
   rides the wall's top edge. It stays as far out as it was pulled, so the
   page above it can still be browsed and any of its pictures picked up and hung. */

export default function WallDrawer({ uid, ko, compact }: { uid: string; ko: boolean; compact: boolean }) {
  const height = useWallHeight();
  /* the tab bar keeps its place over the sheet's foot */
  const [barSpace, setBarSpace] = useState(0);
  useEffect(() => {
    if (height === 0) return;
    const measure = () => {
      const bar = document.querySelector<HTMLElement>(".bpn");
      setBarSpace(bar ? Math.max(0, window.innerHeight - bar.getBoundingClientRect().top) : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [height > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  /* signing out unmounts the drawer; it opens closed next time */
  useEffect(() => () => setWallHeight(0), []);

  if (height === 0) return null;
  return (
    /* the sheet runs down to the screen's foot, under the tab bar, so nothing
       of the page shows round the bar; its own content stops above the bar */
    <div className="wall-drawer" style={{ height: height + barSpace, paddingBottom: barSpace }}>
      {/* the handle rides the wall's top edge while it is out */}
      <WallGrip ko={ko} place="sheet" />
      <MyWall uid={uid} ko={ko} compact={compact || height < 420} onClose={() => setWallHeight(0)} />
    </div>
  );
}
