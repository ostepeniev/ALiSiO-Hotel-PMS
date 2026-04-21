import { NextRequest, NextResponse } from 'next/server';
import { listInvoices } from '@/lib/invoices';

export async function GET(_request: NextRequest) {
  try {
    const invoices = listInvoices();
    return NextResponse.json(invoices);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}
