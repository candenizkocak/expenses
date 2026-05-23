import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

const RequestBody = z.object({
  cardId: z.string().min(4).max(128)
});

export async function POST(request: Request) {
  const body = RequestBody.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ error: "Invalid RFID card id." }, { status: 400 });
  }

  const cardId = body.data.cardId.trim();
  const card = await adminDb.collection("rfidCards").doc(cardId).get();

  if (!card.exists || card.data()?.disabled) {
    return NextResponse.json({ error: "RFID card is not registered." }, { status: 404 });
  }

  const uid = card.data()?.uid;
  if (!uid || typeof uid !== "string") {
    return NextResponse.json({ error: "RFID card is missing a user mapping." }, { status: 409 });
  }

  const user = await adminDb.collection("users").doc(uid).get();
  if (!user.exists) {
    return NextResponse.json({ error: "Mapped user profile was not found." }, { status: 409 });
  }

  const token = await adminAuth.createCustomToken(uid);

  return NextResponse.json({
    token,
    profile: {
      uid,
      ...user.data()
    }
  });
}
