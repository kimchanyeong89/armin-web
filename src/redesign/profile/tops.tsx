import { ArrowRight } from "lucide-react";
import { Meta, two } from "../artwork-detail/shared";
import { ME, PLAYLISTS, TABS } from "./model";
import {
  Avatar, Caption, Cover, CoverPicker, Edit, Email, Name, Playlists, Score, Slideshow, TabsBar, type TopProps,
} from "./parts";

/* The five arrangements. Every one carries the same parts — the cover and
   its background control, the avatar, the name with its level and guide, the
   email, the score, editing, the slideshow, My Playlists, the six counted
   tabs and the sort — and each takes its layout from one of the app's tabs. */

const account = (ko: boolean) => [<Email key="email" />, <Score key="score" ko={ko} />];
const listCount = two(PLAYLISTS.length);

/**
 * A · the artist page's band. Two columns as the artist page sets its header:
 * on the left, who — a gold eyebrow, the avatar with the name and its level,
 * the account on a ticked line, the two actions — and under it My Playlists
 * on a caption rule, where the artist page keeps its Wikipedia text. The
 * cover takes the right-hand column as the map and carousel do there, its
 * background control in the caption's end slot. The tabs keep the live shape.
 */
export function BandTop(p: TopProps) {
  const { ko } = p;
  return (
    <>
      <section className="pf-a">
        <div className="pf-a__who">
          <p className="pf-eyebrow">{ko ? "마이페이지" : "MY PAGE"}</p>
          <div className="pf-a__id">
            <Avatar size={64} />
            <Name size={26} />
          </div>
          <Meta className="pf-meta" parts={account(ko)} />
          <div className="pf-actions"><Slideshow ko={ko} /><Edit ko={ko} /></div>
        </div>
        <div className="pf-a__lists">
          <Caption label={ko ? "플레이리스트" : "My Playlists"} count={listCount} />
          <Playlists ko={ko} works={p.works} openList={p.openList} openPlaylist={p.openPlaylist} />
        </div>
        <figure className="pf-a__cover">
          <Caption label={ko ? "커버" : "Cover"}
            end={<CoverPicker ko={ko} works={p.works} cover={p.cover} setCover={p.setCover} />} />
          <Cover works={p.works} cover={p.cover} />
        </figure>
      </section>
      <TabsBar {...p} />
    </>
  );
}

/**
 * B · the globe's stage. The cover fills a dark field the way the globe fills
 * the map tab, turned down so the words read over it. Between two hairlines at
 * the top sit the collection's totals, as the map sets its own, and the
 * background control stands where KO | EN does. The owner stands on the left
 * like the reading guide, and the bottom-left corner holds My Playlists on a
 * gold point and a drawn line, as the map holds its live exhibitions; the
 * playlists follow under the stage.
 */
export function StageTop(p: TopProps) {
  const { ko } = p;
  const [works, , museums] = TABS;
  const toLists = () => document.getElementById("pf-lists")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <>
      <section className="pf-b">
        <Cover works={p.works} cover={p.cover} className="pf-b__cover" />
        <p className="pf-b__strip">
          <i aria-hidden="true" />
          <span><b>{works.count.toLocaleString()}</b>{ko ? works.ko : works.en}</span>
          <span><b>{museums.count.toLocaleString()}</b>{ko ? museums.ko : museums.en}</span>
          <i aria-hidden="true" />
        </p>
        <div className="pf-b__picker">
          <CoverPicker ko={ko} works={p.works} cover={p.cover} setCover={p.setCover} />
        </div>
        <div className="pf-b__who">
          <Avatar size={56} />
          <p className="pf-eyebrow">{ko ? "마이페이지" : "MY PAGE"}</p>
          <Name size={30} className="pf-b__name" />
          <Meta className="pf-meta" parts={account(ko)} />
          <div className="pf-actions"><Edit ko={ko} /></div>
        </div>
        {/* where the picture meets the page: the playlists on the left, the
            slideshow on the right, as the map keeps its own corners */}
        <div className="pf-b__foot">
          <button type="button" className="pf-b__line" onClick={toLists}>
            <i className="pf-dot" aria-hidden="true" />
            <span>{ko ? "플레이리스트" : "My Playlists"}</span>
            <b>{listCount}</b>
            <u aria-hidden="true" />
            <ArrowRight size={13} strokeWidth={2} aria-hidden="true" />
          </button>
          <Slideshow ko={ko} />
        </div>
      </section>
      <div className="pf-b__lists" id="pf-lists">
        <Playlists ko={ko} works={p.works} openList={p.openList} openPlaylist={p.openPlaylist} />
      </div>
      <TabsBar {...p} variant="fill" />
    </>
  );
}

