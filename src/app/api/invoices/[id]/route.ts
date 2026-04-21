/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceData } from '@/lib/invoices';
import { renderInvoiceHtml } from '@/lib/invoice-template';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format'); // 'html' default, 'download' for attachment

    const data = getInvoiceData(id);
    if (!data) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const html = renderInvoiceHtml(data);

    if (format === 'download') {
      // Browser will download the HTML file named as the invoice number
      const filename = `faktura-${data.invoice_number}.html`;
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Default: render in browser (for print-to-PDF)
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('[API] Invoice render error:', e.message);
    return NextResponse.json({ error: 'Failed to render invoice' }, { status: 500 });
  }
}
