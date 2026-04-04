/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/guest/[token] — get full booking data for guest page
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const db = getDb();
    const { token } = await params;

    // Find reservation by guest_page_token
    const reservation = db.prepare(`
      SELECT
        r.id, r.check_in, r.check_out, r.nights, r.adults, r.children, r.infants,
        r.status, r.payment_status, r.total_price, r.currency, r.notes, r.source,
        r.guest_page_expires_at, r.property_id,
        g.id as guest_id, g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
        u.id as unit_id, u.name as unit_name, u.code as unit_code, u.beds,
        c.id as category_id, c.name as category_name, c.type as category_type, c.icon as category_icon, c.color as category_color,
        ut.id as unit_type_id, ut.name as unit_type_name, ut.code as unit_type_code,
        ut.max_adults, ut.max_children, ut.max_occupancy, ut.base_occupancy,
        ut.beds_single, ut.beds_double, ut.beds_sofa, ut.extra_bed_available, ut.description as unit_type_description,
        b.id as building_id, b.name as building_name, b.code as building_code,
        p.name as property_name, p.address as property_address, p.city as property_city,
        p.country as property_country, p.phone as property_phone, p.email as property_email,
        p.check_in_time, p.check_out_time
      FROM reservations r
      JOIN guests g ON r.guest_id = g.id
      JOIN units u ON r.unit_id = u.id
      JOIN categories c ON u.category_id = c.id
      JOIN unit_types ut ON u.unit_type_id = ut.id
      LEFT JOIN buildings b ON u.building_id = b.id
      JOIN properties p ON r.property_id = p.id
      WHERE r.guest_page_token = ?
    `).get(token) as any;

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Check if token is expired (check_out + 2 days)
    const now = new Date();
    const checkOut = new Date(reservation.check_out + 'T00:00:00');
    const expiryDate = reservation.guest_page_expires_at
      ? new Date(reservation.guest_page_expires_at)
      : new Date(checkOut.getTime() + 2 * 24 * 60 * 60 * 1000);
    const isExpired = now > expiryDate;

    // If expired, return limited data for post-stay page
    if (isExpired) {
      // Get all unit types for re-booking showcase
      const unitTypes = db.prepare(`
        SELECT ut.id, ut.name, ut.code, ut.description, ut.max_adults, ut.max_children, ut.base_occupancy,
               c.name as category_name, c.type as category_type, c.icon as category_icon
        FROM unit_types ut
        JOIN categories c ON ut.category_id = c.id
        ORDER BY c.type, ut.sort_order
      `).all();

      return NextResponse.json({
        expired: true,
        guestName: reservation.first_name,
        brandName: reservation.category_type === 'glamping' ? 'QA Glamping' : 'Kemp Carlsbad',
        propertyName: reservation.property_name,
        propertyEmail: reservation.property_email,
        propertyPhone: reservation.property_phone,
        unitTypes,
        stayDates: { checkIn: reservation.check_in, checkOut: reservation.check_out },
      });
    }

    // Determine stay phase
    const checkIn = new Date(reservation.check_in + 'T00:00:00');
    const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00');
    let phase: 'pre_arrival' | 'checked_in' | 'post_checkout' = 'pre_arrival';
    if (today >= checkIn && today <= checkOut) phase = 'checked_in';
    else if (today > checkOut) phase = 'post_checkout';

    // Get registered guests
    const registeredGuests = db.prepare(
      'SELECT * FROM reservation_guests WHERE reservation_id = ? ORDER BY created_at'
    ).all(reservation.id);

    // Get payments summary
    const payments = db.prepare(
      "SELECT SUM(CASE WHEN type != 'refund' THEN amount ELSE 0 END) as total_paid, SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) as total_refunded FROM payments WHERE reservation_id = ? AND status = 'completed'"
    ).get(reservation.id) as any;

    // Get unit type photos
    const unitTypePhotos = db.prepare(
      'SELECT * FROM unit_type_photos WHERE unit_type_id = ? ORDER BY sort_order'
    ).all(reservation.unit_type_id);

    // Get property photos
    const propertyPhotos = db.prepare(
      'SELECT * FROM property_photos WHERE property_id = ? ORDER BY sort_order'
    ).all(reservation.property_id);

    // Get available additional services for this category type
    const services = db.prepare(
      "SELECT * FROM additional_services WHERE property_id = ? AND is_active = 1 AND (available_for = 'all' OR available_for = ?) ORDER BY sort_order"
    ).all(
      reservation.property_id,
      reservation.category_type
    );

    // Get ordered services
    const orderedServices = db.prepare(`
      SELECT so.*, ads.name as service_name, ads.icon as service_icon
      FROM service_orders so
      JOIN additional_services ads ON so.service_id = ads.id
      WHERE so.reservation_id = ?
      ORDER BY so.created_at
    `).all(reservation.id);

    // Get guest page config for this unit type
    const guestPageConfig = db.prepare(
      'SELECT * FROM guest_page_config WHERE unit_type_id = ?'
    ).get(reservation.unit_type_id) || null;

    return NextResponse.json({
      expired: false,
      phase,
      reservation,
      registeredGuests,
      payments: {
        totalPaid: payments?.total_paid || 0,
        totalRefunded: payments?.total_refunded || 0,
        remaining: reservation.total_price - (payments?.total_paid || 0) + (payments?.total_refunded || 0),
      },
      photos: {
        unitType: unitTypePhotos,
        property: propertyPhotos,
      },
      services,
      orderedServices,
      guestPageConfig,
    });
  } catch (error: any) {
    console.error('GET /api/guest/[token] error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch booking data' }, { status: 500 });
  }
}
