-- ============================================================
-- ALiSiO PMS — Full Database Schema
-- Run this in Supabase SQL Editor to create all tables
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Organizations ──────────────────────────────────────────
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Prague',
  default_currency TEXT NOT NULL DEFAULT 'CZK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Properties ─────────────────────────────────────────────
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'CZ',
  phone TEXT,
  email TEXT,
  check_in_time TIME NOT NULL DEFAULT '15:00',
  check_out_time TIME NOT NULL DEFAULT '10:00',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

-- ─── Categories ─────────────────────────────────────────────
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('glamping', 'resort', 'camping')),
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Buildings / SubGroups ──────────────────────────────────
CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Unit Types ─────────────────────────────────────────────
CREATE TABLE unit_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  max_adults INT NOT NULL DEFAULT 2,
  max_children INT NOT NULL DEFAULT 2,
  max_occupancy INT NOT NULL DEFAULT 4,
  base_occupancy INT NOT NULL DEFAULT 2,
  beds_single INT NOT NULL DEFAULT 0,
  beds_double INT NOT NULL DEFAULT 1,
  beds_sofa INT NOT NULL DEFAULT 0,
  extra_bed_available BOOLEAN NOT NULL DEFAULT FALSE,
  amenities TEXT[],
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Units ──────────────────────────────────────────────────
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  floor INT,
  zone TEXT,
  beds INT NOT NULL DEFAULT 2,
  room_status TEXT NOT NULL DEFAULT 'available' CHECK (room_status IN ('available', 'occupied', 'maintenance', 'blocked')),
  cleaning_status TEXT NOT NULL DEFAULT 'clean' CHECK (cleaning_status IN ('clean', 'dirty', 'in_progress')),
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, code)
);

-- ─── Rate Plans ─────────────────────────────────────────────
CREATE TABLE rate_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  pricing_model TEXT NOT NULL DEFAULT 'standard' CHECK (pricing_model IN ('standard', 'derived', 'obp', 'los')),
  currency TEXT NOT NULL DEFAULT 'CZK',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  cancellation_policy TEXT,
  meal_plan TEXT,
  priority INT NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, code)
);

-- ─── Rate Plan ↔ Unit Type Link ─────────────────────────────
CREATE TABLE rate_plan_unit_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rate_plan_id UUID NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rate_plan_id, unit_type_id)
);

-- ─── Price Calendar ─────────────────────────────────────────
CREATE TABLE price_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rate_plan_unit_type_id UUID NOT NULL REFERENCES rate_plan_unit_types(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  weekend_price NUMERIC(10,2),
  min_stay INT DEFAULT 1,
  max_stay INT,
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  cta BOOLEAN NOT NULL DEFAULT FALSE,
  ctd BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rate_plan_unit_type_id, date)
);

-- ─── Occupancy Rules ────────────────────────────────────────
CREATE TABLE occupancy_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rate_plan_unit_type_id UUID NOT NULL REFERENCES rate_plan_unit_types(id) ON DELETE CASCADE,
  guest_count INT NOT NULL,
  modifier_type TEXT NOT NULL DEFAULT 'percentage' CHECK (modifier_type IN ('percentage', 'fixed')),
  modifier_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_absolute_price BOOLEAN NOT NULL DEFAULT FALSE,
  absolute_price NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rate_plan_unit_type_id, guest_count)
);

-- ─── Child Pricing Rules ────────────────────────────────────
CREATE TABLE child_pricing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rate_plan_unit_type_id UUID NOT NULL REFERENCES rate_plan_unit_types(id) ON DELETE CASCADE,
  age_from INT NOT NULL DEFAULT 0,
  age_to INT NOT NULL DEFAULT 17,
  rule_type TEXT NOT NULL DEFAULT 'free' CHECK (rule_type IN ('free', 'fixed', 'percentage', 'count_as_adult')),
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Restrictions ───────────────────────────────────────────
CREATE TABLE restrictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rate_plan_unit_type_id UUID NOT NULL REFERENCES rate_plan_unit_types(id) ON DELETE CASCADE,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  min_stay INT,
  max_stay INT,
  min_advance_days INT,
  max_advance_days INT,
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  cta BOOLEAN NOT NULL DEFAULT FALSE,
  ctd BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Promotions ─────────────────────────────────────────────
CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mobile', 'early_bird', 'last_minute', 'long_stay', 'promo_code')),
  discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  date_from DATE,
  date_to DATE,
  min_nights INT,
  max_nights INT,
  promo_code TEXT,
  usage_limit INT,
  usage_count INT NOT NULL DEFAULT 0,
  is_stackable BOOLEAN NOT NULL DEFAULT FALSE,
  priority INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  channels TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Fees & Taxes ───────────────────────────────────────────
