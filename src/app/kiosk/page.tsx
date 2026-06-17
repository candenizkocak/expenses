"use client";

import { Camera, Check, LayoutDashboard, RefreshCcw, ScanLine, Send } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { signInWithCustomToken } from "firebase/auth";
import { FormEvent, useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase/client";
import { money } from "@/lib/money";
import { blockingFlags, policyFlagsForExpense } from "@/lib/policy";
import { useEmailNotification } from "@/lib/useEmailNotification";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type ReceiptOcr, type UserProfile } from "@/lib/types";

type LoginProfile = UserProfile & { uid: string; email?: string };

const emptyOcr: ReceiptOcr = {
  merchant: "",
  netPrice: 0,
  taxRate: 0,
  taxAmount: 0,
  totalPrice: 0,
  currency: "TRY",
  confidence: 0
};

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 30000) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1000}s.`)), timeoutMs);
    })
  ]);
}

function compressedReceiptDataUrl(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const maxWidth = 1100;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", 0.62);
}

export default function KioskPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cardId, setCardId] = useState("");
  const [profile, setProfile] = useState<LoginProfile | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [ocr, setOcr] = useState<ReceiptOcr>(emptyOcr);
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Employee paid");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const { sendNotification } = useEmailNotification(auth.currentUser);

  const policyFlags = policyFlagsForExpense({ ...ocr, category, imageUrl: imageDataUrl });
  const blockers = blockingFlags(policyFlags);

  useEffect(() => {
    if (!profile || imageDataUrl) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setMessage("Camera permission is needed to take a receipt photo."));
  }, [profile, imageDataUrl]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy("login");
    setMessage("");
    try {
      const response = await fetch("/api/rfid-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "RFID login failed.");
      await signInWithCustomToken(auth, result.token);
      setProfile(result.profile);
      setCardId("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "RFID login failed.");
    } finally {
      setBusy("");
    }
  }

  async function capture() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const dataUrl = compressedReceiptDataUrl(video, canvas);
    setImageDataUrl(dataUrl);
    setBusy("ocr");
    setMessage("");
    try {
      const response = await fetch("/api/analyze-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Receipt OCR failed.");
      setOcr(result.ocr);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Receipt OCR failed.");
    } finally {
      setBusy("");
    }
  }

  function retake() {
    setImageDataUrl("");
    setOcr(emptyOcr);
    setCategory("");
    setPaymentMethod("Employee paid");
    setComment("");
    setMessage("");
  }

  async function sendForApproval() {
    if (!profile || !imageDataUrl) return;
    if (!profile.managerId) {
      setMessage("This employee does not have a managerId in Firestore.");
      return;
    }
    if (blockers.length > 0) {
      setMessage(blockers[0].message);
      return;
    }
    setBusy("send");
    try {
      if (imageDataUrl.length > 850000) {
        throw new Error("Receipt image is too large. Retake it closer to the receipt and try again.");
      }

      setMessage("Saving expense for approval...");

      await withTimeout(addDoc(collection(db, "expenses"), {
        ...ocr,
        employeeId: profile.uid,
        employeeName: profile.displayName,
        managerId: profile.managerId,
        imageUrl: imageDataUrl,
        status: "pending",
        category,
        paymentMethod,
        comment,
        policyFlags,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }), "Expense save");

      // Email bildirimi — hata olursa ana akışı durdurmaz
      if (profile.email) {
        await sendNotification(
          "submitted",
          {
            merchant: ocr.merchant,
            totalPrice: ocr.totalPrice,
            currency: ocr.currency,
            receiptDate: ocr.receiptDate,
            category,
            paymentMethod,
          },
          profile.email,
          profile.displayName
        );
      }

      retake();
      setProfile(null);
      await auth.signOut();
      setMessage("Expense sent for manager approval.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send expense.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="shell">
      <div className="topbar-pill">
        <div className="brand-lockup">
          <span className="brand-mark">IW</span>
          <div className="title">
            <h1>InWise Kiosk</h1>
            <p>{profile ? `Welcome, ${profile.displayName}` : "Scan your RFID card to begin"}</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ThemeToggle />
          <a href="/" className="btn">
            <LayoutDashboard size={13} /> Sign in
          </a>
        </div>
      </div>

      {!profile ? (
        <>
          <div className="kiosk-hero">
            <div className="kiosk-scan-wrap">
              <div className="kiosk-scan-ring" />
              <div className="kiosk-scan-ring kiosk-scan-ring-2" />
              <div className="kiosk-hero-icon">
                <ScanLine size={28} />
              </div>
            </div>
            <h2 className="kiosk-hero-title">Ready to scan</h2>
            <p className="kiosk-hero-sub">Hold your RFID card near the reader, or enter your card ID below.</p>
          </div>

          <form className="panel" onSubmit={login} style={{ maxWidth: 480, margin: "0 auto" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ScanLine size={16} /> RFID Login
            </h2>
            <input
              autoFocus
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              placeholder="Card ID"
              style={{ letterSpacing: "0.05em" }}
            />
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="primary lg" disabled={!cardId || busy === "login"} type="submit">
                <Check size={15} /> {busy === "login" ? "Verifying..." : "Log in"}
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="grid">
          <section className="panel">
            <h2><Camera size={15} style={{ verticalAlign: "middle" }} /> Receipt image</h2>
            {!imageDataUrl ? (
              <>
                <video ref={videoRef} autoPlay playsInline muted />
                <canvas ref={canvasRef} hidden />
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="primary" onClick={capture} disabled={busy === "ocr"}>
                    <Camera size={14} /> {busy === "ocr" ? "Processing..." : "Take picture"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <img className="receipt-image" src={imageDataUrl} alt="Captured receipt" />
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="secondary" onClick={retake} disabled={Boolean(busy)}>
                    <RefreshCcw size={14} /> Retake
                  </button>
                  <button className="primary" onClick={sendForApproval} disabled={Boolean(busy)}>
                    <Send size={14} /> {busy === "send" ? "Sending..." : "Send for approval"}
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="panel">
            <h2>OCR results</h2>
            {busy === "ocr" && <p className="muted" style={{ marginTop: 0 }}>Reading receipt...</p>}
            <div className="form-grid">
              <label>
                Merchant
                <input value={ocr.merchant} onChange={(e) => setOcr((prev) => ({ ...prev, merchant: e.target.value }))} />
              </label>
              <label>
                Receipt date
                <input type="date" value={ocr.receiptDate || ""} onChange={(e) => setOcr((prev) => ({ ...prev, receiptDate: e.target.value }))} />
              </label>
              <label>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Select category</option>
                  {EXPENSE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Payment method
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Net price
                <input type="number" step="0.01" value={ocr.netPrice} onChange={(e) => setOcr((prev) => ({ ...prev, netPrice: Number(e.target.value) }))} />
              </label>
              <label>
                Tax rate
                <input type="number" step="0.01" value={ocr.taxRate} onChange={(e) => setOcr((prev) => ({ ...prev, taxRate: Number(e.target.value) }))} />
              </label>
              <label>
                Tax
                <input type="number" step="0.01" value={ocr.taxAmount} onChange={(e) => setOcr((prev) => ({ ...prev, taxAmount: Number(e.target.value) }))} />
              </label>
              <label>
                Total
                <input type="number" step="0.01" value={ocr.totalPrice} onChange={(e) => setOcr((prev) => ({ ...prev, totalPrice: Number(e.target.value) }))} />
              </label>
              <label>
                Currency
                <input value={ocr.currency} onChange={(e) => setOcr((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} />
              </label>
              <label>
                Confidence
                <input readOnly value={`${Math.round((ocr.confidence || 0) * 100)}%`} />
              </label>
            </div>
            <label>
              Comment
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional note for your manager" />
            </label>
            {policyFlags.length > 0 && (
              <div className="flag-list">
                {policyFlags.map((flag) => (
                  <p key={flag.code} className={`flag ${flag.severity}`}>{flag.message}</p>
                ))}
              </div>
            )}
            {imageDataUrl && (
              <p className="muted" style={{ marginBottom: 0, fontSize: 12 }}>
                Current total: {money(ocr.totalPrice, ocr.currency)}
              </p>
            )}
          </section>
        </div>
      )}

      {message && (
        <p
          className="panel"
          role="status"
          style={{ marginTop: 16, maxWidth: 480, margin: "16px auto 0" }}
        >
          {message}
        </p>
      )}
    </main>
  );
}