/**
 * C · the AI tab. One left-aligned statement as the AI tab opens: a gold
 * eyebrow, the avatar and the name set large with its level, the account as
 * the lede, and the two actions in the tab's circled-mark footer. The cover
 * stands beside it as a plate carrying its background control. My Playlists
 * follow on a caption rule, and the counted tabs with the sort ride one
 * sticky line where the AI tab keeps its switch.
 */
export function StatementTop(p: TopProps) {
  const { ko } = p;
  return (
    <>
      <section className="pf-c">
        <div className="pf-c__statement">
          <p className="pf-eyebrow">{ko ? "마이페이지" : "MY PAGE"}</p>
          <div className="pf-c__id">
            <Avatar size={52} />
            <Name size={30} className="pf-c__name" />
          </div>
          <p className="pf-c__lede"><Email /><span aria-hidden="true"> · </span><Score ko={ko} /></p>
          <footer className="pf-actions"><Slideshow ko={ko} /><Edit ko={ko} /></footer>
        </div>
        <figure className="pf-c__cover">
          <Cover works={p.works} cover={p.cover} />
          <div className="pf-c__picker">
            <CoverPicker ko={ko} works={p.works} cover={p.cover} setCover={p.setCover} />
          </div>
        </figure>
      </section>
      <section className="pf-c__lists">
        <Caption label={ko ? "플레이리스트" : "My Playlists"} count={listCount} />
        <Playlists ko={ko} works={p.works} openList={p.openList} openPlaylist={p.openPlaylist} />
      </section>
      <TabsBar {...p} variant="line" />
    </>
  );
}

/**
 * D · the community board. The page's name set large on the left, with the
 * board's text actions on the right; the cover runs as a band under it. The
 * owner reads as one of the board's ruled rows — avatar, name with level,
 * email, score, playlists — under a line of mono column heads, and My
 * Playlists are rows of their own. The counted tabs are the board's targets,
 * the sort beside them.
 */
export function BoardTop(p: TopProps) {
  const { ko } = p;
  return (
    <>
      <section className="pf-d">
        <div className="pf-d__lead">
          <h1>{ko ? "마이페이지" : "My Page"}</h1>
          <div className="pf-d__acts">
            <Slideshow ko={ko} variant="act" />
            <Edit ko={ko} />
            <CoverPicker ko={ko} works={p.works} cover={p.cover} setCover={p.setCover} />
          </div>
        </div>
        <Cover works={p.works} cover={p.cover} className="pf-d__cover" />
        <div className="pf-d__cols" aria-hidden="true">
          <span />
          <span>{ko ? "이름" : "NAME"}</span>
          <span>{ko ? "이메일" : "EMAIL"}</span>
          <span>{ko ? "점수" : "SCORE"}</span>
          <span>{ko ? "플레이리스트" : "PLAYLISTS"}</span>
        </div>
        <div className="pf-d__row">
          <Avatar size={44} />
          <Name size={18} as="h2" />
          <span className="pf-d__email"><Email /></span>
          <span className="pf-d__num"><span className="pf-d__label">{ko ? "점수" : "Score"}</span>{ME.score.toLocaleString()}</span>
          <span className="pf-d__num"><span className="pf-d__label">{ko ? "플레이리스트" : "Playlists"}</span>{listCount}</span>
        </div>
        <Playlists ko={ko} works={p.works} openList={p.openList} openPlaylist={p.openPlaylist} variant="rows" />
      </section>
      <TabsBar {...p} variant="line" />
    </>
  );
}

/**
 * E · the map's city panel. A solid column down the left, as wide as the
 * guide column and edged in gold: the page's name and the background control
 * along its top where the panel keeps its way back and way out, then the owner
 * — avatar, name with level, the account on a mono line — the two actions,
 * and My Playlists as the panel's list rows. The cover fills the stage beside
 * it, where the globe stands. The tabs keep the live shape.
 */
export function PanelTop(p: TopProps) {
  const { ko } = p;
  return (
    <>
      <section className="pf-e">
        <aside className="pf-e__panel">
          <nav className="pf-e__top">
            <span className="pf-e__crumb">{ko ? "마이페이지" : "MY PAGE"}</span>
            <CoverPicker ko={ko} works={p.works} cover={p.cover} setCover={p.setCover} />
          </nav>
          <div className="pf-e__id">
            <Avatar size={56} />
            <div className="pf-e__who">
              <Name size={22} />
              <Meta className="pf-meta" parts={account(ko)} />
            </div>
          </div>
          <div className="pf-actions"><Slideshow ko={ko} /><Edit ko={ko} /></div>
          <div className="pf-e__lists">
            <Caption label={ko ? "플레이리스트" : "My Playlists"} count={listCount} />
            <Playlists ko={ko} works={p.works} openList={p.openList} openPlaylist={p.openPlaylist} variant="rows" />
          </div>
        </aside>
        <Cover works={p.works} cover={p.cover} className="pf-e__stage" />
      </section>
      <TabsBar {...p} />
    </>
  );
}
