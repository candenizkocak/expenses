import { NextResponse } from "next/server";
import { z } from "zod";

const RequestBody = z.object({
  imageDataUrl: z.string().startsWith("data:image/")
});

const fallback = {
  merchant: "",
  netPrice: 0,
  taxRate: 0,
  taxAmount: 0,
  totalPrice: 0,
  currency: "TRY",
  confidence: 0,
  notes: "Could not parse the receipt automatically."
};

const fallbackModels = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];

function toText(value: unknown, defaultValue = "") {
  return typeof value === "string" ? value : defaultValue;
}

function toNumber(value: unknown, defaultValue = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL.");
  }

  return {
    mimeType: match[1],
    data: match[2]
  };
}

function parseJson(text: string) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    return fallback;
  }

  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;

  return {
    merchant: toText(parsed.merchant),
    netPrice: toNumber(parsed.netPrice),
    taxRate: toNumber(parsed.taxRate),
    taxAmount: toNumber(parsed.taxAmount),
    totalPrice: toNumber(parsed.totalPrice),
    currency: toText(parsed.currency, fallback.currency).toUpperCase(),
    receiptDate: toText(parsed.receiptDate) || undefined,
    confidence: toNumber(parsed.confidence),
    notes: toText(parsed.notes)
  };
}

async function analyzeWithModel(model: string, apiKey: string, image: { mimeType: string; data: string }) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Extract receipt data for an expense approval system. Return only JSON with merchant, netPrice, taxRate, taxAmount, totalPrice, currency, receiptDate, confidence, notes. Use numbers for prices and taxRate as percent, for example 20."
              },
              {
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.data
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    }
  );
}

export async function POST(request: Request) {
  const body = RequestBody.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ error: "A receipt image is required." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 500 });
  }

  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  const image = parseDataUrl(body.data.imageDataUrl);
  const models = [model, ...fallbackModels.filter((candidate) => candidate !== model)];
  const errors: string[] = [];
  let geminiResponse: Response | null = null;

  for (const candidate of models) {
    geminiResponse = await analyzeWithModel(candidate, apiKey, image);
    if (geminiResponse.ok) break;
    errors.push(`${candidate}: ${await geminiResponse.text()}`);
    geminiResponse = null;
  }

  if (!geminiResponse) {
    return NextResponse.json({ error: errors.join("\n\n") || "Receipt OCR failed." }, { status: 502 });
  }

  const result = await geminiResponse.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text || typeof text !== "string") {
    return NextResponse.json({ ocr: fallback });
  }

  return NextResponse.json({ ocr: parseJson(text) });
}
