"use client";

import { LayoutDashboard, Save, ScanLine } from "lucide-react";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase/client";
import { BudgetManager } from "@/components/BudgetManager";
import type { Role, UserProfile } from "@/lib/types";

type UserRow = UserProfile & { id: string };
type CardRow = { id: string; uid: string; disabled?: boolean };

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [hasAdmin, setHasAdmin] = useState(true);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    uid: "",
    displayName: "",
    email: "",
    role: "employee" as Role,
    managerId: "",
    cardId: ""
  });

  useEffect(() => onAuthStateChanged(auth, (currentUser) => {
    if (!currentUser) { router.push("/login"); return; }
    setUser(currentUser);
  }), [router]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      const currentProfile = snap.data() as UserProfile;
      setProfile(currentProfile);
    });
  }, [router, user]);

  useEffect(() => {
    fetch("/api/bootstrap-admin")
      .then((response) => response.json())
      .then((result) => setHasAdmin(Boolean(result.hasAdmin)))
      .catch(() => setHasAdmin(true));
  }, []);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    return onSnapshot(query(collection(db, "users"), orderBy("displayName")), (snap) => {
      setUsers(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as UserRow));
    });
  }, [profile]);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    return onSnapshot(collection(db, "rfidCards"), (snap) => {
      setCards(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as CardRow));
    });
  }, [profile]);

  const managers = useMemo(() => users.filter((item) => item.role === "manager" || item.role === "admin"), [users]);

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const uid = form.uid.trim();
    if (!uid) {
      setMessage("UID is required. Create the Firebase Auth user first, then paste the UID here.");
      return;
    }

    await setDoc(doc(db, "users", uid), {
      displayName: form.displayName.trim(),
      email: form.email.trim(),
      role: form.role,
      managerId: form.role === "employee" ? form.managerId : ""
    });

    const oldCards = cards.filter((card) => card.uid === uid);
    const newCardId = form.cardId.trim();

    await Promise.all(oldCards
      .filter((card) => card.id !== newCardId)
      .map((card) => deleteDoc(doc(db, "rfidCards", card.id))));

    if (newCardId) {
      await setDoc(doc(db, "rfidCards", newCardId), { uid, disabled: false });
    }

    setMessage("User profile saved.");
  }

  function editUser(item: UserRow) {
    setForm({
      uid: item.id,
      displayName: item.displayName || "",
      email: item.email || "",
      role: item.role,
      managerId: item.managerId || "",
      cardId: cards.find((card) => card.uid === item.id && !card.disabled)?.id || ""
    });
  }

  async function becomeFirstAdmin() {
    if (!user) return;
    setMessage("");
    const idToken = await user.getIdToken();
    const response = await fetch("/api/bootstrap-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Could not create the first admin.");
      return;
    }
    setHasAdmin(true);
    setMessage("First admin created. Refreshing permissions...");
  }

  if (profile?.role !== "admin") {
    return (
      <main className="shell">
        <div className="panel" style={{ maxWidth: 520, margin: "80px auto" }}>
          <h2>{hasAdmin ? "Admin access required" : "Create first admin"}</h2>
          <p className="muted">
            {hasAdmin
              ? "Sign in with an admin account to manage users and RFID cards."
              : "No admin user exists yet. Promote your current signed-in account to initialize the project."}
          </p>
          {!hasAdmin && (
            <button className="primary" onClick={becomeFirstAdmin}>
              <Save size={14} /> Make me admin
            </button>
          )}
          {message && <p className="muted">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="topbar-pill">
        <div className="brand-lockup">
          <span className="brand-mark">E</span>
          <div className="title">
            <h1>Admin Setup</h1>
            <p>Manage employee profiles and RFID card mappings.</p>
          </div>
        </div>
        <div className="actions">
          <a href="/dashboard" className="btn"><LayoutDashboard size={13} /> Dashboard</a>
          <a href="/kiosk" className="btn"><ScanLine size={13} /> Kiosk</a>
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 18 }}>
        <form className="panel" onSubmit={saveUser}>
          <h2>User profile</h2>
          <label>Firebase Auth UID<input value={form.uid} onChange={(e) => setForm((prev) => ({ ...prev, uid: e.target.value }))} /></label>
          <label>Name<input value={form.displayName} onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))} /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} /></label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as Role }))}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Manager
            <select value={form.managerId} onChange={(e) => setForm((prev) => ({ ...prev, managerId: e.target.value }))}>
              <option value="">No manager</option>
              {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.displayName}</option>)}
            </select>
          </label>
          <label>RFID card ID<input value={form.cardId} onChange={(e) => setForm((prev) => ({ ...prev, cardId: e.target.value }))} /></label>
          <button className="primary" type="submit"><Save size={14} /> Save profile</button>
          {message && <p className="muted">{message}</p>}
        </form>

        <section className="panel">
          <h2>People</h2>
          <div className="data-list">
            {users.map((item) => (
              <button key={item.id} className="list-button" onClick={() => editUser(item)}>
                <span>
                  <strong>{item.displayName}</strong>
                  <span className="muted">
                    {item.email}
                    {cards.find((card) => card.uid === item.id && !card.disabled)?.id
                      ? ` - RFID ${cards.find((card) => card.uid === item.id && !card.disabled)?.id}`
                      : ""}
                  </span>
                </span>
                <span className={`badge ${item.role === "employee" ? "pending" : "approved"}`}>{item.role}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ─── Bütçe yönetimi ─────────────────────────────────── */}
      <BudgetManager user={user} />
    </main>
  );
}