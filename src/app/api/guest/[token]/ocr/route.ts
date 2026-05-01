/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { ocrDocument } from '@/lib/ai/ocr-document';

/**
 * POST /api/guest/[token]/ocr
 * Accept a base64-encoded document photo, run GPT-4o Vision OCR,
 * return extracted fields so the guest can review & edit before submitting.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { image } = body; // base64 data URL: "data:image/jpeg;base64,..."

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Missing image (base64 data URL)' }, { status: 400 });
    }

    // Run OCR via GPT-4o Vision
    const result = await ocrDocument(image);

    return NextResponse.json({
      success: true,
      data: {
        fullName: `${result.firstName} ${result.lastName}`.trim(),
        dateOfBirth: result.dateOfBirth || '',
        documentType: result.documentType || '',
        documentNumber: result.documentNumber || '',
        nationality: result.nationality || '',
        address: result.address || '',
        confidence: result.confidence,
      },
    });
  } catch (err: any) {
    console.error('[OCR] Error:', err);
    return NextResponse.json({ error: err.message || 'OCR failed' }, { status: 500 });
  }
}
