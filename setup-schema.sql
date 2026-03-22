CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_email TEXT,
    plan TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('marketplace','menu','lostfound','safety','conference')),
    description TEXT,
    location_name TEXT,
    location_lat DOUBLE PRECISION,
    location_lng DOUBLE PRECISION,
    location_radius_m INTEGER DEFAULT 500,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    timezone TEXT DEFAULT 'America/Los_Angeles',
    join_code TEXT UNIQUE NOT NULL,
    vendor_fee_cents INTEGER DEFAULT 999,
    currency TEXT DEFAULT 'USD',
    allow_photos BOOLEAN DEFAULT true,
    require_payment BOOLEAN DEFAULT true,
    cover_image_url TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('pending','draft','active','ended','archived')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS idx_events_join_code ON events(join_code);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    booth_location TEXT,
    vendor_email TEXT,
    logo_url TEXT,
    type TEXT DEFAULT 'product',
    status TEXT DEFAULT 'preview' CHECK (status IN ('preview','paid','active','suspended')),
    stripe_payment_id TEXT,
    paid_at TIMESTAMPTZ,
    session_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
    created_at TIMESTAMPTZ DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS idx_vendors_event ON vendors(event_id);

CREATE INDEX IF NOT EXISTS idx_vendors_session ON vendors(session_token);

CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('product','food','lost_item','found_item','person','pet','asset')),
    photo_url TEXT,
    thumbnail_url TEXT,
    ai_description JSONB NOT NULL DEFAULT '{}',
    title TEXT,
    description TEXT,
    category TEXT,
    condition TEXT,
    price_cents INTEGER,
    price_note TEXT,
    vendor_notes TEXT,
    view_count INTEGER DEFAULT 0,
    optional_proteins TEXT,
    spice_options JSONB DEFAULT '[]',
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','listed','sold','claimed','removed')),
    search_text TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    listed_at TIMESTAMPTZ,
    sold_at TIMESTAMPTZ
  );

CREATE INDEX IF NOT EXISTS idx_items_event ON items(event_id);

CREATE INDEX IF NOT EXISTS idx_items_vendor ON items(vendor_id);

CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);

CREATE INDEX IF NOT EXISTS idx_items_search ON items USING gin(to_tsvector('english', coalesce(search_text,'')));

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES vendors(id),
    event_id UUID REFERENCES events(id),
    stripe_session_id TEXT,
    stripe_payment_intent_id TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded')),
    created_at TIMESTAMPTZ DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID,
    actor_type TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event_id);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_session TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('child','teen','adult','elder','dog','cat','other')),
    name TEXT NOT NULL,
    date_of_birth DATE,
    height TEXT,
    ethnicity TEXT,
    eye_color TEXT,
    guardian_name TEXT,
    guardian_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS snaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    photo_url TEXT,
    ai_description JSONB NOT NULL DEFAULT '{}',
    flyer_desc_url TEXT,
    flyer_photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  );

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE snaps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_events') THEN
      CREATE POLICY "public_read_events" ON events FOR SELECT TO anon USING (status IN ('active','ended'));
    END IF;
  END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_vendors') THEN
      CREATE POLICY "public_read_vendors" ON vendors FOR SELECT TO anon USING (
        EXISTS (SELECT 1 FROM events WHERE events.id = vendors.event_id AND events.status IN ('active','ended'))
      );
    END IF;
  END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_read_items') THEN
      CREATE POLICY "public_read_items" ON items FOR SELECT TO anon USING (status IN ('listed','sold'));
    END IF;
  END $$;