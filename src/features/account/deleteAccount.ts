// 계정 삭제. 애플과 구글이 앱 안에서 지울 수 있기를 요구하고,
// 개인정보처리방침에 적은 대로 흩어진 기록까지 같이 지운다.
//
// 서버가 없으니 로그인한 본인이 직접 지운다. 보안 규칙이 본인 문서만
// 허용하므로 남의 기록은 손대지 않는다. 남이 내 글에 단 댓글처럼
// 규칙이 막는 것은 지우지 못하고 넘어간다.
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type CollectionReference,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  type User,
} from "firebase/auth";
import { auth, db } from "../../firebase";
import { isMobileAppContainer } from "../../utils/mobileAppAuth";

/** users/{uid} 아래에서 목록으로 지울 수 있는 것들. playlists 는 하위가 있어 따로 돈다. */
const USER_SUBCOLLECTIONS = [
  "liked_artworks", "liked_artists", "liked_exhibitions", "liked_museums",
  "saved_curations", "cart", "counters", "profile", "private", "blocked",
];

async function wipe(source: Query<DocumentData> | CollectionReference<DocumentData>): Promise<void> {
  const snapshot = await getDocs(source);
  // 규칙이 막는 문서(남이 쓴 댓글 등)는 건너뛴다. 하나 때문에 전체가 멈추면 안 된다.
  await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref).catch(() => undefined)));
}

/* 한 단계가 실패해도(예: 여러 사람 기록을 가로지르는 조회에 색인이 없을 때) 나머지는 계속 지운다 */
async function step(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.warn(`[deleteAccount] ${name} 건너뜀`, error);
  }
}

export async function deleteAccountData(uid: string): Promise<void> {
  // 1. 내 서랍
  for (const name of USER_SUBCOLLECTIONS) {
    await step(name, () => wipe(collection(db, "users", uid, name)));
  }
  await step("playlists", async () => {
    const playlists = await getDocs(collection(db, "users", uid, "playlists"));
    for (const playlist of playlists.docs) {
      await wipe(collection(db, "users", uid, "playlists", playlist.id, "items"));
      await deleteDoc(playlist.ref).catch(() => undefined);
    }
  });

  // 2. 남에게 보이던 것
  await deleteDoc(doc(db, "public_profiles", uid)).catch(() => undefined);
  await step("public_playlists", () => wipe(query(collection(db, "public_playlists"), where("ownerUid", "==", uid))));

  // 3. 내가 쓴 글 — 달린 댓글을 먼저 지운다. 글이 없어지면 규칙이 댓글 삭제를 막는다.
  await step("posts", async () => {
    const posts = await getDocs(query(collection(db, "community_posts"), where("authorId", "==", uid)));
    for (const post of posts.docs) {
      await wipe(collection(db, "community_posts", post.id, "comments"));
      await wipe(collection(db, "community_posts", post.id, "likes"));
      await deleteDoc(post.ref).catch(() => undefined);
    }
  });

  // 4. 남의 글에 단 댓글과 좋아요. 글의 숫자도 같이 내린다.
  await step("comments", async () => {
    const comments = await getDocs(query(collectionGroup(db, "comments"), where("authorId", "==", uid)));
    for (const comment of comments.docs) {
      const parent = comment.ref.parent.parent;
      await deleteDoc(comment.ref).catch(() => undefined);
      if (parent) await updateDoc(parent, { commentCount: increment(-1) }).catch(() => undefined);
    }
  });
  // 작품에 단 감상(최상위 comments)은 필드 이름이 userId 다.
  await step("artwork comments", () => wipe(query(collection(db, "comments"), where("userId", "==", uid))));

  await step("likes", async () => {
    const likes = await getDocs(query(collectionGroup(db, "likes"), where("userId", "==", uid)));
    for (const like of likes.docs) {
      const parent = like.ref.parent.parent;
      await deleteDoc(like.ref).catch(() => undefined);
      if (parent) await updateDoc(parent, { likes: increment(-1) }).catch(() => undefined);
    }
  });

  // 5. 별점과 한 줄 평 — 평균에서도 빼야 해서 한 묶음으로 지운다.
  await step("reviews", async () => {
    const reviews = await getDocs(query(collectionGroup(db, "reviews"), where("uid", "==", uid)));
    for (const review of reviews.docs) {
      const subjectKey = review.ref.parent.parent?.id;
      if (!subjectKey) continue;
      await runTransaction(db, async (tx) => {
        const current = await tx.get(review.ref);
        if (!current.exists()) return;
        const rating = Number(current.data().rating) || 0;
        tx.delete(review.ref);
        tx.set(
          doc(db, "rating_stats", subjectKey),
          { ratingSum: increment(-rating), totalRatings: increment(-1), updatedAt: serverTimestamp() },
          { merge: true },
        );
      }).catch(() => undefined);
    }
  });

  // 6. 프로필 문서는 마지막에. 위 단계가 이 문서를 읽는 규칙을 탈 수 있다.
  await deleteDoc(doc(db, "users", uid)).catch(() => undefined);
}

/* 파이어베이스는 로그인한 지 5분쯤 지난 계정의 삭제를 거절한다. 여유를 두고 4분. */
const RECENT_MS = 4 * 60 * 1000;

/** 로그인한 지 오래됐으면 본인 확인을 다시 한다. 네이버 계정은 화면 없이, 구글·애플은 웹에서 팝업으로. */
async function reauthenticate(user: User): Promise<boolean> {
  const providerId = user.providerData[0]?.providerId;
  try {
    /* 네이버로 가입한 계정은 네이버 고유 ID로 만든 비밀번호 계정이라(LoginCallbackPage) 화면 없이 다시 확인된다 */
    if (providerId === "password" && user.email) {
      const naverId = (await getDoc(doc(db, "users", user.uid))).data()?.naverId;
      if (!naverId) return false;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, `naver_login_${naverId}_secure_!`));
      return true;
    }
    // 앱 웹뷰에서는 팝업이 뜨지 않는다.
    if (isMobileAppContainer()) return false;
    const provider =
      providerId === "google.com" ? new GoogleAuthProvider()
      : providerId === "apple.com" ? new OAuthProvider("apple.com")
      : null;
    if (!provider) return false;
    await reauthenticateWithPopup(user, provider);
    return true;
  } catch {
    return false;
  }
}

export type DeleteResult = "done" | "needs-signin";

/**
 * 본인 확인이 먼저다. 로그인이 오래됐고 다시 확인할 수 없으면 아무것도 지우지
 * 않고 돌아간다 - 기록만 지워지고 계정이 남는 반쪽 삭제를 막는다.
 * 그다음 기록을 지우고 마지막에 로그인 정보를 지운다(순서를 바꾸면 기록을 지울 권한이 사라진다).
 */
export async function deleteAccount(): Promise<DeleteResult> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인 상태가 아닙니다.");

  const signedInAt = Date.parse(user.metadata.lastSignInTime || "");
  const recent = Number.isFinite(signedInAt) && Date.now() - signedInAt < RECENT_MS;
  if (!recent && !(await reauthenticate(user))) return "needs-signin";

  await deleteAccountData(user.uid);
  await deleteUser(user);
  return "done";
}
