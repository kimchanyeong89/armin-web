import { storage, db } from "../firebase";
import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, addDoc, serverTimestamp, doc, deleteDoc } from "firebase/firestore";

export async function testStorageConnection() {
  const id = `healthcheck_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const r = ref(storage, `healthchecks/${id}.txt`);
  try {
    await uploadString(r, `ok:${new Date().toISOString()}`, "raw");
    const url = await getDownloadURL(r);
    try { await deleteObject(r); } catch {}
    return { ok: true, url } as const;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), code: e?.code } as const;
  }
}

export async function testFirestoreConnection() {
  try {
    const docRef = await addDoc(collection(db, "healthchecks"), {
      at: serverTimestamp(),
      ok: true,
    });
    try { await deleteDoc(doc(db, "healthchecks", docRef.id)); } catch {}
    return { ok: true, id: docRef.id } as const;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), code: e?.code } as const;
  }
}
