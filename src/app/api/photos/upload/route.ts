/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'uploads', 'photos');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

// POST /api/photos/upload — upload a photo for a unit type or property
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const unitTypeId = formData.get('unit_type_id') as string;
    const propertyId = formData.get('property_id') as string;
    const caption = formData.get('caption') as string || '';
    const sortOrder = parseInt(formData.get('sort_order') as string || '0');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!unitTypeId && !propertyId) {
      return NextResponse.json({ error: 'unit_type_id or property_id is required' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, AVIF' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Max 5MB.' }, { status: 400 });
    }

    const db = getDb();
    const entityId = unitTypeId || propertyId;
    const entityType = unitTypeId ? 'unit_type' : 'property';

    // Check max photos count (10 per entity)
    const table = entityType === 'unit_type' ? 'unit_type_photos' : 'property_photos';
    const fkCol = entityType === 'unit_type' ? 'unit_type_id' : 'property_id';
    const count = (db.prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${fkCol} = ?`).get(entityId) as any)?.cnt || 0;
    if (count >= 10) {
      return NextResponse.json({ error: 'Max 10 photos per entity' }, { status: 400 });
    }

    // Create directory
    const dir = path.join(DATA_DIR, entityType, entityId);
    fs.mkdirSync(dir, { recursive: true });

    // Generate filename
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(dir, fileName);

    // Write file
    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

    // Store in DB
    const url = `/api/photos/${entityType}/${entityId}/${fileName}`;
    db.prepare(`INSERT INTO ${table} (${fkCol}, url, caption, sort_order) VALUES (?, ?, ?, ?)`)
      .run(entityId, url, caption, sortOrder);

    return NextResponse.json({ success: true, url });
  } catch (error: any) {
    console.error('Photo upload error:', error?.message || error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// DELETE /api/photos/upload?id=xxx&type=unit_type — delete a photo
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type') || 'unit_type';

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const db = getDb();
    const table = type === 'property' ? 'property_photos' : 'unit_type_photos';

    const photo = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as any;
    if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });

    // Delete file from disk
    if (photo.url?.startsWith('/api/photos/')) {
      const parts = photo.url.replace('/api/photos/', '').split('/');
      const filePath = path.join(DATA_DIR, ...parts);
      try { fs.unlinkSync(filePath); } catch { /* file may not exist */ }
    }

    // Delete from DB
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Photo delete error:', error?.message || error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
