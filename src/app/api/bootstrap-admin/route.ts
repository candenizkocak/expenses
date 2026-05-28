import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

const RequestBody = z.object({
  idToken: z.string().min(20)
});

export async function GET() {
  const admins = await adminDb.collection("users").where("role", "==", "admin").limit(1).get();
  return NextResponse.json({ hasAdmin: !admins.empty });
}

export async function POST(request: Request) {
  const body = RequestBody.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ error: "A Firebase ID token is required." }, { status: 400 });
  }

  const decoded = await adminAuth.verifyIdToken(body.data.idToken);
  const admins = await adminDb.collection("users").where("role", "==", "admin").limit(1).get();

  if (!admins.empty) {
    return NextResponse.json({ error: "An admin already exists." }, { status: 409 });
  }

  const user = await adminAuth.getUser(decoded.uid);
  await adminDb.collection("users").doc(decoded.uid).set({
    displayName: user.displayName || user.email || "Admin",
    email: user.email || "",
    role: "admin",
    managerId: ""
  }, { merge: true });

  return NextResponse.json({ ok: true });
}
