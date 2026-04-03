/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

// Database file path — stored in project root /data directory
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'alisio.db');

// EUR conversion rate
export const CZK_TO_EUR = 23.5;

let db: any = null;

// Force re-initialization (for migrations after hot-reload)
export function _resetDb() {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
  }
  db = null;
}

export function getDb(): any {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Dynamic require to avoid webpack bundling issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema if needed
  initSchema(db);

  // Run migrations for existing databases
  runMigrations(db);

  return db;
}

function initSchema(database: any) {
  // Check if tables exist
  const tableExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='organizations'"
  ).get();

  if (tableExists) return; // Already initialized

  // ─── Create all tables ──────────────────────────────────
  database.exec(`
    -- Organizations
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Europe/Prague',
      default_currency TEXT NOT NULL DEFAULT 'CZK',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Properties
    CREATE TABLE properties (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      address TEXT,
      city TEXT,
      country TEXT DEFAULT 'CZ',
      phone TEXT,
      email TEXT,
      check_in_time TEXT NOT NULL DEFAULT '15:00',
      check_out_time TEXT NOT NULL DEFAULT '10:00',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, slug)
    );

    -- Categories
    CREATE TABLE categories (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('glamping', 'resort', 'camping')),
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      icon TEXT,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Buildings / SubGroups
    CREATE TABLE buildings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Unit Types
    CREATE TABLE unit_types (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT,
      max_adults INTEGER NOT NULL DEFAULT 2,
      max_children INTEGER NOT NULL DEFAULT 2,
      max_occupancy INTEGER NOT NULL DEFAULT 4,
      base_occupancy INTEGER NOT NULL DEFAULT 2,
      beds_single INTEGER NOT NULL DEFAULT 0,
      beds_double INTEGER NOT NULL DEFAULT 1,
      beds_sofa INTEGER NOT NULL DEFAULT 0,
      extra_bed_available INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Units
    CREATE TABLE units (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      unit_type_id TEXT NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      floor INTEGER,
      zone TEXT,
      beds INTEGER NOT NULL DEFAULT 2,
      room_status TEXT NOT NULL DEFAULT 'available' CHECK (room_status IN ('available', 'occupied', 'maintenance', 'blocked')),
      cleaning_status TEXT NOT NULL DEFAULT 'clean' CHECK (cleaning_status IN ('clean', 'dirty', 'in_progress')),
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(property_id, code)
    );

    -- Rate Plans
    CREATE TABLE rate_plans (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      pricing_model TEXT NOT NULL DEFAULT 'standard',
      currency TEXT NOT NULL DEFAULT 'CZK',
      is_active INTEGER NOT NULL DEFAULT 1,
      cancellation_policy TEXT,
      meal_plan TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(property_id, code)
    );

    -- Guests
    CREATE TABLE guests (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      country TEXT,
      city TEXT,
      address TEXT,
      document_type TEXT,
      document_number TEXT,
      date_of_birth TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Reservations
    CREATE TABLE reservations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      unit_id TEXT NOT NULL REFERENCES units(id),
      guest_id TEXT NOT NULL REFERENCES guests(id),
      rate_plan_id TEXT REFERENCES rate_plans(id),
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      nights INTEGER NOT NULL DEFAULT 1,
      adults INTEGER NOT NULL DEFAULT 1,
      children INTEGER NOT NULL DEFAULT 0,
      infants INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'payment_requested', 'prepaid', 'paid')),
      source TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'phone', 'whatsapp', 'booking_com', 'airbnb', 'other_ota')),
      total_price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CZK',
      notes TEXT,
      internal_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Payments
    CREATE TABLE payments (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CZK',
      method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer', 'invoice', 'online')),
      type TEXT NOT NULL CHECK (type IN ('deposit', 'full', 'partial', 'refund')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
      paid_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Fees & Taxes
    CREATE TABLE fees_taxes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('per_night', 'per_stay', 'per_person', 'per_person_per_night', 'percentage')),
      amount REAL NOT NULL DEFAULT 0,
      is_included_in_price INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- App Users
    CREATE TABLE app_users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      password_hash TEXT,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'receptionist' CHECK (role IN ('owner', 'director', 'manager', 'receptionist', 'housekeeper', 'maintenance', 'accountant')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Sessions
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Per-user permission overrides
    CREATE TABLE user_permissions (
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, permission)
    );

    -- Audit Log
    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES app_users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      old_values TEXT,
      new_values TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX idx_units_property ON units(property_id);
    CREATE INDEX idx_units_category ON units(category_id);
    CREATE INDEX idx_units_unit_type ON units(unit_type_id);
    CREATE INDEX idx_reservations_property ON reservations(property_id);
    CREATE INDEX idx_reservations_unit ON reservations(unit_id);
    CREATE INDEX idx_reservations_guest ON reservations(guest_id);
    CREATE INDEX idx_reservations_dates ON reservations(check_in, check_out);
    CREATE INDEX idx_reservations_status ON reservations(status);
    CREATE INDEX idx_guests_org ON guests(organization_id);
    CREATE INDEX idx_guests_name ON guests(last_name, first_name);
  `);

  // ─── Seed initial data ────────────────────────────────  // Seed data
  seedData(database);
}

