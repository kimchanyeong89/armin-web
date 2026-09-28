import { useEffect, useState } from "react";
import MyWall from "./MyWall";
import WallGrip from "./WallGrip";
import { setWallHeight, useWallHeight } from "./wallPull";
import "./myWall.css";

/* The wall, on every page. A desktop pulls it down from the top by its
   handle, a phone pulls it up from the tab bar (the handle lives on the bar,
   see BottomPageNavigator's `grip`). It stays as far out as it was pulled, so
   the page under it can still be browsed and its pictures dragged onto it. */
/* the phone's handle stands this tall on the tab bar; the sheet starts above it */
const GRIP_HEIGHT = 23;

export default function WallDrawer({ uid, ko, mobile }: { uid: string; ko: boolean; mobile: boolean }) {
  const height = useWallHeight();
  /* on a phone the sheet stands on the tab bar, which keeps its place over it */
  const [barSpace, setBarSpace] = useState(0);
  useEffect(() => {
    if (!mobile || height === 0) return;
    const measure = () => {
      const bar = document.querySelector<HTMLElement>(".bpn");
      setBarSpace(bar ? Math.max(0, window.innerHeight - bar.getBoundingClientRect().top) : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [mobile, height > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  /* signing out unmounts the drawer; it opens closed next time */
  useEffect(() => () => setWallHeight(0), []);

  return (
    <>
      {height > 0 && (
        <div
          className={`wall-drawer wall-drawer--${mobile ? "bottom" : "top"}`}
          style={mobile ? { height, bottom: barSpace + GRIP_HEIGHT } : { height }}
        >
          <MyWall uid={uid} ko={ko} compact={mobile || height < 420} pageDrops={!mobile} onClose={() => setWallHeight(0)} />
        </div>
      )}
      {!mobile && (
        <div className="wall-grip-hang" style={{ top: height }}>
          <WallGrip edge="top" ko={ko} />
        </div>
      )}
    </>
  );
}
