import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const catboxData = new FormData();
    catboxData.append('reqtype', 'fileupload');
    catboxData.append('fileToUpload', file);

    const res = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: catboxData,
    });

    if (!res.ok) throw new Error('Catbox upload failed');
    const url = await res.text();
    
    return new NextResponse(url.trim());
  } catch (error: any) {
    console.error('Upload proxy error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
