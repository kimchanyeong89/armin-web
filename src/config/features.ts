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