CREATE TABLE fees_taxes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('per_night', 'per_stay', 'per_person', 'per_person_per_night', 'percentage')),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_included_in_price BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Guests ─────────────────────────────────────────────────
CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  country TEXT,
  city TEXT,
  address TEXT,
  document_type TEXT,
  document_number TEXT,
  date_of_birth DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Reservations ───────────────────────────────────────────
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  nights INT NOT NULL GENERATED ALWAYS AS (check_out - check_in) STORED,
  adults INT NOT NULL DEFAULT 1,
  children INT NOT NULL DEFAULT 0,
  infants INT NOT NULL DEFAULT 0,
  children_ages INT[],
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
  source TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'phone', 'whatsapp', 'booking_com', 'airbnb', 'other_ota')),
  rate_plan_id UUID REFERENCES rate_plans(id),
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'CZK',
  price_breakdown JSONB,
  notes TEXT,
  internal_notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_dates CHECK (check_out > check_in)
);

-- ─── Reservation Price Breakdown ────────────────────────────
CREATE TABLE reservation_breakdown (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('base', 'occupancy', 'child', 'fee', 'tax', 'promotion', 'discount')),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  details TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

-- ─── Payments ───────────────────────────────────────────────
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CZK',
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer', 'online')),
  type TEXT NOT NULL CHECK (type IN ('deposit', 'full', 'partial', 'refund')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Availability Blocks ────────────────────────────────────
CREATE TABLE availability_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  reason TEXT NOT NULL DEFAULT 'maintenance' CHECK (reason IN ('maintenance', 'owner_stay', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_block_dates CHECK (date_to > date_from)
);

-- ─── Users ──────────────────────────────────────────────────
CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'manager', 'operator', 'guest')),
  property_ids UUID[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Audit Log ──────────────────────────────────────────────
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES app_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Document Templates ─────────────────────────────────────
CREATE TABLE document_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('booking_confirmation', 'invoice', 'instructions', 'rules')),
  language TEXT NOT NULL DEFAULT 'cs',
  content TEXT NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Generated Documents ────────────────────────────────────
CREATE TABLE generated_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES document_templates(id),
  reservation_id UUID REFERENCES reservations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT,
  language TEXT NOT NULL DEFAULT 'cs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_category ON units(category_id);
CREATE INDEX idx_units_unit_type ON units(unit_type_id);
CREATE INDEX idx_reservations_property ON reservations(property_id);
CREATE INDEX idx_reservations_unit ON reservations(unit_id);
CREATE INDEX idx_reservations_guest ON reservations(guest_id);
CREATE INDEX idx_reservations_dates ON reservations(check_in, check_out);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_price_calendar_date ON price_calendar(date);
CREATE INDEX idx_price_calendar_rput ON price_calendar(rate_plan_unit_type_id);
CREATE INDEX idx_audit_log_org ON audit_log(organization_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_availability_blocks_unit ON availability_blocks(unit_id);
CREATE INDEX idx_availability_blocks_dates ON availability_blocks(date_from, date_to);
CREATE INDEX idx_guests_org ON guests(organization_id);
CREATE INDEX idx_guests_name ON guests(last_name, first_name);

-- ─── Overbooking Prevention Function ────────────────────────
CREATE OR REPLACE FUNCTION check_overbooking()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM reservations
    WHERE unit_id = NEW.unit_id
      AND id != COALESCE(NEW.id, uuid_generate_v4())
      AND status NOT IN ('cancelled', 'no_show')
      AND check_in < NEW.check_out
      AND check_out > NEW.check_in
  ) THEN
    RAISE EXCEPTION 'Overbooking detected: unit % is already booked for the requested dates', NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_overbooking
  BEFORE INSERT OR UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION check_overbooking();

-- ─── Updated_at trigger function ────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON unit_types FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON rate_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON price_calendar FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON restrictions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON guests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON document_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security ─────────────────────────────────────
-- Enable RLS on all tables (policies to be added based on auth setup)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_plan_unit_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupancy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fees_taxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_breakdown ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

-- Temporary: Allow all access for development (replace with proper policies in production)
CREATE POLICY "Allow all for development" ON organizations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON properties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON buildings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON unit_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON units FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON rate_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON rate_plan_unit_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON price_calendar FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON occupancy_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON child_pricing_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON restrictions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON promotions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON fees_taxes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON guests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON reservations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON reservation_breakdown FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON availability_blocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON app_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON document_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for development" ON generated_documents FOR ALL USING (true) WITH CHECK (true);