// Migrate existing databases — add new columns safely
function runMigrations(database: any) {
  // --- Check if app_users needs role migration ---
  try {
    // Test INSERT to check if new CHECK constraint is in place
    // (SQLite CHECK only fires on INSERT/UPDATE, not SELECT)
    database.prepare("INSERT INTO app_users (id, organization_id, email, full_name, role) VALUES ('__role_test__', 'org_alisio_001', '__test__', '__test__', 'owner')").run();
    database.prepare("DELETE FROM app_users WHERE id = '__role_test__'").run();
  } catch {
    // CHECK constraint is old — need to recreate app_users table
    console.log('[DB] Migrating app_users table to new role system');
    try {
      const existingUsers = database.prepare('SELECT * FROM app_users').all();
      database.exec('DROP TABLE IF EXISTS audit_log'); // depends on app_users
      database.exec('DROP TABLE IF EXISTS app_users');
      database.exec(`
        CREATE TABLE app_users (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          full_name TEXT NOT NULL,
          phone TEXT,
          password_hash TEXT,
          avatar_url TEXT,
          role TEXT NOT NULL DEFAULT 'receptionist' CHECK (role IN ('owner', 'director', 'manager', 'receptionist', 'housekeeper', 'maintenance', 'accountant')),
          is_active INTEGER NOT NULL DEFAULT 1,
          last_login TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      database.exec(`
        CREATE TABLE audit_log (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES app_users(id),
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          old_values TEXT,
          new_values TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      // Re-insert with role mapping
      const ins = database.prepare('INSERT INTO app_users (id, organization_id, email, full_name, role, is_active, last_login, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
      for (const u of existingUsers as any[]) {
        let newRole = u.role;
        if (newRole === 'admin') newRole = 'owner';
        if (newRole === 'operator') newRole = 'receptionist';
        ins.run(u.id, u.organization_id, u.email, u.full_name, newRole, u.is_active, u.last_login, u.created_at, u.updated_at);
      }
      console.log('[DB] app_users table migrated successfully');
    } catch (e: any) {
      console.error('[DB] app_users migration error:', e.message);
    }
  }

  // --- Migration: add new columns if missing ---
  try {
    const userCols = database.prepare("PRAGMA table_info(app_users)").all() as { name: string }[];
    const hasPasswordHash = userCols.some((c: any) => c.name === 'password_hash');
    if (!hasPasswordHash) {
      database.exec("ALTER TABLE app_users ADD COLUMN password_hash TEXT");
      database.exec("ALTER TABLE app_users ADD COLUMN phone TEXT");
      database.exec("ALTER TABLE app_users ADD COLUMN avatar_url TEXT");
      console.log('[DB] Added password_hash, phone, avatar_url to app_users');
    }
  } catch (e: any) {
    console.log('[DB] columns migration note:', e.message);
  }

  // --- Migration: set default password for users without one ---
  try {
    const usersWithoutPw: any[] = database.prepare(
      "SELECT id FROM app_users WHERE password_hash IS NULL OR password_hash = ''"
    ).all();
    if (usersWithoutPw.length > 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      const stmt = database.prepare('UPDATE app_users SET password_hash = ? WHERE id = ?');
      for (const u of usersWithoutPw) {
        stmt.run(hash, u.id);
      }
      console.log(`[DB] Set default password for ${usersWithoutPw.length} user(s)`);
    }
  } catch (e: any) {
    console.log('[DB] password hash note:', e.message);
  }

  // --- Migration: create sessions table if not exists ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create user_permissions table if not exists ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, permission)
    )
  `);

  // --- Migration: create booking_sources table if not exists ---
  const bsExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='booking_sources'"
  ).get();
  if (!bsExists) {
    console.log('[DB] Creating booking_sources table');
    database.exec(`
      CREATE TABLE booking_sources (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        icon_letter TEXT NOT NULL DEFAULT '?',
        color TEXT NOT NULL DEFAULT '#6c7086',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed default sources
    const propRow = database.prepare("SELECT id FROM properties LIMIT 1").get() as any;
    if (propRow) {
      const ins = database.prepare('INSERT INTO booking_sources (id, property_id, name, code, icon_letter, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
      ins.run('bs_direct',      propRow.id, 'Direct',       'direct',      'D', '#22c55e', 1);
      ins.run('bs_phone',       propRow.id, 'Phone',        'phone',       '📞', '#3b82f6', 2);
      ins.run('bs_whatsapp',    propRow.id, 'WhatsApp',     'whatsapp',    'W', '#25D366', 3);
      ins.run('bs_booking_com', propRow.id, 'Booking.com',  'booking_com', 'B', '#003580', 4);
      ins.run('bs_airbnb',      propRow.id, 'Airbnb',       'airbnb',      'A', '#FF5A5F', 5);
      ins.run('bs_other_ota',   propRow.id, 'Other OTA',    'other_ota',   'O', '#f59e0b', 6);
      console.log('[DB] Seeded 6 default booking sources');
    }
  }

  // --- Migration: remove CHECK constraint from reservations.source ---
  // Check if reservations table still has the old CHECK constraint
  try {
    const createSql = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='reservations'"
    ).get() as any;
    if (createSql?.sql && createSql.sql.includes("CHECK (source IN")) {
      console.log('[DB] Removing CHECK constraint from reservations.source');
      const rows = database.prepare('SELECT * FROM reservations').all();
      database.exec('DROP TABLE reservations');
      database.exec(`
        CREATE TABLE reservations (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
          unit_id TEXT NOT NULL REFERENCES units(id),
          guest_id TEXT NOT NULL REFERENCES guests(id),
          rate_plan_id TEXT REFERENCES rate_plans(id),
          check_in TEXT NOT NULL,
          check_out TEXT NOT NULL,
          nights INTEGER NOT NULL DEFAULT 1,
          adults INTEGER NOT NULL DEFAULT 1,
          children INTEGER NOT NULL DEFAULT 0,
          infants INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
          payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'payment_requested', 'prepaid', 'paid')),
          source TEXT NOT NULL DEFAULT 'direct',
          total_price REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'CZK',
          notes TEXT,
          internal_notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      // Restore data
      const insR = database.prepare('INSERT INTO reservations (id, property_id, unit_id, guest_id, rate_plan_id, check_in, check_out, nights, adults, children, infants, status, payment_status, source, total_price, currency, notes, internal_notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const r of rows as any[]) {
        insR.run(r.id, r.property_id, r.unit_id, r.guest_id, r.rate_plan_id, r.check_in, r.check_out, r.nights, r.adults, r.children, r.infants, r.status, r.payment_status, r.source, r.total_price, r.currency, r.notes, r.internal_notes, r.created_at, r.updated_at);
      }
      // Recreate indexes
      database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_property ON reservations(property_id)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_unit ON reservations(unit_id)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_guest ON reservations(guest_id)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(check_in, check_out)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status)');
      console.log('[DB] reservations table migrated (source CHECK removed)');
    }
  } catch (e: any) {
    console.error('[DB] reservations migration error:', e.message);
  }

  // --- Migration: create reservation_groups table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS reservation_groups (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      guest_id TEXT NOT NULL REFERENCES guests(id),
      group_type TEXT NOT NULL DEFAULT 'custom' CHECK (group_type IN ('building', 'custom')),
      building_id TEXT REFERENCES buildings(id),
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      nights INTEGER NOT NULL DEFAULT 1,
      total_price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CZK',
      source TEXT NOT NULL DEFAULT 'direct',
      status TEXT NOT NULL DEFAULT 'confirmed',
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: add group_id column to reservations ---
  try {
    const resCols = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    if (!resCols.some((c: any) => c.name === 'group_id')) {
      database.exec("ALTER TABLE reservations ADD COLUMN group_id TEXT REFERENCES reservation_groups(id) ON DELETE SET NULL");
      console.log('[DB] Added group_id column to reservations');
    }
  } catch (e: any) {
    console.log('[DB] group_id migration note:', e.message);
  }

  // --- Migration: add commission_percent to booking_sources ---
  try {
    const bsCols = database.prepare("PRAGMA table_info(booking_sources)").all() as { name: string }[];
    if (!bsCols.some((c: any) => c.name === 'commission_percent')) {
      database.exec("ALTER TABLE booking_sources ADD COLUMN commission_percent REAL NOT NULL DEFAULT 0");
      // Set default commissions for known OTAs
      database.exec("UPDATE booking_sources SET commission_percent = 15 WHERE code = 'booking_com'");
      database.exec("UPDATE booking_sources SET commission_percent = 15 WHERE code = 'airbnb'");
      database.exec("UPDATE booking_sources SET commission_percent = 10 WHERE code = 'other_ota'");
      console.log('[DB] Added commission_percent to booking_sources');
    }
  } catch (e: any) {
    console.log('[DB] commission_percent migration note:', e.message);
  }

  // --- Migration: add commission_amount to reservations ---
  try {
    const resCols2 = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    if (!resCols2.some((c: any) => c.name === 'commission_amount')) {
      database.exec("ALTER TABLE reservations ADD COLUMN commission_amount REAL NOT NULL DEFAULT 0");
      console.log('[DB] Added commission_amount to reservations');
    }
  } catch (e: any) {
    console.log('[DB] commission_amount migration note:', e.message);
  }

  // --- Migration: add guest_page_token to reservations ---
  try {
    const resCols3 = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    if (!resCols3.some((c: any) => c.name === 'guest_page_token')) {
      database.exec("ALTER TABLE reservations ADD COLUMN guest_page_token TEXT");
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_guest_token ON reservations(guest_page_token)");
      // Generate tokens for existing confirmed/checked_in bookings
      const existing = database.prepare("SELECT id FROM reservations WHERE status IN ('confirmed', 'checked_in') AND (guest_page_token IS NULL OR guest_page_token = '')").all() as any[];
      if (existing.length > 0) {
        const upd = database.prepare("UPDATE reservations SET guest_page_token = ? WHERE id = ?");
        for (const r of existing) {
          const token = generateGuestToken();
          upd.run(token, r.id);
        }
        console.log(`[DB] Generated guest_page_token for ${existing.length} existing booking(s)`);
      }
      console.log('[DB] Added guest_page_token to reservations');
    }
  } catch (e: any) {
    console.log('[DB] guest_page_token migration note:', e.message);
  }

  // --- Migration: create reservation_guests table (for check-in registration) ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS reservation_guests (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create additional_services table ---
  const asExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='additional_services'"
  ).get();
  if (!asExists) {
    database.exec(`
      CREATE TABLE additional_services (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        name_en TEXT,
        description TEXT,
        price REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'CZK',
        unit_label TEXT NOT NULL DEFAULT 'за послугу',
        icon TEXT,
        category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('food', 'wellness', 'sport', 'entertainment', 'other')),
        available_for TEXT NOT NULL DEFAULT 'all' CHECK (available_for IN ('glamping', 'resort', 'camping', 'all')),
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed default services
    const propRow = database.prepare("SELECT id FROM properties LIMIT 1").get() as any;
    if (propRow) {
      const insAS = database.prepare('INSERT INTO additional_services (id, property_id, name, name_en, description, price, unit_label, icon, category, available_for, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      insAS.run('svc_breakfast', propRow.id, 'Сніданок', 'Breakfast', 'Повноцінний сніданок у ресторані', 250, 'за особу/день', '🍳', 'food', 'all', 1);
      insAS.run('svc_sauna', propRow.id, 'Сауна', 'Sauna', 'Фінська сауна (2 години)', 800, 'за сеанс', '🧖', 'wellness', 'all', 2);
      insAS.run('svc_pool', propRow.id, 'Купіль', 'Plunge Pool', 'Холодна купіль після сауни', 400, 'за сеанс', '🏊', 'wellness', 'all', 3);
      insAS.run('svc_bicycle', propRow.id, 'Велосипед', 'Bicycle', 'Оренда велосипеда на день', 350, 'за день', '🚲', 'sport', 'all', 4);
      insAS.run('svc_ebike', propRow.id, 'Електровелосипед', 'E-Bike', 'Оренда електровелосипеда на день', 600, 'за день', '⚡', 'sport', 'all', 5);
      insAS.run('svc_sup', propRow.id, 'SUP борд', 'SUP Board', 'Оренда SUP борду', 300, 'за годину', '🏄', 'sport', 'all', 6);
      insAS.run('svc_bbq', propRow.id, 'Мангал', 'BBQ Grill', 'Набір для барбекю з вугіллям', 200, 'за раз', '🔥', 'food', 'camping', 7);
      insAS.run('svc_parking', propRow.id, 'Паркінг VIP', 'VIP Parking', 'Закрите паркомісце біля будівлі', 150, 'за день', '🅿️', 'other', 'resort', 8);
      console.log('[DB] Created additional_services table with 8 services');
    }
  }

  // --- Migration: create service_orders table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS service_orders (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1,
      total_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create unit_type_photos table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS unit_type_photos (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      unit_type_id TEXT NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create property_photos table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS property_photos (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      caption TEXT,
      photo_type TEXT NOT NULL DEFAULT 'common' CHECK (photo_type IN ('building', 'territory', 'common', 'aerial')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create guest_page_config table ---
  const gpcExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='guest_page_config'"
  ).get();
  if (!gpcExists) {
    database.exec(`
      CREATE TABLE guest_page_config (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        unit_type_id TEXT NOT NULL UNIQUE REFERENCES unit_types(id) ON DELETE CASCADE,
        amenities TEXT,
        check_in_instructions TEXT,
        external_amenities TEXT,
        faq_items TEXT,
        rules TEXT,
        wifi_network TEXT DEFAULT 'ALiSiO_Guest',
        wifi_password TEXT DEFAULT 'ALiSiO2026!',
        restaurant_name TEXT DEFAULT 'Ресторан ALiSiO',
        restaurant_hours TEXT,
        restaurant_menu_url TEXT,
        useful_info TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed default configs for all existing unit types
    const utRows = database.prepare('SELECT id, category_id FROM unit_types').all() as any[];
    const catRows = database.prepare('SELECT id, type FROM categories').all() as any[];
    const catTypeMap: Record<string, string> = {};
    for (const c of catRows) catTypeMap[c.id] = c.type;

    const defaultRestaurantHours = '📅 Щодня: 8:00 – 22:00\n🍳 Сніданок: 8:00 – 10:30\n🥘 Обід: 12:00 – 15:00\n🍷 Вечеря: 18:00 – 22:00';

    const glampingAmenities = JSON.stringify([
      { icon: '🛏️', name: 'Комфортне ліжко' }, { icon: '🚿', name: 'Душ' }, { icon: '🚽', name: 'Туалет' },
      { icon: '❄️', name: 'Кондиціонер' }, { icon: '🔥', name: 'Опалення' }, { icon: '☕', name: 'Чайник' },
      { icon: '🧊', name: 'Міні-холодильник' }, { icon: '📶', name: 'Wi-Fi' }, { icon: '🌿', name: 'Тераса' },
      { icon: '🔒', name: 'Замок' }, { icon: '🧴', name: 'Рушники' }, { icon: '💡', name: 'Освітлення' },
    ]);
    const resortAmenities = JSON.stringify([
      { icon: '🛏️', name: 'Комфортне ліжко' }, { icon: '🚿', name: 'Душ/Ванна' }, { icon: '🚽', name: 'Туалет' },
      { icon: '❄️', name: 'Кондиціонер' }, { icon: '📺', name: 'Телевізор' }, { icon: '🔥', name: 'Опалення' },
      { icon: '☕', name: 'Чайник/Кавоварка' }, { icon: '🧊', name: 'Холодильник' }, { icon: '📶', name: 'Wi-Fi' },
      { icon: '🧴', name: 'Рушники та білизна' }, { icon: '🪥', name: 'Косметика' }, { icon: '🔒', name: 'Сейф' },
    ]);
    const campingAmenities = JSON.stringify([
      { icon: '⛺', name: 'Місце для намету' }, { icon: '🔌', name: 'Електрика 220V' },
      { icon: '🚿', name: 'Спільний душ' }, { icon: '🚽', name: 'Спільний туалет' },
      { icon: '🚰', name: 'Вода' }, { icon: '📶', name: 'Wi-Fi' },
      { icon: '🅿️', name: 'Паркомісце' }, { icon: '🔥', name: 'Місце для вогнища' },
    ]);

    const defaultFaq = JSON.stringify([
      { q: 'Як дістатися до комплексу?', a: 'ALiSiO Resort & Glamping знаходиться в Лугачовіце. GPS: 49.1122°N, 17.7531°E. Від Брно ~1.5 год, від Праги ~3.5 год. Безкоштовна парковка.' },
      { q: 'О котрій годині заселення та виселення?', a: 'Заселення з 15:00, виселення до 10:00. Ранній заїзд / пізній виїзд за запитом.' },
      { q: 'Чи можна з тваринами?', a: 'Так, у деяких типах. 200 CZK/ніч. Повідомте заздалегідь.' },
      { q: 'Чи є сніданок?', a: 'Не включено, але можна замовити. Ресторан з 8:00.' },
      { q: 'Де магазин?', a: 'Penny Market / COOP — 5 хв їзди. Базові товари — на рецепції.' },
      { q: 'Чи є дитяче ліжечко?', a: 'Так, безкоштовно за запитом.' },
    ]);
    const defaultRules = JSON.stringify([
      { icon: '🔇', text: 'Насолоджуйся тишею — не вмикай музику та не галасуй.' },
      { icon: '🤝', text: 'Поважай сусідів — зберігай тишу протягом перебування на території.' },
      { icon: '🚗', text: 'Не перевищуй швидкість на локації більш ніж 20 км/год.' },
      { icon: '🍃', text: 'Бережи природу — не залишай їжу та сміття на вулиці.' },
      { icon: '🌲', text: 'Шануй ліс — не ламай дерева і не пали дрова з лісу. Їх завжди можна привезти з собою чи придбати у нас.' },
      { icon: '🗑️', text: 'Не спалюй сміття в багатті. Для нього у будинку є симпатичний сміттєвий бак.' },
      { icon: '🐾', text: 'Слідкуй за своїми тваринами — ти несеш відповідальність за своїх чотирилапих друзів та шкоду, яку вони можуть завдати.' },
      { icon: '🚭', text: 'Не пали, будь ласка, в будинку. Оселі мають пахнути свіжістю та лісом.' },
      { icon: '✨', text: 'Залишай чистоту — щоб наступні гості теж відчули затишок.' },
    ]);
    const defaultUsefulInfo = JSON.stringify([
      { icon: '🏪', title: 'Магазини', desc: 'Penny Market та COOP — 5 хв їзди.' },
      { icon: '🏥', title: 'Аптека та лікарня', desc: 'Аптека в центрі (5 хв). Лікарня — Злін (25 хв).' },
      { icon: '🏔️', title: 'Пішохідні маршрути', desc: 'Маршрути прямо від комплексу. Карти на рецепції.' },
      { icon: '🚴', title: 'Велосипедні маршрути', desc: 'Велодоріжки вздовж річки. Оренда на рецепції.' },
      { icon: '♨️', title: 'Курортна зона', desc: 'Лугачовіце — курорт з мінеральними джерелами.' },
      { icon: '🎭', title: 'Екскурсії', desc: 'Замок Бухлов, зоопарк Лешна. Запитуйте на рецепції.' },
    ]);

    const insGPC = database.prepare(`
      INSERT INTO guest_page_config (unit_type_id, amenities, check_in_instructions, faq_items, rules, wifi_network, wifi_password, restaurant_name, restaurant_hours, useful_info)
      VALUES (?, ?, ?, ?, ?, 'ALiSiO_Guest', 'ALiSiO2026!', 'Ресторан ALiSiO', ?, ?)
    `);
    for (const ut of utRows) {
      const catType = catTypeMap[ut.category_id];
      const amenities = catType === 'glamping' ? glampingAmenities : catType === 'camping' ? campingAmenities : resortAmenities;
      const instructions = catType === 'glamping'
        ? 'Зустріч на рецепції. Ми покажемо ваш будиночок та розкажемо про територію.'
        : catType === 'camping'
        ? 'Зареєструйтесь на рецепції, вам покажуть ваше місце та видадуть картку доступу до санітарного блоку.'
        : 'Зустріч на рецепції будови. Ключі та інструктаж на місці.';
      insGPC.run(ut.id, amenities, instructions, defaultFaq, defaultRules, defaultRestaurantHours, defaultUsefulInfo);
    }
    console.log('[DB] Created guest_page_config table with defaults for', utRows.length, 'unit types');
  }

  // --- Migration: create ical_channels table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS ical_channels (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      channel_type TEXT NOT NULL CHECK (channel_type IN ('building', 'unit')),
      building_id TEXT REFERENCES buildings(id) ON DELETE CASCADE,
      unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
      source_code TEXT NOT NULL DEFAULT 'vrbo',
      ical_url TEXT,
      export_token TEXT UNIQUE,
      sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create ical_sync_log table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS ical_sync_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      channel_id TEXT NOT NULL REFERENCES ical_channels(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('success', 'error')),
      events_found INTEGER NOT NULL DEFAULT 0,
      events_created INTEGER NOT NULL DEFAULT 0,
      events_updated INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: add external_uid to reservations ---
  try {
    const resCols4 = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    if (!resCols4.some((c: any) => c.name === 'external_uid')) {
      database.exec("ALTER TABLE reservations ADD COLUMN external_uid TEXT");
      database.exec("CREATE INDEX IF NOT EXISTS idx_reservations_external_uid ON reservations(external_uid)");
      console.log('[DB] Added external_uid column to reservations');
    }
  } catch (e: any) {
    console.log('[DB] external_uid migration note:', e.message);
  }

  // --- Migration: add VRBO booking source ---
  try {
    const vrboExists = database.prepare("SELECT id FROM booking_sources WHERE code = 'vrbo'").get();
    if (!vrboExists) {
      const propRow = database.prepare("SELECT id FROM properties LIMIT 1").get() as any;
      if (propRow) {
        database.prepare(
          'INSERT INTO booking_sources (id, property_id, name, code, icon_letter, color, sort_order, commission_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run('bs_vrbo', propRow.id, 'VRBO', 'vrbo', 'V', '#1E40AF', 7, 8);
        console.log('[DB] Added VRBO booking source');
      }
    }
  } catch (e: any) {
    console.log('[DB] VRBO source migration note:', e.message);
  }

  // ═══════════════════════════════════════════════════════
  // FINANCE MODULE TABLES
  // ═══════════════════════════════════════════════════════

  // --- Migration: create business_units table ---
  const buExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='business_units'"
  ).get();
  if (!buExists) {
    database.exec(`
      CREATE TABLE business_units (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        unit_type TEXT,
        is_shared INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed BUs from Proj_Map
    const orgRow = database.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    if (orgRow) {
      const insBU = database.prepare('INSERT INTO business_units (id, organization_id, name, unit_type, is_shared, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
      insBU.run('bu_glamping',   orgRow.id, 'Глемпинг',    'Глемпинг',                0, 1);
      insBU.run('bu_budova_fd',  orgRow.id, 'Будова F/D',  'Міні-готель / 16 номерів', 0, 2);
      insBU.run('bu_camping',    orgRow.id, 'Кемпинг',     'Кемпинг',                 0, 3);
      insBU.run('bu_restaurant', orgRow.id, 'Ресторан',    'Ресторан',                0, 4);
      insBU.run('bu_sauna',      orgRow.id, 'Сауна',       'Сауна',                   0, 5);
      insBU.run('bu_pool',       orgRow.id, 'Купель',      'Купель',                  0, 6);
      insBU.run('bu_shared',     orgRow.id, 'Загальне',    'Shared / HQ',             1, 7);
      insBU.run('bu_review',     orgRow.id, 'На перегляд', 'Списання / review',       0, 8);
      console.log('[DB] Created business_units table with 8 BUs');
    }
  }

  // --- Migration: create expense_categories table ---
  const ecExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_categories'"
  ).get();
  if (!ecExists) {
    database.exec(`
      CREATE TABLE expense_categories (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        std_group TEXT NOT NULL DEFAULT 'OPEX',
        pnl_line TEXT NOT NULL,
        include_in_pnl INTEGER NOT NULL DEFAULT 1,
        include_in_cash INTEGER NOT NULL DEFAULT 1,
        alloc_method TEXT NOT NULL DEFAULT 'DIRECT',
        is_capex INTEGER NOT NULL DEFAULT 0,
        icon TEXT,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed categories from Cat_Map
    const orgRow = database.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    if (orgRow) {
      const insEC = database.prepare('INSERT INTO expense_categories (id, organization_id, name, std_group, pnl_line, include_in_pnl, include_in_cash, alloc_method, is_capex, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      // Revenue
      insEC.run('ec_accommodation', orgRow.id, 'Проживання',        'Revenue',    'Проживання',       1, 1, 'DIRECT', 0, '🏠', '#22c55e', 1);
      insEC.run('ec_sauna',         orgRow.id, 'Сауна',             'Revenue',    'Сауна',            1, 1, 'DIRECT', 0, '🧖', '#f59e0b', 2);
      insEC.run('ec_restaurant',    orgRow.id, 'Ресторан',          'Revenue',    'Ресторан',         1, 1, 'DIRECT', 0, '🍽️', '#ef4444', 3);
      insEC.run('ec_breakfast',     orgRow.id, 'Сніданки',          'Revenue',    'Сніданки',         1, 1, 'DIRECT', 0, '🍳', '#f97316', 4);
      insEC.run('ec_other_rev',     orgRow.id, 'Інші доходи',       'Revenue',    'Інші доходи',      1, 1, 'DIRECT', 0, '💰', '#84cc16', 5);
      // COGS
      insEC.run('ec_food',          orgRow.id, 'Харчування',        'COGS',       'Харчування',       1, 1, 'DIRECT', 0, '🥘', '#dc2626', 6);
      insEC.run('ec_products',      orgRow.id, 'Продукти',          'COGS',       'Продукти',         1, 1, 'DIRECT', 0, '🛒', '#b91c1c', 7);
      insEC.run('ec_variable',      orgRow.id, 'Змінні витрати',    'COGS',       'Змінні витрати',   1, 1, 'DIRECT', 0, '📦', '#991b1b', 8);
      // OPEX
      insEC.run('ec_rent',          orgRow.id, 'Оренда',            'OPEX',       'Оренда',           1, 1, 'RENT',          0, '🏢', '#6366f1', 9);
      insEC.run('ec_utilities',     orgRow.id, 'Комунальні',        'OPEX',       'Комунальні',       1, 1, 'UTILITIES',     0, '🔌', '#8b5cf6', 10);
      insEC.run('ec_payroll',       orgRow.id, 'Зарплати',          'OPEX',       'Зарплати',         1, 1, 'SHARED_PAYROLL', 0, '👥', '#a855f7', 11);
      insEC.run('ec_marketing',     orgRow.id, 'Маркетинг',         'OPEX',       'Маркетинг',        1, 1, 'HQ',            0, '📢', '#ec4899', 12);
      insEC.run('ec_professional',  orgRow.id, 'Профпослуги',       'OPEX',       'Профпослуги',      1, 1, 'HQ',            0, '💼', '#14b8a6', 13);
      insEC.run('ec_other_exp',     orgRow.id, 'Інші витрати',      'OPEX',       'Інші витрати',     1, 1, 'HQ',            0, '📋', '#6b7280', 14);
      insEC.run('ec_consumables',   orgRow.id, 'Розхідники',        'OPEX',       'Розхідники',       1, 1, 'HQ',            0, '🧹', '#78716c', 15);
      // Taxes
      insEC.run('ec_taxes',         orgRow.id, 'Податки',           'Taxes',      'Податки',          1, 1, 'HQ',            0, '🏛️', '#334155', 16);
      // CAPEX
      insEC.run('ec_capex',         orgRow.id, 'Стройка',           'CAPEX',      'CAPEX',            0, 1, 'NONE',          1, '🏗️', '#0ea5e9', 17);
      // Financing
      insEC.run('ec_investors',     orgRow.id, 'Інвесторські кошти','Financing',  'Інвесторські кошти', 0, 1, 'NONE',        0, '🏦', '#059669', 18);
      // Transfer
      insEC.run('ec_transfer',      orgRow.id, 'Переказ',           'Transfer',   'Переказ',          0, 1, 'NONE',          0, '↔️', '#94a3b8', 19);
      console.log('[DB] Created expense_categories table with 19 categories from Cat_Map');
    }
  }

  // --- Migration: create expenses table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES expense_categories(id),
      business_unit_id TEXT REFERENCES business_units(id),
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CZK',
      description TEXT NOT NULL,
      counterparty TEXT,
      method TEXT CHECK (method IN ('cash', 'card', 'bank_transfer', 'invoice')),
      expense_date TEXT NOT NULL,
      month TEXT NOT NULL,
      receipt_id TEXT,
      needs_review INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by TEXT REFERENCES app_users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_org ON expenses(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_bu ON expenses(business_unit_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_month ON expenses(month)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)');

  // --- Migration: create receipts table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create cost_allocations table ---
  const caExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='cost_allocations'"
  ).get();
  if (!caExists) {
    database.exec(`
      CREATE TABLE cost_allocations (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        month TEXT NOT NULL,
        alloc_method TEXT NOT NULL,
        business_unit_id TEXT NOT NULL REFERENCES business_units(id),
        percentage REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(organization_id, month, alloc_method, business_unit_id)
      )
    `);
    // Seed default allocations from Allocations sheet (for 2026-03)
    const orgRow = database.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    if (orgRow) {
      const insAlloc = database.prepare('INSERT INTO cost_allocations (organization_id, month, alloc_method, business_unit_id, percentage) VALUES (?, ?, ?, ?, ?)');
      const allocData: [string, string, number][] = [
        // [method, bu_id, percentage]
        ['RENT',           'bu_glamping', 30],  ['RENT',           'bu_budova_fd', 30], ['RENT',           'bu_camping', 5],
        ['RENT',           'bu_restaurant', 20], ['RENT',           'bu_sauna', 10],    ['RENT',           'bu_pool', 5],
        ['UTILITIES',      'bu_glamping', 25],  ['UTILITIES',      'bu_budova_fd', 30], ['UTILITIES',      'bu_camping', 5],
        ['UTILITIES',      'bu_restaurant', 20], ['UTILITIES',      'bu_sauna', 15],    ['UTILITIES',      'bu_pool', 5],
        ['SHARED_PAYROLL', 'bu_glamping', 30],  ['SHARED_PAYROLL', 'bu_budova_fd', 25], ['SHARED_PAYROLL', 'bu_camping', 5],
        ['SHARED_PAYROLL', 'bu_restaurant', 20], ['SHARED_PAYROLL', 'bu_sauna', 10],    ['SHARED_PAYROLL', 'bu_pool', 10],
        ['HQ',             'bu_glamping', 30],  ['HQ',             'bu_budova_fd', 25], ['HQ',             'bu_camping', 5],
        ['HQ',             'bu_restaurant', 20], ['HQ',             'bu_sauna', 10],    ['HQ',             'bu_pool', 10],
      ];
      for (const [method, buId, pct] of allocData) {
        insAlloc.run(orgRow.id, '2026-03', method, buId, pct);
      }
      console.log('[DB] Created cost_allocations table with default allocations');
    }
  }

  // ═══════════════════════════════════════════════════════
  // FINANCE MODULE PHASE 2 TABLES
  // ═══════════════════════════════════════════════════════

  // --- Migration: create capex_items table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS capex_items (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      business_unit_id TEXT REFERENCES business_units(id),
      name TEXT NOT NULL,
      asset_type TEXT DEFAULT 'construction',
      amount REAL NOT NULL,
      counterparty TEXT,
      purchase_date TEXT NOT NULL,
      month TEXT NOT NULL,
      useful_life_months INTEGER,
      depreciation_monthly REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_by TEXT REFERENCES app_users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_capex_org ON capex_items(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_capex_bu ON capex_items(business_unit_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_capex_month ON capex_items(month)');

  // --- Migration: create accruals table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS accruals (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      business_unit_id TEXT REFERENCES business_units(id),
      category_id TEXT REFERENCES expense_categories(id),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      month TEXT NOT NULL,
      accrual_type TEXT NOT NULL DEFAULT 'expense',
      status TEXT NOT NULL DEFAULT 'pending',
      paid_expense_id TEXT REFERENCES expenses(id),
      notes TEXT,
      created_by TEXT REFERENCES app_users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_accruals_org ON accruals(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_accruals_month ON accruals(month)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_accruals_status ON accruals(status)');

  // --- Migration: create bank_statements table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS bank_statements (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      bank_name TEXT,
      account_number TEXT,
      period_from TEXT,
      period_to TEXT,
      total_transactions INTEGER NOT NULL DEFAULT 0,
      matched_transactions INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create bank_transactions table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      statement_id TEXT NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      transaction_date TEXT NOT NULL,
      amount REAL NOT NULL,
      counterparty TEXT,
      description TEXT,
      reference TEXT,
      matched_category_id TEXT REFERENCES expense_categories(id),
      matched_business_unit_id TEXT REFERENCES business_units(id),
      matched_expense_id TEXT REFERENCES expenses(id),
      match_status TEXT NOT NULL DEFAULT 'unmatched',
      confidence REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_bank_tx_statement ON bank_transactions(statement_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_bank_tx_status ON bank_transactions(match_status)');

  // --- Migration: add matched_payment_id to bank_transactions ---
  try {
    database.exec("ALTER TABLE bank_transactions ADD COLUMN matched_payment_id TEXT REFERENCES payments(id)");
  } catch { /* column already exists */ }

  // ═══════════════════════════════════════════════════════
  // PRICING MODULE
  // ═══════════════════════════════════════════════════════

  // --- Migration: create price_calendar table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS price_calendar (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      unit_type_id TEXT NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      base_price REAL NOT NULL DEFAULT 0,
      weekend_price REAL,
      min_stay INTEGER NOT NULL DEFAULT 1,
      max_stay INTEGER,
      closed INTEGER NOT NULL DEFAULT 0,
      cta INTEGER NOT NULL DEFAULT 0,
      ctd INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(unit_type_id, date)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_price_cal_ut ON price_calendar(unit_type_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_price_cal_date ON price_calendar(date)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_price_cal_ut_date ON price_calendar(unit_type_id, date)');

  // ═══════════════════════════════════════════════════════
  // CHANNEL MANAGER MODULE (Booking.com, Airbnb, VRBO...)
  // ═══════════════════════════════════════════════════════

  // --- Migration: create channel_connections table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS channel_connections (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      external_property_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      connection_types TEXT NOT NULL DEFAULT '[]',
      pricing_model TEXT NOT NULL DEFAULT 'Standard',
      credentials_id TEXT,
      last_synced_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_ch_conn_org ON channel_connections(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ch_conn_channel ON channel_connections(channel)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ch_conn_status ON channel_connections(status)');

  // --- Migration: create channel_credentials table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS channel_credentials (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      environment TEXT NOT NULL DEFAULT 'test',
      client_id TEXT NOT NULL DEFAULT '',
      client_secret TEXT NOT NULL DEFAULT '',
      access_token TEXT,
      token_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, channel, environment)
    )
  `);

  // --- Migration: create channel_room_mapping table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS channel_room_mapping (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      connection_id TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
      unit_type_id TEXT NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
      external_room_type_id TEXT NOT NULL DEFAULT '',
      external_rate_plan_id TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(connection_id, unit_type_id)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_ch_room_conn ON channel_room_mapping(connection_id)');

  // --- Migration: create ari_sync_queue table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS ari_sync_queue (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      connection_id TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
      sync_type TEXT NOT NULL DEFAULT 'full',
      unit_type_id TEXT,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      priority INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_queue_status ON ari_sync_queue(status)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_queue_conn ON ari_sync_queue(connection_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_queue_priority ON ari_sync_queue(priority, created_at)');

  // --- Migration: create ari_sync_log table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS ari_sync_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      connection_id TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
      direction TEXT NOT NULL DEFAULT 'outbound',
      endpoint TEXT NOT NULL DEFAULT '',
      request_body TEXT,
      response_status INTEGER,
      response_body TEXT,
      ruid TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_log_conn ON ari_sync_log(connection_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_log_created ON ari_sync_log(created_at)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_log_ruid ON ari_sync_log(ruid)');

  // --- Migration: add Booking.com fields to reservations ---
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN bcom_reservation_id TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN price_per_night_json TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN smoking_preference TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN promotions_applied TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN rate_rewriting_info TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN cancellation_policy TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN meal_plan TEXT");
  } catch { /* column already exists */ }

  // --- Migration: Renumber Building F rooms (F7..F23 → F1..F17) ---
  try {
    const hasOldF7 = database.prepare("SELECT id FROM units WHERE id = 'u_f7' AND building_id = 'bldg_f'").get();
    if (hasOldF7) {
      console.log('[DB] Renumbering Building F rooms: F7..F23 → F1..F17');
      const oldNums = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
      // Step 1: rename to temporary IDs/names to avoid conflicts
      for (const n of oldNums) {
        const newN = n - 6;
        database.prepare("UPDATE units SET id = ?, name = ?, code = ?, sort_order = ? WHERE id = ?")
          .run(`u_f_tmp${newN}`, `F${newN}`, `F${newN}`, newN, `u_f${n}`);
        // Also update FK references
        database.prepare("UPDATE reservations SET unit_id = ? WHERE unit_id = ?")
          .run(`u_f_tmp${newN}`, `u_f${n}`);
      }
      // Step 2: rename from temporary to final IDs
      for (let newN = 1; newN <= 17; newN++) {
        database.prepare("UPDATE units SET id = ? WHERE id = ?")
          .run(`u_f${newN}`, `u_f_tmp${newN}`);
        database.prepare("UPDATE reservations SET unit_id = ? WHERE unit_id = ?")
          .run(`u_f${newN}`, `u_f_tmp${newN}`);
      }
      console.log('[DB] Building F renumbered successfully');
    }
  } catch (e: any) {
    console.error('[DB] Building F renumbering error:', e.message);
  }

  // --- Migration: add city_tax fields to reservations ---
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN city_tax_amount REAL DEFAULT 0");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN city_tax_included INTEGER DEFAULT 0");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN city_tax_paid TEXT DEFAULT 'pending'");
  } catch { /* column already exists */ }

  // --- Migration: add city_tax_included_default to booking_sources ---
  try {
    database.exec("ALTER TABLE booking_sources ADD COLUMN city_tax_included_default INTEGER DEFAULT 0");
  } catch { /* column already exists */ }

  // --- Migration: booking_activity_log table ---
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS booking_activity_log (
        id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
      )
    `);
  } catch { /* already exists */ }

  // --- Migration: add internal_notes to reservations ---
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN internal_notes TEXT");
  } catch { /* column already exists */ }

  // --- Migration: guest_registrations table (multi-guest per reservation) ---
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS guest_registrations (
        id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL,
        guest_id TEXT NOT NULL,
        is_primary INTEGER DEFAULT 0,
        registered_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
        FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE
      )
    `);
  } catch { /* already exists */ }

  // --- Migration: add registration_status to reservations ---
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN registration_status TEXT DEFAULT 'not_registered'");
  } catch { /* column already exists */ }

  // --- Migration: add nationality to guests ---
  try {
    database.exec("ALTER TABLE guests ADD COLUMN nationality TEXT");
  } catch { /* column already exists */ }
}

// Generate a random 12-char token for guest pages
export function generateGuestToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function seedData(database: any) {
  const orgId = 'org_alisio_001';
  const propId = 'prop_main_001';
  const catGlamp = 'cat_glamping';
  const catResort = 'cat_resort';
  const catCamping = 'cat_camping';
  const bldgF = 'bldg_f';
  const bldgD = 'bldg_d';

  // Organization
  database.prepare('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)').run(orgId, 'ALiSiO Properties', 'alisio');

  // Property
  database.prepare('INSERT INTO properties (id, organization_id, name, slug, city, country) VALUES (?, ?, ?, ?, ?, ?)').run(propId, orgId, 'ALiSiO Resort & Glamping', 'alisio-main', 'Luhačovice', 'CZ');

  // Categories
  database.prepare('INSERT INTO categories (id, property_id, name, type, sort_order, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(catGlamp, propId, 'Glamping', 'glamping', 1, '🏕️', '#a78bfa');
  database.prepare('INSERT INTO categories (id, property_id, name, type, sort_order, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(catResort, propId, 'Resort', 'resort', 2, '🏨', '#60a5fa');
  database.prepare('INSERT INTO categories (id, property_id, name, type, sort_order, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(catCamping, propId, 'Camping', 'camping', 3, '⛺', '#34d399');

  // Buildings
  database.prepare('INSERT INTO buildings (id, category_id, property_id, name, code, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(bldgF, catResort, propId, 'Будова F (Standart)', 'F', 1);
  database.prepare('INSERT INTO buildings (id, category_id, property_id, name, code, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(bldgD, catResort, propId, 'Будова D (Econom)', 'D', 2);

  // Unit Types
  const utStealth = 'ut_stealth'; const utMirror = 'ut_mirror'; const utGlamp4 = 'ut_glamp4';
  const utF2 = 'ut_f2'; const utF3 = 'ut_f3'; const utF4 = 'ut_f4'; const utDeco = 'ut_deco';
  const utFB = 'ut_fb'; const utBB = 'ut_bb'; const utFR = 'ut_fr'; const utBR = 'ut_br';

  const insertUT = database.prepare('INSERT INTO unit_types (id, property_id, category_id, building_id, name, code, max_adults, base_occupancy, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertUT.run(utStealth, propId, catGlamp, null, 'Stealth House (2 місця)', 'STEALTH', 2, 2, 1);
  insertUT.run(utMirror, propId, catGlamp, null, 'Mirror House (2 місця)', 'MIRROR', 2, 2, 2);
  insertUT.run(utGlamp4, propId, catGlamp, null, '4-місний будинок', 'GLAMP4', 4, 2, 3);
  insertUT.run(utF2, propId, catResort, bldgF, 'F — 2-місний', 'F-2BED', 2, 2, 1);
  insertUT.run(utF3, propId, catResort, bldgF, 'F — 3-місний', 'F-3BED', 3, 2, 2);
  insertUT.run(utF4, propId, catResort, bldgF, 'F — 4-місний', 'F-4BED', 4, 2, 3);
  insertUT.run(utDeco, propId, catResort, bldgD, 'D — Econom', 'D-ECO', 3, 2, 4);
  insertUT.run(utFB, propId, catCamping, null, 'FB — Front Pitch', 'FB', 4, 2, 1);
  insertUT.run(utBB, propId, catCamping, null, 'BB — Between Pitch', 'BB', 4, 2, 2);
  insertUT.run(utFR, propId, catCamping, null, 'FR — Restaurant Pitch', 'FR', 4, 2, 3);
  insertUT.run(utBR, propId, catCamping, null, 'BR — River Pitch', 'BR', 4, 2, 4);

  // Units
  const insertUnit = database.prepare('INSERT INTO units (id, unit_type_id, property_id, category_id, building_id, name, code, beds, zone, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  // Glamping - Stealth (3)
  for (let i = 1; i <= 3; i++) insertUnit.run(`u_st${i}`, utStealth, propId, catGlamp, null, `Stealth ${i}`, `ST${i}`, 2, null, i);
  // Glamping - Mirror (2)
  for (let i = 1; i <= 2; i++) insertUnit.run(`u_mr${i}`, utMirror, propId, catGlamp, null, `Mirror ${i}`, `MR${i}`, 2, null, 10 + i);
  // Glamping - 4-person (3)
  for (let i = 1; i <= 3; i++) insertUnit.run(`u_g4_${i}`, utGlamp4, propId, catGlamp, null, `4-місний ${i}`, `G4-${i}`, 4, null, 20 + i);

  // Resort F rooms (renumbered from 1)
  // Physical room order: old 7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 → new 1..17
  const fRoomMap: [number, string][] = [
    [1, utF2], [2, utF3], [3, utF3], [4, utF3], [5, utF3],
    [6, utF3], [7, utF3], [8, utF3], [9, utF3], [10, utF3],
    [11, utF4], [12, utF3], [13, utF3], [14, utF3], [15, utF3],
    [16, utF4], [17, utF2],
  ];
  const fBeds: Record<string, number> = { [utF2]: 2, [utF3]: 3, [utF4]: 4 };
  for (const [n, ut] of fRoomMap) {
    insertUnit.run(`u_f${n}`, ut, propId, catResort, bldgF, `F${n}`, `F${n}`, fBeds[ut], null, n);
  }

  // Resort D rooms (16)
  for (let i = 1; i <= 16; i++) insertUnit.run(`u_d${i}`, utDeco, propId, catResort, bldgD, `D${i}`, `D${i}`, 3, null, i);

  // Camping zones
  for (let i = 1; i <= 15; i++) insertUnit.run(`u_fb${i}`, utFB, propId, catCamping, null, `FB${i}`, `FB${i}`, 0, 'FB', i);
  for (let i = 16; i <= 40; i++) insertUnit.run(`u_bb${i}`, utBB, propId, catCamping, null, `BB${i}`, `BB${i}`, 0, 'BB', i);
  for (let i = 41; i <= 50; i++) insertUnit.run(`u_fr${i}`, utFR, propId, catCamping, null, `FR${i}`, `FR${i}`, 0, 'FR', i);
  for (let i = 51; i <= 70; i++) insertUnit.run(`u_br${i}`, utBR, propId, catCamping, null, `BR${i}`, `BR${i}`, 0, 'BR', i);

  // Rate Plans
  database.prepare('INSERT INTO rate_plans (id, property_id, name, code, pricing_model, priority) VALUES (?, ?, ?, ?, ?, ?)').run('rp_std', propId, 'Standard', 'STD', 'standard', 1);

  // Fees
  database.prepare('INSERT INTO fees_taxes (id, property_id, name, type, amount) VALUES (?, ?, ?, ?, ?)').run('fee_clean', propId, 'Прибирання', 'per_stay', 500);
  database.prepare('INSERT INTO fees_taxes (id, property_id, name, type, amount) VALUES (?, ?, ?, ?, ?)').run('fee_tax', propId, 'Туристичний збір', 'per_person_per_night', 50);

  // Admin user (owner)
  const defaultPasswordHash = bcrypt.hashSync('admin123', 10);
  database.prepare('INSERT INTO app_users (id, organization_id, email, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?, ?)').run('user_admin', orgId, 'admin@alisio.cz', 'Admin ALiSiO', 'owner', defaultPasswordHash);

  // Seed some guests
  const insertGuest = database.prepare('INSERT INTO guests (id, organization_id, first_name, last_name, email, phone, country) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insertGuest.run('g001', orgId, 'Jan', 'Novák', 'jan.novak@email.cz', '+420601234567', 'CZ');
  insertGuest.run('g002', orgId, 'Maria', 'Schmidt', 'maria.schmidt@email.de', '+491701234567', 'DE');
  insertGuest.run('g003', orgId, 'Олена', 'Ковальчук', 'olena@email.ua', '+380501234567', 'UA');
  insertGuest.run('g004', orgId, 'Peter', 'Brown', 'peter.b@email.com', '+441234567890', 'GB');
  insertGuest.run('g005', orgId, 'Anna', 'Dvořáková', 'anna.d@email.cz', '+420777654321', 'CZ');
  insertGuest.run('g006', orgId, 'Klaus', 'Weber', 'k.weber@email.de', '+491601234567', 'DE');
  insertGuest.run('g007', orgId, 'Tomáš', 'Horák', 'tomas.h@email.cz', '+420608765432', 'CZ');
  insertGuest.run('g008', orgId, 'Ірина', 'Петренко', 'iryna.p@email.ua', '+380671234567', 'UA');

  // Seed some reservations
  const insertRes = database.prepare('INSERT INTO reservations (id, property_id, unit_id, guest_id, check_in, check_out, nights, adults, children, status, payment_status, source, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  // Note: F-room IDs use new numbering (F7→F1, F8→F2, F12→F6, F17→F11)
  insertRes.run('r001', propId, 'u_st1', 'g001', '2026-03-11', '2026-03-15', 4, 2, 0, 'confirmed', 'paid', 'booking_com', 8800);
  insertRes.run('r002', propId, 'u_mr1', 'g002', '2026-03-11', '2026-03-14', 3, 2, 1, 'checked_in', 'paid', 'direct', 6200);
  insertRes.run('r003', propId, 'u_g4_2', 'g003', '2026-03-13', '2026-03-18', 5, 3, 1, 'tentative', 'prepaid', 'airbnb', 12500);
  insertRes.run('r004', propId, 'u_f2', 'g004', '2026-03-09', '2026-03-12', 3, 2, 0, 'checked_in', 'paid', 'direct', 5400);
  insertRes.run('r005', propId, 'u_f6', 'g005', '2026-03-12', '2026-03-16', 4, 2, 2, 'confirmed', 'payment_requested', 'booking_com', 9200);
  insertRes.run('r006', propId, 'u_f11', 'g006', '2026-03-14', '2026-03-20', 6, 4, 0, 'confirmed', 'unpaid', 'phone', 15600);
  insertRes.run('r007', propId, 'u_d3', 'g007', '2026-03-10', '2026-03-12', 2, 1, 0, 'checked_out', 'paid', 'direct', 2800);
  insertRes.run('r008', propId, 'u_d7', 'g008', '2026-03-11', '2026-03-18', 7, 2, 1, 'confirmed', 'prepaid', 'whatsapp', 11200);

  // Seed demo payments / transactions
  const insertPay = database.prepare('INSERT INTO payments (id, reservation_id, amount, method, type, status, paid_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  // r001 Jan Novák — fully paid by card (8800)
  insertPay.run('pay001', 'r001', 8800, 'card', 'full', 'completed', '2026-02-20', 'Booking.com payment');
  // r002 Maria Schmidt — fully paid cash at check-in (6200)
  insertPay.run('pay002', 'r002', 6200, 'cash', 'full', 'completed', '2026-03-11', 'Cash at front desk');
  // r003 Олена Ковальчук — prepaid 30% via bank transfer (3750 of 12500)
  insertPay.run('pay003', 'r003', 3750, 'bank_transfer', 'deposit', 'completed', '2026-02-15', 'Передплата 30%');
  // r004 Peter Brown — fully paid by card (5400)
  insertPay.run('pay004', 'r004', 5400, 'card', 'full', 'completed', '2026-03-09', 'Card payment');
  // r007 Tomáš Horák — paid cash (2800)
  insertPay.run('pay005', 'r007', 2800, 'cash', 'full', 'completed', '2026-03-10', 'Cash');
  // r008 Ірина Петренко — prepaid 50% via invoice (5600 of 11200)
  insertPay.run('pay006', 'r008', 5600, 'invoice', 'deposit', 'completed', '2026-02-28', 'Фактура передплата 50%');
}
