import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { SHOW_PUBLIC_COLLECTIONS } from "../config/features";

// 개인정보처리방침·이용약관·지원. 스토어 심사가 요구하는 세 페이지라 껍데기는 같고 글만 다르다.
// 앱 안에서도 열리므로 로그인 없이 보이고, 바깥 링크로 바로 들어와도 홈 인트로가 끼어들지 않는다.

export const CONTACT_EMAIL = "kietzland@gmail.com";

type Bi = { ko: string; en: string };
type Section = { id?: string; h: Bi; body: Bi[] };
type Doc = { title: Bi; updated: Bi; intro: Bi; sections: Section[] };

export type PolicyDocId = "privacy" | "terms" | "support";

const DOCS: Record<PolicyDocId, Doc> = {
  privacy: {
    title: { ko: "개인정보처리방침", en: "Privacy Policy" },
    updated: { ko: "시행일 2026년 9월 20일 · 개정 2026년 9월 25일(4항 웹사이트 광고 추가, 2026년 10월 2일 시행)", en: "Effective September 20, 2026 · Revised September 25, 2026 (section 4, ads on the website, effective October 2, 2026)" },
    intro: {
      ko: "콜리(COLLY)는 전시와 작품을 찾아보는 서비스입니다. 아래는 콜리가 어떤 정보를 받고, 어디에 쓰고, 언제 지우는지 적은 것입니다.",
      en: "COLLY helps you find exhibitions and artworks. This page explains what we receive, what we use it for, and when we delete it.",
    },
    sections: [
      {
        h: { ko: "1. 받는 정보", en: "1. What we collect" },
        body: [
          {
            ko: "· 계정 — 구글·애플·네이버로 로그인하면 그 서비스가 알려주는 이메일 주소, 이름이나 별명, 프로필 사진, 계정 식별자를 받습니다. 비밀번호는 받지 않습니다.",
            en: "· Account — when you sign in with Google, Apple, or Naver, we receive the email address, name or nickname, profile image, and account identifier that provider gives us. We never receive your password.",
          },
          {
            ko: "· 서비스 이용 기록 — 좋아한 작품, 저장한 큐레이션, 만든 플레이리스트, 장바구니, 커뮤니티에 올린 글과 댓글.",
            en: "· Activity — works you like, curations you save, playlists you build, your cart, and the posts and comments you write in the community.",
          },
          {
            ko: "· 결제 — 프린트 주문은 토스페이먼츠가 처리합니다. 카드번호와 계좌 정보는 콜리 서버를 거치지 않습니다.",
            en: "· Payments — print orders are processed by Toss Payments. Card and bank details never pass through COLLY's servers.",
          },
          {
            ko: "· 이용 통계 — 구글 파이어베이스 애널리틱스가 화면 이동 같은 이용 기록과 기기 종류, 국가 수준의 지역을 익명 식별자와 함께 모읍니다.",
            en: "· Usage statistics — Google Firebase Analytics collects screen views, device type, and country-level region under an anonymous identifier.",
          },
          {
            ko: "· 위치 — 가까운 전시를 거리순으로 보여줄 때만 씁니다. 기기가 알려준 좌표는 화면을 그리는 데만 쓰고 서버로 보내거나 저장하지 않습니다. 권한을 거절해도 나머지는 그대로 쓸 수 있습니다.",
            en: "· Location — used only to sort nearby exhibitions by distance. The coordinates stay on your device and are never sent to or stored on our servers. Declining the permission leaves everything else working.",
          },
        ],
      },
      {
        h: { ko: "2. 쓰는 곳", en: "2. How we use it" },
        body: [
          {
            ko: "로그인과 내 기록 동기화, 커뮤니티 운영과 신고 처리, 프린트 주문과 배송, 서비스 개선을 위한 통계에 씁니다. 이 정보를 광고에 쓰거나 다른 곳에 팔지 않습니다. 웹사이트에 나오는 광고는 4항에 적었습니다.",
            en: "To sign you in and sync your records, to run the community and handle reports, to fulfil print orders, and to improve the service. We do not use this information for advertising and we do not sell it. Ads shown on the website are described in section 4.",
          },
          ...(SHOW_PUBLIC_COLLECTIONS ? [{
            ko: "좋아한 작품과 만든 플레이리스트는 커뮤니티의 큐레이션 화면에서 누구나 볼 수 있습니다. 함께 보이는 것은 프로필 이름과 사진, 등급이고 이메일은 보이지 않습니다. 보이지 않게 하려면 마이페이지의 '내 컬렉션'에서 숨기면 됩니다.",
            en: "The works you like and the playlists you build can be seen by anyone on the community's Curation page, together with your profile name, photo and level; your email is never shown. To keep them to yourself, hide them from My collection on My Page.",
          }] : []),
        ],
      },
      {
        h: { ko: "3. 맡기는 곳", en: "3. Processors" },
        body: [
          {
            ko: "· 구글(Firebase Authentication·Firestore·Analytics) — 계정 인증, 데이터 보관, 이용 통계",
            en: "· Google (Firebase Authentication, Firestore, Analytics) — authentication, data storage, usage statistics",
          },
          { ko: "· 토스페이먼츠 — 결제 처리", en: "· Toss Payments — payment processing" },
          { ko: "· 구글(애드센스) — 웹사이트 광고 게재 (웹사이트 방문자만)", en: "· Google (AdSense) — ads on the website (website visitors only)" },
          { ko: "· 클라우드플레어 — 웹 서비스 전송", en: "· Cloudflare — web delivery" },
          {
            ko: "구글과 클라우드플레어의 서버는 미국을 비롯한 국외에 있을 수 있습니다. 서비스를 쓰는 데 필요한 범위에서만 맡기고, 맡긴 곳이 다른 목적으로 쓰지 못하게 합니다.",
            en: "Google's and Cloudflare's servers may be located outside Korea, including in the United States. We share only what the service needs and require processors not to use it for other purposes.",
          },
        ],
      },
      {
        h: { ko: "4. 웹사이트의 광고", en: "4. Ads on the website" },
        body: [
          {
            ko: "콜리 웹사이트(colly.one)에는 구글 애드센스 광고가 나옵니다. iOS·안드로이드 앱 안에는 나오지 않습니다.",
            en: "The COLLY website (colly.one) shows Google AdSense ads. They do not appear inside the iOS or Android app.",
          },
          {
            ko: "· 구글을 비롯한 제3자 광고 사업자는 쿠키를 써서, 이용자가 이 사이트와 다른 사이트를 방문한 기록을 바탕으로 광고를 보여 줍니다.",
            en: "· Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this website or other websites.",
          },
          {
            ko: "· 맞춤 광고는 구글 광고 설정(adssettings.google.com)에서 끌 수 있고, 다른 사업자의 맞춤 광고 쿠키는 aboutads.info/choices 에서 끌 수 있습니다.",
            en: "· You can opt out of personalized advertising in Google Ads Settings (adssettings.google.com), and of other vendors' personalized-ad cookies at aboutads.info/choices.",
          },
          {
            ko: "· 유럽경제지역·영국·스위스 방문자에게는 광고 쿠키를 쓰기 전에 동의를 먼저 묻습니다.",
            en: "· Visitors from the EEA, the UK, and Switzerland are asked for consent before ad cookies are used.",
          },
        ],
      },
      {
        h: { ko: "5. 보관과 파기", en: "5. Retention and deletion" },
        body: [
          {
            ko: "계정이 있는 동안 보관하고, 계정을 지우면 바로 지웁니다. 다만 전자상거래법이 요구하는 대금 결제와 계약 기록은 5년, 소비자 불만과 분쟁 처리 기록은 3년 동안 따로 보관합니다.",
            en: "We keep your data while your account exists and delete it as soon as you delete the account. Korean e-commerce law requires us to keep payment and contract records for 5 years and consumer complaint records for 3 years, stored separately.",
          },
          {
            ko: "지운 뒤에도 저장소의 복구용 백업에는 최대 30일 남았다가 사라집니다.",
            en: "After deletion, disaster-recovery backups may retain a copy for up to 30 days before it is purged.",
          },
        ],
      },
      {
        h: { ko: "6. 이용자의 권리", en: "6. Your rights" },
        body: [
          {
            ko: "내 정보를 보고 고치고 지울 수 있습니다. 계정 삭제는 마이페이지에서 계정 삭제를 고르면 됩니다. 지우면 위에 적은 기록이 함께 사라지고 되돌릴 수 없습니다.",
            en: "You can view, correct, and delete your information. Delete your account from My Page → Delete account. Deleting removes the records listed above and cannot be undone.",
          },
          {
            ko: "앱을 이미 지웠다면 웹(armin-web.pages.dev)에서 같은 계정으로 로그인해 지울 수 있습니다. 로그인이 안 되면 아래 메일로 알려 주세요.",
            en: "If you already removed the app, sign in with the same account on the web and delete it there. If you cannot sign in, email us at the address below.",
          },
        ],
      },
      {
        h: { ko: "7. 안전조치", en: "7. Safeguards" },
        body: [
          {
            ko: "통신 구간은 HTTPS로 암호화하고, 데이터베이스 보안 규칙으로 본인 기록에만 접근하게 막습니다.",
            en: "Traffic is encrypted with HTTPS, and database security rules restrict each account to its own records.",
          },
        ],
      },
      {
        h: { ko: "8. 만 14세 미만", en: "8. Children under 14" },
        body: [
          {
            ko: "만 14세 미만은 가입할 수 없고, 아동의 정보를 따로 모으지 않습니다. 만 14세 미만이 가입한 사실을 알게 되면 계정과 기록을 지웁니다.",
            en: "Children under 14 may not create an account, and we do not knowingly collect their information. If we learn that such an account exists, we delete it and its records.",
          },
        ],
      },
      {
        h: { ko: "9. 문의와 변경", en: "9. Contact and changes" },
        body: [
          {
            ko: `개인정보 보호책임자는 김찬영이고, 문의는 ${CONTACT_EMAIL} 로 받습니다.`,
            en: `Our privacy officer is Chanyeong Kim. Write to ${CONTACT_EMAIL}.`,
          },
          {
            ko: "방침이 바뀌면 이 페이지를 고치고 시행일을 새로 적습니다. 중요한 변경은 앱 안에서 알립니다.",
            en: "When this policy changes we update this page and its effective date. We announce material changes inside the app.",
          },
        ],
      },
    ],
  },

  terms: {
    title: { ko: "이용약관", en: "Terms of Service" },
    updated: { ko: "시행일 2026년 9월 20일", en: "Effective September 20, 2026" },
    intro: {
      ko: "콜리를 쓰는 데 필요한 약속입니다. 서비스에 로그인하면 이 약관에 동의한 것으로 봅니다.",
      en: "These are the rules for using COLLY. Signing in means you accept them.",
    },
    sections: [
      {
        h: { ko: "1. 계정", en: "1. Your account" },
        body: [
          {
            ko: "구글·애플·네이버 계정으로 로그인합니다. 만 14세 이상만 가입할 수 있고, 계정은 본인만 쓸 수 있습니다. 남에게 빌려주거나 넘길 수 없습니다.",
            en: "You sign in with a Google, Apple, or Naver account. You must be 14 or older, and your account is yours alone — you may not lend or transfer it.",
          },
          {
            ko: "언제든 마이페이지에서 계정을 지울 수 있습니다. 지우면 기록이 함께 사라집니다.",
            en: "You can delete your account any time from My Page. Deleting it removes your records with it.",
          },
        ],
      },
      {
        id: "ugc",
        h: { ko: "2. 커뮤니티에 올리는 글", en: "2. What you post" },
        body: [
          {
            ko: "전시를 보고 온 이야기, 작품에 대한 감상, 플레이리스트를 올릴 수 있습니다. 올린 글의 저작권은 쓴 사람에게 있고, 콜리는 서비스 안에서 보여주기 위해서만 씁니다.",
            en: "You can post what you saw, how a work felt, and the playlists you build. You keep the copyright; COLLY uses your post only to display it inside the service.",
          },
          {
            ko: "다음은 올릴 수 없습니다 — 욕설과 혐오 표현, 괴롭힘과 협박, 음란물과 폭력물, 남의 저작물 무단 게시, 다른 사람의 개인정보 노출, 사기·광고·스팸, 불법 행위를 부추기는 글.",
            en: "You may not post: abuse or hate speech, harassment or threats, sexual or violent content, other people's copyrighted work, other people's personal information, scams, ads or spam, or anything encouraging illegal acts.",
          },
          {
            ko: "불쾌한 글은 글 오른쪽 위의 신고를 눌러 알려 주세요. 사용자를 차단하면 그 사람의 글과 댓글이 더는 보이지 않습니다. 신고가 들어오면 24시간 안에 확인해 문제가 있는 글을 지우고, 반복하는 계정은 이용을 막습니다.",
            en: "Report anything objectionable with the report button at the top right of a post. Blocking a user hides their posts and comments from you. We review reports within 24 hours, remove violating content, and suspend accounts that repeat.",
          },
        ],
      },
      {
        h: { ko: "3. 전시와 작품 정보", en: "3. Exhibition and artwork information" },
        body: [
          {
            ko: "전시 정보는 미술관이 공개한 자료를 모아 보여줍니다. 기간과 휴관일, 관람료는 바뀔 수 있으니 방문 전에 미술관 공지를 확인하세요.",
            en: "Exhibition information is compiled from what museums publish. Dates, closures, and prices change, so check the museum's own notice before you go.",
          },
          {
            ko: "작품 이미지와 설명의 권리는 미술관·작가 등 권리자에게 있습니다. 개인 감상 범위를 넘어 복제하거나 배포할 수 없습니다.",
            en: "Artwork images and descriptions belong to museums, artists, and other rights holders. You may not copy or redistribute them beyond personal viewing.",
          },
        ],
      },
      {
        h: { ko: "4. 프린트 주문", en: "4. Print orders" },
        body: [
          {
            ko: "프린트는 주문을 받고 만드는 상품입니다. 결제는 토스페이먼츠를 통해 이루어집니다.",
            en: "Prints are made to order. Payment is handled by Toss Payments.",
          },
          {
            ko: "제작에 들어가기 전에는 취소할 수 있습니다. 받은 날부터 7일 안에 청약철회할 수 있고, 주문에 따라 개별 제작된 상품은 전자상거래법 제17조 제2항에 따라 철회가 제한될 수 있습니다. 불량이나 오배송은 기간과 상관없이 바꾸거나 돌려드립니다.",
            en: "You can cancel before production starts, and withdraw within 7 days of delivery. For items made individually to your order, withdrawal may be limited under Article 17(2) of the Korean E-Commerce Act. Defective or wrongly shipped items are replaced or refunded regardless of that period.",
          },
        ],
      },
      {
        h: { ko: "5. 서비스 변경과 이용 제한", en: "5. Changes and suspension" },
        body: [
          {
            ko: "기능을 고치거나 일부를 멈출 수 있고, 그럴 때는 미리 앱 안에서 알립니다. 약관을 어긴 글은 지우고, 반복하면 계정 이용을 막습니다.",
            en: "We may change or discontinue features, and we announce it in the app beforehand. We remove posts that break these terms and suspend accounts that repeat.",
          },
        ],
      },
      {
        h: { ko: "6. 책임", en: "6. Liability" },
        body: [
          {
            ko: "무료로 제공하는 전시 정보의 정확성은 보증하지 않습니다. 다만 콜리의 고의나 과실로 생긴 손해는 관련 법에 따라 책임집니다.",
            en: "We do not warrant the accuracy of the free exhibition information. We remain liable for damage caused by our own intent or negligence, as the law provides.",
          },
        ],
      },
      {
        h: { ko: "7. 준거법", en: "7. Governing law" },
        body: [
          {
            ko: `대한민국 법을 따릅니다. 문의는 ${CONTACT_EMAIL} 로 보내 주세요.`,
            en: `These terms are governed by the laws of the Republic of Korea. Write to ${CONTACT_EMAIL}.`,
          },
        ],
      },
    ],
  },

  support: {
    title: { ko: "지원", en: "Support" },
    updated: { ko: `문의 ${CONTACT_EMAIL}`, en: `Contact ${CONTACT_EMAIL}` },
    intro: {
      ko: "막히는 곳이 있으면 아래를 먼저 보고, 그래도 안 되면 메일로 알려 주세요. 평일 기준 이틀 안에 답장합니다.",
      en: "Check below first; if it still doesn't work, email us. We reply within two business days.",
    },
    sections: [
      {
        h: { ko: "로그인이 안 됩니다", en: "I can't sign in" },
        body: [
          {
            ko: "구글·애플·네이버 중 처음 가입할 때 쓴 것과 같은 방법으로 로그인해야 합니다. 같은 이메일이라도 방법이 다르면 다른 계정이 됩니다. 로그인 창이 열리자마자 닫힌다면 기기의 팝업 차단을 풀고 다시 시도해 주세요.",
            en: "Use the same provider you originally signed up with — Google, Apple, and Naver create separate accounts even with the same email address. If the sign-in window closes immediately, allow pop-ups on your device and try again.",
          },
        ],
      },
      {
        id: "delete",
        h: { ko: "계정을 지우고 싶습니다", en: "I want to delete my account" },
        body: [
          {
            ko: "앱이나 웹에서 로그인한 뒤 마이페이지로 가서 계정 삭제를 고르면 됩니다. 앱을 이미 지웠다면 웹에서 같은 계정으로 로그인해 지울 수 있습니다.",
            en: "Sign in on the app or the web, open My Page, and choose Delete account. If you already removed the app, sign in on the web with the same account and delete it there.",
          },
          {
            ko: "삭제하면 프로필과 좋아요, 저장한 큐레이션, 플레이리스트, 장바구니, 커뮤니티에 남긴 글과 댓글을 바로 지웁니다. 되돌릴 수 없습니다. 복구용 백업에는 최대 30일 남았다가 사라지고, 법이 보관을 요구하는 거래 기록은 따로 남습니다.",
            en: "Deleting removes your profile, likes, saved curations, playlists, cart, and community posts and comments right away. It cannot be undone. Backups keep a copy for up to 30 days, and payment records that the law requires us to keep are retained separately.",
          },
        ],
      },
      {
        h: { ko: "프린트 주문은 되나요", en: "Can I order a print?" },
        body: [
          {
            ko: "프린트 주문은 아직 열지 않았습니다. 결제와 배송 준비가 끝나면 앱에서 알려 드리겠습니다. 문의는 아래 메일로 받습니다.",
            en: "Print orders aren't open yet. We'll announce it in the app once payment and delivery are ready. Questions go to the email below.",
          },
        ],
      },
      {
        h: { ko: "전시 정보가 실제와 다릅니다", en: "The exhibition information looks wrong" },
        body: [
          {
            ko: "미술관이 공개한 자료를 모아 보여주다 보니 기간이 미뤄지거나 휴관일이 바뀌면 늦게 반영될 수 있습니다. 전시 화면의 버그 신고나 아래 메일로 알려 주시면 고치겠습니다.",
            en: "We compile what museums publish, so postponed dates or changed closures can take a while to appear. Tell us from the bug report button on an exhibition, or by email, and we'll fix it.",
          },
        ],
      },
      {
        h: { ko: "불쾌한 글을 봤습니다", en: "I saw something objectionable" },
        body: [
          {
            ko: "글 오른쪽 위의 신고를 눌러 주세요. 24시간 안에 확인해 지우거나 계정 이용을 막습니다. 특정 사용자를 차단하면 그 사람의 글과 댓글이 더는 보이지 않습니다.",
            en: "Use the report button at the top right of the post. We review it within 24 hours and remove the content or suspend the account. Blocking a user hides their posts and comments from you.",
          },
        ],
      },
      {
        h: { ko: "만든 곳", en: "Who made this" },
        body: [
          {
            ko: `콜리(COLLY) · 김찬영 · ${CONTACT_EMAIL}`,
            en: `COLLY · Chanyeong Kim · ${CONTACT_EMAIL}`,
          },
        ],
      },
    ],
  },
};

