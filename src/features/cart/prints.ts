// 프린트 주문 스위치. 지금은 닫아 둔다 —
// 운영 결제 키(VITE_TOSS_CLIENT_KEY·TOSS_SECRET_KEY)가 없어서 실제로 결제되지 않고,
// 배송지를 받는 화면도 없어서 주문을 보낼 수 없다. 둘이 준비되면 이 값만 true 로 바꾼다.
export const PRINTS_ENABLED = false;

export const PRINTS_NOTICE = {
  ko: "프린트 주문은 준비 중입니다. 준비되면 앱에서 알려 드리겠습니다.",
  en: "Print orders aren't open yet. We'll let you know in the app when they are.",
};
