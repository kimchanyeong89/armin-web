// COLLY app notifications.
//
//   npx tsx scripts/push/send.ts weekly                 what would go out for this week's exhibition (default: preview)
//   npx tsx scripts/push/send.ts weekly --send          send it, once per week (launchd runs this hourly)
//   npx tsx scripts/push/send.ts weekly --send --uid=<uid> --force    to one person, again (test)
//   npx tsx scripts/push/send.ts message --title="…" --body="…" [--url=/ai?special=…] [--uid=<uid>] --send
//                                                        anything else, any time
//
// Tokens live on users/{uid}.pushTokens (the web files them — src/utils/nativePush.ts). Sending goes
// through Expo's push service; the APNs key is held by EAS. Tapping opens data.url in the app.
//
// The weekly exhibition is the Firestore doc weekly_curations/{week}. It goes on show Monday 07:00 KST
// (liveWeek), or the moment an admin confirms one for the week already running — nothing server-side
// sees that write, so this script is run on a timer and remembers what it sent (config/push_log).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { liveWeek } from "../../src/lib/iso-week";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const mode = argv[0] === "message" ? "message" : "weekly";
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
const send = argv.includes("--send");
const force = argv.includes("--force");
const uid = arg("uid");

const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS
  || resolve(ROOT, "firebase-service-account.json");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const db = admin.firestore();

type Message = { title: string; body: string; url: string };

/** This week's exhibition as a notification, or null when none is confirmed yet. */
async function weeklyMessage(week: string): Promise<Message | null> {
  const snap = await db.doc(`weekly_curations/${week}`).get();
  const data = snap.data();
  if (!data?.title_ko) return null;
  const intro = String(data.intro_ko || data.subtitle_chip || "").replace(/\s+/g, " ").trim();
  return {
    title: `이번 주 전시 · ${data.title_ko}`,
    body: intro.length > 90 ? `${intro.slice(0, 88)}…` : intro || "새 주간 전시가 열렸어요.",
    url: `/ai?weekly=${week}`,
  };
}

/** Everyone who has a device on file (or just one person). */
async function recipients(): Promise<{ uid: string; tokens: string[] }[]> {
  const docs = uid
    ? [await db.doc(`users/${uid}`).get()]
    : (await db.collection("users").where("pushTokens", "!=", null).get()).docs;
  return docs.map((d) => ({ uid: d.id, tokens: ((d.data()?.pushTokens as string[]) || []).filter(Boolean) }))
    .filter((r) => r.tokens.length);
}

/** Send to every device; drop the ones Expo says are gone (app deleted or notifications turned off). */
async function deliver(message: Message, people: { uid: string; tokens: string[] }[]) {
  let devices = 0;
  const errors = new Set<string>();
  for (const person of people) {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(person.tokens.map((to) => ({
        to, title: message.title, body: message.body, sound: "default", data: { url: message.url },
      }))),
    });
    const out = (await response.json().catch(() => ({}))) as { data?: { status?: string; details?: { error?: string } }[] };
    const dead: string[] = [];
    (out.data || []).forEach((ticket, i) => {
      if (ticket?.status === "ok") devices += 1;
      else if (ticket?.details?.error === "DeviceNotRegistered") dead.push(person.tokens[i]);
      else if (ticket?.details?.error) errors.add(ticket.details.error);
    });
    if (dead.length) await db.doc(`users/${person.uid}`).update({ pushTokens: admin.firestore.FieldValue.arrayRemove(...dead) });
  }
  return { people: people.length, devices, errors: [...errors] };
}

const week = liveWeek();
const message: Message | null = mode === "message"
  ? { title: arg("title"), body: arg("body"), url: arg("url") || "/" }
  : await weeklyMessage(week);

if (mode === "message" && (!message?.title || !message.body)) { console.error("--title 과 --body 가 필요합니다."); process.exit(1); }
if (!message) { console.log(`${week}: 확정된 주간 전시가 아직 없습니다.`); process.exit(0); }
if (!message.url.startsWith("/")) { console.error("--url 은 앱 안의 주소(/로 시작)만 됩니다."); process.exit(1); }

// The weekly one goes out once. A test to one person (--uid) neither reads nor writes the log.
const log = db.doc("config/push_log");
if (mode === "weekly" && !uid && !force && (await log.get()).data()?.weekly?.[week]) {
  console.log(`${week}: 이미 보냈습니다.`);
  process.exit(0);
}

const people = await recipients();
console.log(`${uid ? `${uid} 에게만` : `알림을 켠 ${people.length}명에게`}: ${message.title} — ${message.body}`);
console.log(`누르면: ${message.url}`);
if (!send) { console.log("\n--send 를 붙이면 실제로 보냅니다."); process.exit(0); }

const result = await deliver(message, people);
console.log("결과:", JSON.stringify(result));
if (mode === "weekly" && !uid) {
  await log.set({ weekly: { [week]: { at: new Date().toISOString(), ...result } } }, { merge: true });
}
process.exit(0);
