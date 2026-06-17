import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { NextRequest, NextResponse } from "next/server";

async function getAdminUid(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    const role = userDoc.data()?.role;
    return role === "admin" ? decoded.uid : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get("year");
  try {
    let ref = adminDb.collection("budgets") as FirebaseFirestore.Query;
    if (year) ref = ref.where("year", "==", Number(year));
    const snap = await ref.get();
    const budgets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ budgets });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const adminUid = await getAdminUid(req);
  if (!adminUid) return NextResponse.json({ error: "Admin erişimi gerekli." }, { status: 403 });

  const { category, year, limitAmount, currency = "TRY" } = await req.json();

  if (!category || !year || limitAmount === undefined) {
    return NextResponse.json({ error: "category, year ve limitAmount zorunlu." }, { status: 400 });
  }

  const existing = await adminDb
    .collection("budgets")
    .where("category", "==", category)
    .where("year", "==", Number(year))
    .limit(1)
    .get();

  const now = new Date().toISOString();
  const data = {
    category,
    year: Number(year),
    limitAmount: Number(limitAmount),
    currency,
    updatedAt: now,
    createdBy: adminUid,
  };

  if (!existing.empty) {
    await existing.docs[0].ref.update(data);
    return NextResponse.json({ id: existing.docs[0].id, ...data });
  }

  const docRef = await adminDb.collection("budgets").add({ ...data, createdAt: now });
  return NextResponse.json({ id: docRef.id, ...data });
}

export async function DELETE(req: NextRequest) {
  const adminUid = await getAdminUid(req);
  if (!adminUid) return NextResponse.json({ error: "Admin erişimi gerekli." }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id zorunlu." }, { status: 400 });

  await adminDb.collection("budgets").doc(id).delete();
  return NextResponse.json({ ok: true });
}