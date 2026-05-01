/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface OcrResult {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  documentNumber: string | null;
  documentType: string;  // 'passport' | 'id_card' | 'drivers_license'
  nationality: string | null;
  address: string | null;
  confidence: number;
}

/**
 * Extract guest data from ID/passport photo using GPT-4o Vision
 */
export async function ocrDocument(imageUrl: string): Promise<OcrResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `You are a document OCR specialist. Extract personal data from ID document photos.
Return ONLY a JSON object with these fields:
- firstName: string
- lastName: string  
- dateOfBirth: string (YYYY-MM-DD format) or null
- documentNumber: string or null
- documentType: "passport" | "id_card" | "drivers_license"
- nationality: string (2-letter country code) or null
- address: string or null
- confidence: number (0-100, how confident you are in the extraction)

If the image is unclear or not a document, return confidence: 0.
Always respond with valid JSON only, no markdown.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all personal data from this identity document:' },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ],
      },
    ],
  });

  const text = response.choices[0]?.message?.content || '{}';
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      firstName: parsed.firstName || '',
      lastName: parsed.lastName || '',
      dateOfBirth: parsed.dateOfBirth || null,
      documentNumber: parsed.documentNumber || null,
      documentType: parsed.documentType || 'id_card',
      nationality: parsed.nationality || null,
      address: parsed.address || null,
      confidence: parsed.confidence || 0,
    };
  } catch (e) {
    console.error('[OCR] Failed to parse GPT response:', text, e);
    return {
      firstName: '', lastName: '', dateOfBirth: null, documentNumber: null,
      documentType: 'id_card', nationality: null, address: null, confidence: 0,
    };
  }
}