export default function PolicyPage({ doc }: { doc: PolicyDocId }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    try {
      return localStorage.getItem("homeTheme") === "light";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const syncTheme = () => {
      try {
        setIsLightTheme(localStorage.getItem("homeTheme") === "light");
      } catch {
        setIsLightTheme(false);
      }
    };
    window.addEventListener("theme-changed", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("theme-changed", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  // 링크로 바로 들어온 경우(#delete) 해당 항목으로 내린다.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: "start" });
  }, [doc]);

  const palette = isLightTheme
    ? { pageBg: "#f5f5f5", panelBg: "#ffffff", border: "rgba(0,0,0,0.09)", borderSoft: "rgba(0,0,0,0.06)", text: "#101010", textSub: "rgba(0,0,0,0.70)", textMute: "rgba(0,0,0,0.42)" }
    : { pageBg: "#050505", panelBg: "#111215", border: "rgba(255,255,255,0.12)", borderSoft: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.92)", textSub: "rgba(255,255,255,0.72)", textMute: "rgba(255,255,255,0.45)" };

  const d = DOCS[doc];

  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto", background: palette.pageBg }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "max(50px, calc(env(safe-area-inset-top) + 24px)) 18px 120px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <button
            onClick={() => navigate(-1)}
            aria-label={t({ ko: "뒤로", en: "Back" })}
            style={{
              cursor: "pointer",
              width: 36,
              height: 36,
              borderRadius: 999,
              border: `1px solid ${palette.border}`,
              background: palette.panelBg,
              color: palette.text,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: palette.textMute }}>COLLY</div>
            <h1 style={{ margin: "3px 0 0", fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 700, color: palette.text }}>{t(d.title)}</h1>
          </div>
        </div>

        <div style={{ fontSize: 12, color: palette.textMute, marginBottom: 10 }}>{t(d.updated)}</div>
        <p style={{ margin: "0 0 26px", fontSize: 14, lineHeight: 1.8, color: palette.textSub }}>{t(d.intro)}</p>

        {d.sections.map((section) => (
          <section
            key={section.h.en}
            id={section.id}
            style={{
              borderTop: `1px solid ${palette.borderSoft}`,
              paddingTop: 18,
              marginTop: 18,
              scrollMarginTop: 60,
            }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700, color: palette.text }}>{t(section.h)}</h2>
            {section.body.map((line) => (
              <p key={line.en} style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.85, color: palette.textSub, whiteSpace: "pre-line" }}>
                {t(line)}
              </p>
            ))}
          </section>
        ))}

        <div style={{ marginTop: 34, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: palette.textMute }}>
          <a href="/privacy" style={{ color: palette.textMute }}>{t({ ko: "개인정보처리방침", en: "Privacy" })}</a>
          <a href="/terms" style={{ color: palette.textMute }}>{t({ ko: "이용약관", en: "Terms" })}</a>
          <a href="/support" style={{ color: palette.textMute }}>{t({ ko: "지원", en: "Support" })}</a>
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: palette.textMute }}>{CONTACT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}
