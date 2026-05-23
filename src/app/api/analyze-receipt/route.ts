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

  return {
    ...fallback,
    ...JSON.parse(cleaned.slice(start, end + 1))
  };
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

  const geminiResponse = await fetch(
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

  if (!geminiResponse.ok) {
    const error = await geminiResponse.text();
    return NextResponse.json({ error }, { status: 502 });
  }

  const result = await geminiResponse.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text || typeof text !== "string") {
    return NextResponse.json({ ocr: fallback });
  }

  return NextResponse.json({ ocr: parseJson(text) });
}
