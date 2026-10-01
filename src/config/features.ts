// Master switches for optional UI surfaces.
//
// SHOW_SALES_UI — controls every commerce / "for sale" affordance:
//   • the "buy as product" (ShoppingBag) buttons that open ProductModal,
//     wherever they appear (artwork cards, search results, detail modals, MyPage)
//   • the floating Cart icon + cart entry in the app shell
//
// Set to `false` to hide the sales purpose entirely; flip to `true` to bring
// the whole purchase flow back. The ProductModal / cart pages themselves are
// left mounted — only their entry points are gated — so re-enabling is a
// one-line change with no other wiring.
export const SHOW_SALES_UI = false;

// APPLE_SIGNIN_READY — whether "Continue with Apple" can finish. Apple is not
// yet turned on in Firebase Authentication (only Google is, as of 2026-09-29),
// so the sign-in fails half-way and throws the member back out. While false,
// the button explains that instead of starting. Flip to `true` once Apple is
// set up in Firebase (Services ID, Team ID, key) - nothing else to change.
export const APPLE_SIGNIN_READY = false;

// SHOW_PUBLIC_COLLECTIONS — anyone may browse other people's liked works and
// playlists (/community/u/:uid). It needs the firestore.rules that open
// users/{uid}/liked_artworks and playlists to be deployed first; until then
// the shelf, the links to it and the privacy-policy paragraph stay hidden.
// Those rules went live on 2026-10-01; set back to `false` to hide it again.
export const SHOW_PUBLIC_COLLECTIONS = true;
