import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function privateKey() {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  return key?.replace(/\\n/g, "\n");
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey()
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
