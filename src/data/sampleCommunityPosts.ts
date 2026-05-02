export interface SampleCommunityPost {
  id: string;
  title: string;
  category: string;
  isSample: true;
  authorId?: string;
  authorName: string;
  authorPhotoURL?: string | null;
  authorRank?: string;
  createdAt: Date;
  likes: number;
  commentCount: number;
  contentSnippet: string;
  content: string;
  isHtml: boolean;
  header: { id: string; type: string; name: string; image?: string };
}

const HOUR = 1000 * 60 * 60;

export const SAMPLE_COMMUNITY_POSTS: SampleCommunityPost[] = [
  {
    id: "sample-news-1",
    title: "이번 주 전시 오픈 소식 모음",
    category: "뉴스",
    isSample: true,
    authorName: "Armin Team",
    authorRank: "Lv.3 Collector",
    authorPhotoURL: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80",
    createdAt: new Date(Date.now() - HOUR * 0.87),
    likes: 14,
    commentCount: 3,
    contentSnippet: "주말 기준 새롭게 시작하는 주요 전시와 운영 시간 변경 사항을 정리했습니다.",
    isHtml: true,
    content: `
      <p>주말부터 새롭게 시작하는 전시와 운영 시간이 변경된 미술관을 한눈에 정리했습니다.</p>
      <h3>이번 주 신규 오픈</h3>
      <ul>
        <li><strong>국립현대미술관 서울</strong> — 동시대 사진 특별전 개막</li>
        <li><strong>리움미술관</strong> — 한국 단색화 회고전 2부</li>
        <li><strong>아모레퍼시픽미술관</strong> — 신진 작가 소장품 공개</li>
      </ul>
      <h3>운영 시간 변경</h3>
      <p>여러 미술관이 봄 시즌 운영 시간을 조정했습니다. 방문 전 공식 채널을 확인해 주세요.</p>
      <p>관람 후기는 댓글로 자유롭게 공유해 주세요.</p>
    `,
    header: { id: "sample", type: "exhibition", name: "Weekly Roundup" },
  },
  {
    id: "sample-discussion-1",
    title: "요즘 가장 인상적인 작품 연출은?",
    category: "토론",
    isSample: true,
    authorName: "Gallery Hopper",
    authorRank: "Lv.2 Seeker",
    authorPhotoURL: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80",
    createdAt: new Date(Date.now() - HOUR * 3),
    likes: 9,
    commentCount: 11,
    contentSnippet: "조명, 동선, 사운드까지 포함해서 전시 연출을 평가해보는 스레드입니다.",
    isHtml: true,
    content: `
      <p>최근 본 전시 중 가장 연출이 인상적이었던 곳을 공유해 보아요.</p>
      <p>저는 조명이 작품 자체보다 공간을 먼저 보게 만드는 곳이 가장 기억에 남았습니다. 사운드 디자인까지 포함해서 평가해보면 어떨까요?</p>
      <ul>
        <li>조명: 자연광 vs. 인공광</li>
        <li>동선: 자유 동선 vs. 강제 동선</li>
        <li>사운드: 무음 vs. 음향 설치</li>
      </ul>
      <p>각자 인상 깊었던 사례 댓글로 남겨주세요.</p>
    `,
    header: { id: "sample", type: "exhibition", name: "Discussion" },
  },
  {
    id: "sample-interview-1",
    title: "큐레이터 인터뷰: 작품 옆 텍스트, 어디까지 필요한가",
    category: "인터뷰",
    isSample: true,
    authorName: "Editor Min",
    authorRank: "Lv.4 Curator",
    authorPhotoURL: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&q=80",
    createdAt: new Date(Date.now() - HOUR * 7),
    likes: 22,
    commentCount: 2,
    contentSnippet: "현장 큐레이터에게 전시 텍스트의 역할과 관람 리듬에 대해 물었습니다.",
    isHtml: true,
    content: `
      <p>전시장에서 작품 옆에 놓인 캡션 텍스트는 어디까지 설명해야 할까요? 현장 큐레이터 두 분께 물었습니다.</p>
      <h3>관람 리듬을 깨지 않는 길이</h3>
      <p>"3문장 이상이 되면 관객은 작품 대신 텍스트를 먼저 봅니다. 가능한 한 짧게 가는 편을 선호합니다."</p>
      <h3>작품마다 다르게 설계</h3>
      <p>"역사적 맥락이 필요한 작품에는 별도 라벨을, 직관적으로 와닿는 작품에는 제목과 연도만 두는 방식을 씁니다."</p>
      <p>전시 캡션에 대한 여러분의 경험도 댓글로 들려주세요.</p>
    `,
    header: { id: "sample", type: "exhibition", name: "Interview" },
  },
  {
    id: "sample-notice-1",
    title: "커뮤니티 작성 가이드 업데이트",
    category: "소식",
    isSample: true,
    authorName: "Community Bot",
    authorRank: "Lv.5 Gallerist",
    authorPhotoURL: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=80",
    createdAt: new Date(Date.now() - HOUR * 10),
    likes: 5,
    commentCount: 0,
    contentSnippet: "카테고리/태그 기준과 이미지 첨부 규칙이 업데이트되었습니다.",
    isHtml: true,
    content: `
      <p>커뮤니티 작성 가이드가 업데이트되었습니다. 주요 변경 사항을 안내드립니다.</p>
      <h3>카테고리 기준</h3>
      <ul>
        <li><strong>리뷰</strong> — 직접 관람한 전시/작품에 대한 감상</li>
        <li><strong>뉴스</strong> — 공식 발표 또는 보도된 사실</li>
        <li><strong>토론</strong> — 의견을 모으거나 질문하는 글</li>
        <li><strong>인터뷰</strong> — 작가, 큐레이터, 기획자와의 대화</li>
      </ul>
      <h3>이미지 첨부 규칙</h3>
      <p>저작권을 고려해 본인이 촬영한 사진 또는 사용 허가된 이미지를 우선 사용해 주세요.</p>
      <p>변경 사항에 대한 의견은 댓글로 남겨주세요.</p>
    `,
    header: { id: "sample", type: "exhibition", name: "Notice" },
  },
  {
    id: "sample-question-1",
    title: "전시 러닝타임 긴 곳, 동선 팁 있을까요?",
    category: "질문",
    isSample: true,
    authorName: "New Visitor",
    authorRank: "Lv.1 Observer",
    authorPhotoURL: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&q=80",
    createdAt: new Date(Date.now() - HOUR * 15),
    likes: 3,
    commentCount: 6,
    contentSnippet: "반나절 이상 걸리는 전시를 효율적으로 보는 방법이 궁금합니다.",
    isHtml: true,
    content: `
      <p>대형 회고전이나 비엔날레처럼 반나절 이상 걸리는 전시를 효율적으로 보려면 어떻게 해야 할까요?</p>
      <p>저는 처음 가는 곳에서 항상 시간 배분에 실패합니다. 도록을 먼저 사야 하는지, 오디오 가이드는 빌리는 게 좋은지, 처음부터 메모를 해야 하는지 등 팁이 있다면 공유 부탁드립니다.</p>
      <p>특히 다음 사항이 궁금합니다:</p>
      <ul>
        <li>휴식 타이밍을 언제 잡아야 하는지</li>
        <li>도슨트 투어를 먼저 들어야 하는지 마지막에 들어야 하는지</li>
        <li>사진 촬영 vs. 메모 — 어떤 방식이 더 도움이 되는지</li>
      </ul>
    `,
    header: { id: "sample", type: "exhibition", name: "Question" },
  },
];

export function getSampleCommunityPost(id: string | undefined | null): SampleCommunityPost | null {
  if (!id) return null;
  return SAMPLE_COMMUNITY_POSTS.find((post) => post.id === id) || null;
}

export function isSampleCommunityPostId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith("sample-");
}
