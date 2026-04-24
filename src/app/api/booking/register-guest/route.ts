/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getDb } from '@core/db';
import { ocrDocument } from '@/lib/ai/ocr-document';
import { saveRegistrations } from '@/modules/guests/data/registration.repo';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/booking/register-guest
 * Accepts reservation_id + document photo URLs → OCR → register guest in PMS
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { reservation_id, document_urls } = body;

    if (!reservation_id || !document_urls?.length) {
      return NextResponse.json(
        { error: 'reservation_id and document_urls[] are required' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const db = getDb();

    // Find reservation
    const reservation = db.prepare(`
      SELECT r.id, r.property_id, r.guest_id, r.adults,
             p.organization_id,
             g.first_name as booking_first_name, g.last_name as booking_last_name
      FROM reservations r
      JOIN properties p ON r.property_id = p.id
      JOIN guests g ON r.guest_id = g.id
      WHERE r.id = ?
    `).get(reservation_id) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404, headers: CORS_HEADERS });
    }

    // Get the base URL for constructing full image URLs
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = req.headers.get('x-forwarded-proto') || 'https';

    // OCR each document
    const ocrResults = [];
    for (const docUrl of document_urls) {
      try {
        // Build full URL for the image
        const fullUrl = docUrl.startsWith('http') ? docUrl : `${protocol}://${host}${docUrl}`;
        const result = await ocrDocument(fullUrl);
        if (result.confidence > 20) {
          ocrResults.push(result);
        }
        console.log(`[OCR] Document processed: ${result.firstName} ${result.lastName} (confidence: ${result.confidence})`);
      } catch (err: any) {
        console.error('[OCR] Failed for document:', docUrl, err.message);
      }
    }

    // If OCR didn't extract any guests, use booking guest name as fallback
    if (ocrResults.length === 0) {
      ocrResults.push({
        firstName: reservation.booking_first_name || 'Guest',
        lastName: reservation.booking_last_name || '',
        dateOfBirth: null,
        documentNumber: null,
        documentType: 'id_card' as const,
        nationality: null,
        address: null,
        confidence: 10,
      });
    }

    // Register guests using existing PMS logic
    const registeredGuests = ocrResults.map(ocr => ({
      firstName: ocr.firstName,
      lastName: ocr.lastName,
      dateOfBirth: ocr.dateOfBirth ?? undefined,
      documentNumber: ocr.documentNumber ?? undefined,
      documentType: ocr.documentType,
      nationality: ocr.nationality ?? undefined,
      address: ocr.address ?? undefined,
    }));

    const saved = saveRegistrations(
      reservation_id,
      reservation.organization_id,
      registeredGuests
    );

    // Store document URLs as reservation activity
    db.prepare(`
      INSERT INTO reservation_activity (id, reservation_id, type, description, created_by, created_at)
      VALUES (lower(hex(randomblob(16))), ?, 'document_upload', ?, 'guest', datetime('now'))
    `).run(reservation_id, JSON.stringify({ document_urls, ocr_results: ocrResults.length }));

    console.log(`[Registration] ${ocrResults.length} guest(s) registered for reservation ${reservation_id}`);

    return NextResponse.json({
      success: true,
      guests_registered: saved.length,
      ocr_results: ocrResults,
    }, { headers: CORS_HEADERS });
  } catch (err: any) {
    console.error('[Registration] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
