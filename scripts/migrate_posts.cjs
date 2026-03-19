const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve(__dirname, '..', 'firebase-service-account.json'));

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

(async () => {
    try {
        const sourceCol = db.collection('posts');
        const targetCol = db.collection('community_posts');
        const snap = await sourceCol.get();
        let copied = 0;
        for (const doc of snap.docs) {
            const targetRef = targetCol.doc(doc.id);
            const targetDoc = await targetRef.get();
            if (!targetDoc.exists) {
                await targetRef.set(doc.data());
                copied++;
            }
            const subcollections = await doc.ref.listCollections();
            for (const sub of subcollections) {
                const subSnap = await sub.get();
                for (const subDoc of subSnap.docs) {
                    await targetRef.collection(sub.id).doc(subDoc.id).set(subDoc.data());
                }
            }
        }
        console.log(`Copied ${copied} documents to community_posts (out of ${snap.size}).`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
})();
