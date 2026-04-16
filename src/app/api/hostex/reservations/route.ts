/**
 * Hostex Reservations API
 * GET - live view of Hostex reservations (passes through to Hostex API)
 */
import { NextResponse } from 'next/server';
import { getReservations } from '@/lib/hostex';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const per_page = parseInt(url.searchParams.get('per_page') || '20');
    const status = url.searchParams.get('status') || undefined;
    const property_id = url.searchParams.get('property_id') 
      ? parseInt(url.searchParams.get('property_id')!) 
      : undefined;

    const result = await getReservations({ page, per_page, status, property_id });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
