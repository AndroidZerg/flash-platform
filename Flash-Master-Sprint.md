# Flash Platform — Master Sprint
## One-Shot Build: Infrastructure + Shop + Menu + Safe

**Run with:** `claude --dangerously-skip-permissions`
**Estimated build time:** 5-6 hours
**Output:** A Node.js server deployable to Render, serving 3 product PWAs, backed by Supabase

---

## WHAT WE'RE BUILDING

A platform with 3 products sharing one backend:

1. **FlashShop** (Priority 1) — Pop-up event marketplace. Vendors photograph products, AI describes them, buyers browse.
2. **FlashMenu** (Priority 2) — Event food/vendor discovery. Same as FlashShop but for food items with dietary info.
3. **FlashSafe** (Priority 3) — Missing person/pet safety. Rebrand of existing SnapSafe prototype.

All 3 share the Flash Core Engine: capture → AI analyze → structure → format → distribute.

---

## TECH STACK

| Layer | Tech | Why |
|-------|------|-----|
| Server | Node.js + Express | Simple, proven, Render-native |
| Database | Supabase (PostgreSQL) | Managed, free tier, realtime, RLS |
| Photo Storage | Supabase Storage | S3-compatible, permanent URLs, free 1GB |
| AI Vision | Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`) | Cheapest vision model |
| Payments | Stripe Checkout Sessions | Server-side, no client-side secrets |
| Hosting | Render Web Service | Zero-downtime deploys, env vars, custom domains |
| Frontend | Vanilla HTML/CSS/JS (PWA per product) | No build step, fast, works everywhere |

---

## ARCHITECTURE RULES (NON-NEGOTIABLE)

1. **The Render server is STATELESS.** No data stored on the filesystem. Everything in Supabase.
2. **ALL secrets in environment variables.** Never in code. Use `process.env.X` everywhere.
3. **ALL API calls to Anthropic and Stripe go through the server.** Client NEVER sees API keys.
4. **Photos stored in Supabase Storage**, not base64 in the database (base64 bloats the DB).
5. **Subdomain routing:** The server serves different PWA frontends based on the hostname subdomain (shop.X, menu.X, safe.X). For local dev, use query param `?product=shop` as fallback.

---

## ENVIRONMENT VARIABLES

```env
# .env.example (NEVER commit actual values)
PORT=3000
NODE_ENV=development

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...  # Server-side key (full access, bypasses RLS)
SUPABASE_ANON_KEY=eyJhbGci...     # Client-side key (respects RLS, safe to expose)

# Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...

# Stripe  
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
APP_DOMAIN=flashlens.io           # or localhost:3000 for dev
```

---

## FILE STRUCTURE

```
flash-platform/
├── server.js                      # Express entry point
├── package.json
├── .env.example
├── render.yaml                    # Render infrastructure config
│
├── core/                          # FLASH CORE ENGINE (shared)
│   ├── supabase.js                # Supabase client (server-side, service_role)
│   ├── anthropic.js               # Anthropic client + prompt router
│   ├── stripe.js                  # Stripe client
│   ├── storage.js                 # Photo upload to Supabase Storage
│   ├── prompts/
│   │   ├── product.js             # FlashShop: product listing
│   │   ├── food.js                # FlashMenu: food/dish item
│   │   └── person.js              # FlashSafe: missing person/pet
│   └── middleware/
│       └── subdomain.js           # Routes requests by subdomain
│
├── api/                           # API ROUTES
│   ├── health.js                  # GET /api/health
│   ├── events.js                  # CRUD /api/events
│   ├── vendors.js                 # CRUD /api/vendors + session auth
│   ├── items.js                   # CRUD /api/items + AI analysis trigger
│   ├── analyze.js                 # POST /api/analyze (Anthropic proxy)
│   ├── checkout.js                # POST /api/checkout (Stripe session)
│   └── webhooks/
│       └── stripe.js              # POST /api/webhooks/stripe
│
├── public/
│   ├── shop/                      # FLASHSHOP PWA
│   │   ├── index.html             # Complete FlashShop SPA
│   │   ├── manifest.json
│   │   └── sw.js
│   │
│   ├── menu/                      # FLASHMENU PWA
│   │   ├── index.html             # Complete FlashMenu SPA
│   │   ├── manifest.json
│   │   └── sw.js
│   │
│   ├── safe/                      # FLASHSAFE PWA
│   │   ├── index.html             # Complete FlashSafe SPA (rebrand of SnapSafe)
│   │   ├── manifest.json
│   │   └── sw.js
│   │
│   └── landing/                   # Landing page (root domain)
│       └── index.html
│
└── database/
    └── migrations/
        └── 001_initial_schema.sql # Full schema (run in Supabase SQL editor)
```

---

## DATABASE SCHEMA

Create these tables in Supabase SQL editor:

```sql
-- Organizations (for B2B accounts)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_email TEXT,
  plan TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Events (universal container for all products)
CREATE TABLE events (
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
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','ended','archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_events_join_code ON events(join_code);
CREATE INDEX idx_events_status ON events(status);

-- Vendors / Contributors
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  booth_location TEXT,
  status TEXT DEFAULT 'preview' CHECK (status IN ('preview','paid','active','suspended')),
  stripe_payment_id TEXT,
  paid_at TIMESTAMPTZ,
  session_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_vendors_event ON vendors(event_id);
CREATE INDEX idx_vendors_session ON vendors(session_token);

-- Items (universal listing unit)
CREATE TABLE items (
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
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','listed','sold','claimed','removed')),
  search_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  listed_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ
);
CREATE INDEX idx_items_event ON items(event_id);
CREATE INDEX idx_items_vendor ON items(vendor_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_search ON items USING gin(to_tsvector('english', coalesce(search_text,'')));

-- Payments
CREATE TABLE payments (
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

-- Audit log
CREATE TABLE audit_log (
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
CREATE INDEX idx_audit_event ON audit_log(event_id);

-- FlashSafe specific: person/pet profiles (not tied to events)
CREATE TABLE profiles (
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

-- FlashSafe: snap sessions (photos + AI descriptions for profiles)
CREATE TABLE snaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  photo_url TEXT,
  ai_description JSONB NOT NULL DEFAULT '{}',
  flyer_desc_url TEXT,
  flyer_photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE snaps ENABLE ROW LEVEL SECURITY;

-- RLS: Public read for active/listed data, service_role for writes
CREATE POLICY "public_read_events" ON events FOR SELECT USING (status IN ('active','ended'));
CREATE POLICY "service_write_events" ON events FOR ALL USING (true);

CREATE POLICY "public_read_vendors" ON vendors FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = vendors.event_id AND events.status IN ('active','ended'))
);
CREATE POLICY "service_write_vendors" ON vendors FOR ALL USING (true);

CREATE POLICY "public_read_items" ON items FOR SELECT USING (status IN ('listed','sold'));
CREATE POLICY "service_write_items" ON items FOR ALL USING (true);

CREATE POLICY "service_only_payments" ON payments FOR ALL USING (true);
CREATE POLICY "service_write_profiles" ON profiles FOR ALL USING (true);
CREATE POLICY "service_write_snaps" ON snaps FOR ALL USING (true);
```

Also create a Supabase Storage bucket:
- Bucket name: `photos`
- Public: Yes (listed item photos need public URLs)
- File size limit: 5MB
- Allowed MIME types: image/jpeg, image/png, image/webp

---

## AI PROMPT TEMPLATES

### FlashShop: Product Listing (`core/prompts/product.js`)
```
Analyze this product photo for a marketplace listing. Identify the product specifically: brand, model, edition, version, year if applicable. Assess visible condition honestly.

Return ONLY valid JSON:
{"title":"Product name with identifiers","category":"Primary category","description":"2-3 sentence buyer-facing description","condition":"New|Like New|Very Good|Good|Acceptable|Poor","condition_notes":"Specific visible condition details","brand":"Brand or null","notable_features":"Key selling points","suggested_price_range":"$X-Y or null","keywords":["search","keywords"]}
```

### FlashMenu: Food Item (`core/prompts/food.js`)
```
Analyze this food photo for a vendor menu. Describe the dish appetizingly. Identify ingredients if visible.

Return ONLY valid JSON:
{"title":"Dish name","description":"Appetizing 1-2 sentence description","category":"Appetizer|Entree|Dessert|Drink|Side|Snack","dietary_info":["vegetarian","gluten-free","vegan","dairy-free","nut-free"],"spice_level":"Mild|Medium|Hot|none","estimated_calories":"range or null","keywords":["search","keywords"]}
```

### FlashSafe: Person/Pet (`core/prompts/person.js`)
```
Analyze this photo of a {type} for a missing {type} flyer. Be specific about colors, patterns, clothing. {type_context}

Return ONLY valid JSON:
{"clothing_top":"desc","clothing_bottom":"desc","shoes":"desc","accessories":"desc or null","estimated_height":"height","hair_description":"desc","eye_color":"color","distinguishing_features":"desc or null","summary":"Full paragraph description"}
```

---

## PHASE-BY-PHASE BUILD

### PHASE 1: Project Scaffold + Server (20 min)
```
1. Initialize Node.js project (npm init)
2. Install dependencies:
   - express (web server)
   - @supabase/supabase-js (database + storage)
   - @anthropic-ai/sdk (AI vision — OR use fetch directly)
   - stripe (payments)
   - multer (file upload handling)
   - cors (CORS headers)
   - dotenv (env vars for local dev)
3. Create server.js with:
   - Express app
   - Subdomain routing middleware (reads hostname, maps to product)
   - Static file serving per product (public/shop/, public/menu/, public/safe/)
   - API route mounting (/api/*)
   - /api/health endpoint
   - Error handling middleware
   - Starts on process.env.PORT || 3000
4. Create .env.example with all required vars
5. Create render.yaml for Render deploy config
```

### PHASE 2: Flash Core Engine (30 min)
```
1. core/supabase.js — Create Supabase client using SUPABASE_URL + SUPABASE_SERVICE_KEY
2. core/storage.js — Functions to:
   - uploadPhoto(buffer, filename) → returns public URL from Supabase Storage
   - generateThumbnail(buffer, maxWidth=400) → resize using sharp or canvas, upload, return URL
   - NOTE: Install 'sharp' for image resizing (npm install sharp)
3. core/anthropic.js — Functions to:
   - analyzeImage(base64, promptTemplate) → calls Anthropic Haiku vision, returns parsed JSON
   - Uses robust JSON extraction (find first { and last })
   - Accepts prompt template parameter (product, food, person)
4. core/prompts/*.js — Export prompt template strings for each product type
5. core/stripe.js — Stripe client initialized with STRIPE_SECRET_KEY
6. core/middleware/subdomain.js — Express middleware that:
   - Reads req.hostname, extracts subdomain
   - Maps subdomain to product name
   - Falls back to query param ?product=X for local dev
   - Sets req.product = 'shop' | 'menu' | 'safe' | 'landing'
```

### PHASE 3: API Routes — Events & Vendors (30 min)
```
1. api/events.js:
   - POST /api/events — Create event (name, type, location, dates, join_code, vendor_fee)
     - Auto-generate join_code if not provided (6 char alphanumeric)
     - Returns event with join_code
   - GET /api/events/:joinCode — Get event by join code (public)
   - PUT /api/events/:id — Update event (organizer only, check session)
   - GET /api/events/:id/stats — Return vendor count, item count, listed item count

2. api/vendors.js:
   - POST /api/vendors — Join event as vendor (event_id, display_name, booth_location)
     - Creates vendor with session_token
     - Returns vendor with session_token (client stores this for auth)
   - GET /api/vendors/me?session=TOKEN — Get vendor by session token (includes their items)
   - PUT /api/vendors/:id?session=TOKEN — Update vendor info
   - Middleware: validateVendorSession(req, res, next) — checks session_token
```

### PHASE 4: API Routes — Items & AI Analysis (40 min)
```
1. api/items.js:
   - POST /api/items — Create item with photo
     - Accepts multipart form: photo file + event_id + vendor_id + session_token + type
     - Validates vendor session
     - Uploads photo to Supabase Storage → gets photo_url
     - Generates thumbnail → gets thumbnail_url
     - Calls core/anthropic.js with appropriate prompt template based on type
     - Inserts item into Supabase with ai_description, photo_url, thumbnail_url
     - Builds search_text from ai_description fields
     - Returns full item
   - GET /api/items?event_id=X&status=listed — Browse items (public, for buyers)
     - Supports: ?q=search, ?category=X, ?min_price=X, ?max_price=X, ?sort=newest|price_asc|price_desc
     - Uses PostgreSQL full-text search on search_text
   - PUT /api/items/:id — Update item (vendor edits title, description, price, etc.)
     - Validates vendor session
     - If status changed to 'approved', item is ready for listing
   - PUT /api/items/:id/list — Mark as listed (only after vendor payment)
   - PUT /api/items/:id/sold — Mark as sold
   - DELETE /api/items/:id — Remove item

2. api/analyze.js (standalone endpoint for FlashSafe which doesn't use the items flow):
   - POST /api/analyze — Direct AI analysis without creating an item
     - Accepts: base64 image + type (person/pet)
     - Returns: AI description JSON
     - Used by FlashSafe for snap analysis
```

### PHASE 5: API Routes — Payments (25 min)
```
1. api/checkout.js:
   - POST /api/checkout — Create Stripe Checkout Session
     - Accepts: vendor_id, session_token
     - Looks up vendor and event to get vendor_fee_cents
     - Creates Stripe Checkout Session with:
       - line_items: [{ price_data: { unit_amount: vendor_fee_cents }, quantity: 1 }]
       - mode: 'payment'
       - success_url: https://{shop.flashlens.io}/vendor?session={token}&paid=true
       - cancel_url: https://{shop.flashlens.io}/vendor?session={token}&paid=false
       - metadata: { vendor_id, event_id }
     - Inserts payment record (status: pending)
     - Returns: { checkout_url: session.url }

2. api/webhooks/stripe.js:
   - POST /api/webhooks/stripe — Stripe webhook handler
     - Verifies webhook signature using STRIPE_WEBHOOK_SECRET
     - On checkout.session.completed:
       - Update payment status to 'succeeded'
       - Update vendor status to 'paid' → 'active'
       - Update all vendor's 'approved' items to 'listed'
       - Log to audit_log
     - CRITICAL: Use express.raw() for this route (Stripe needs raw body for signature verification)
```

### PHASE 6: FlashShop Frontend (60 min)
```
Build public/shop/index.html — Complete single-page PWA.

Design: Dark theme. DM Sans font. Orange (#ff6b2b) accent for CTAs.

Screens:

1. LANDING — Event join screen
   - Input: "Enter event code" or "Scan QR"
   - Fetches GET /api/events/:joinCode
   - Shows event name, dates, vendor/item counts
   - Two buttons: "Join as Vendor" / "Browse as Buyer"

2. VENDOR JOIN — Name + booth
   - Input: Display name, booth location (2 fields)
   - POST /api/vendors → stores session_token in localStorage
   - Redirects to Vendor Dashboard

3. VENDOR DASHBOARD — Item management
   - Shows all vendor's items (GET /api/vendors/me?session=TOKEN)
   - Each item: thumbnail, title, price, status badge (draft/approved/listed/sold)
   - "Add Item" button → Camera screen
   - "Preview Marketplace" button → shows their items as buyers would see
   - "Go Live" button (when items are approved but vendor hasn't paid)
   - Status bar: "Preview Mode" (yellow) or "Live" (green)

4. CAMERA — Photograph item
   - <input type="file" accept="image/*" capture="environment">
   - Preview after capture
   - "Use This Photo" → POST /api/items (multipart with photo)
   - Shows loading spinner during upload + AI analysis

5. ITEM EDIT — Review AI description
   - Shows AI-generated: title, description, category, condition, suggested price
   - All fields editable
   - Price input (required): vendor sets their price
   - Price note dropdown: OBO / Firm / Negotiable / Free
   - Vendor notes: free text
   - "Approve" button → PUT /api/items/:id (status: approved)
   - "Add Another" button → back to camera (fast loop)

6. MARKETPLACE PREVIEW — Vendor sees buyer view
   - Shows vendor's items in grid layout (same as buyer browse)
   - Banner: "This is how buyers will see your booth"
   - Stats: "X vendors live · Y buyers browsing" (from /api/events/:id/stats)
   - "Go Live — $9.99" button → POST /api/checkout → redirects to Stripe

7. BUYER BROWSE — Marketplace grid
   - Grid of listed items: thumbnail, title, price, vendor name
   - Search bar (full text)
   - Filter: category dropdown, price range
   - Sort: newest, price low→high, price high→low
   - No login, no account, zero friction

8. ITEM DETAIL — Full listing view
   - Full-size photo
   - Title, description, condition, price
   - Vendor name, booth location
   - "I'm interested" → could trigger a notification (future) or just show booth directions
   - Back button

9. EVENT CREATE — Organizer form (simple for MVP)
   - Name, description, location, start/end datetime, vendor fee
   - Creates event, shows QR code + join code
   - QR code: generate using a QR API like https://api.qrserver.com/v1/create-qr-code/?data=URL
```

### PHASE 7: FlashMenu Frontend (30 min)
```
Build public/menu/index.html — EXTENDS FlashShop with food-specific UI.

FlashMenu is 80% identical to FlashShop. Key differences:

1. Item type is 'food' instead of 'product'
2. Uses food.js prompt template instead of product.js
3. Item Edit screen shows:
   - Dish name (title)
   - Description
   - Category: Appetizer / Entree / Dessert / Drink / Side / Snack
   - Dietary tags: checkboxes for vegetarian, vegan, gluten-free, dairy-free, nut-free
   - Spice level indicator
   - Price (required)
   - NO condition field (food doesn't have "condition")
4. Buyer browse shows dietary filter icons
5. Color accent: Green (#2ec47a) instead of Orange
6. Branding: "FlashMenu" in header, green theme
7. Event type: 'menu' instead of 'marketplace'

Clone the shop/index.html, modify the differences above.
The same API endpoints are used — the 'type' field on items distinguishes product vs food.
```

### PHASE 8: FlashSafe Frontend (40 min)
```
Build public/safe/index.html — Rebrand of existing SnapSafe prototype.

FlashSafe uses a DIFFERENT flow than Shop/Menu because it doesn't use the event system.
It uses the profiles + snaps tables instead.

Screens:

1. HOME — Dashboard
   - Shows person/pet profiles (GET profiles by owner_session from localStorage)
   - "Emergency Mode" big red button
   - "Add Person" button
   - Settings gear icon

2. ADD PERSON — Profile form
   - Type dropdown: Child, Teen, Adult, Elder, Dog, Cat, Other
   - Name, DOB, Height, Ethnicity/Breed, Eye Color
   - Guardian name, Guardian phone
   - POST /api/safe/profiles (stores owner_session from localStorage)

3. CAMERA — Take a snap
   - Same camera UI as FlashShop
   - On capture: POST /api/safe/snaps with photo + profile_id
   - Server: uploads photo, calls Anthropic with person.js prompt, returns description

4. PROCESSING — AI result
   - Shows description card (clothing, height, hair, eyes)
   - "Looks Good" → saves snap
   - "Retake" → back to camera

5. EMERGENCY MODE — Two steps:
   Step 1: Select who is missing (checkboxes for each profile with a snap)
   Step 2: Read-aloud script (bullet points) + Share buttons
   - "Share Description Only" → generates flyer image using Canvas API, shares via navigator.share()
   - "Share With Photo" → generates flyer with photo, shares
   - "Call 911" button
   - Script adapts based on type (child/adult/dog/etc.)
   - High contrast, large text, red/white theme
   - Screen stays on (navigator.wakeLock)

6. SETTINGS
   - No API key needed (server proxies everything now!)
   - Reminder time setting (stored in localStorage, uses Notification API)
   - Delete all data

Flyer generation uses Canvas API (same as existing SnapSafe) but renders client-side.
The difference from SnapSafe v3: photos and profiles are stored in Supabase (not just localStorage),
and AI calls go through the server proxy (no API key on client).

Add these API routes for FlashSafe:
   - POST /api/safe/profiles — Create profile
   - GET /api/safe/profiles?owner=SESSION — List profiles
   - PUT /api/safe/profiles/:id — Update profile
   - DELETE /api/safe/profiles/:id — Delete profile
   - POST /api/safe/snaps — Create snap (upload photo + AI analyze)
   - GET /api/safe/snaps?profile_id=X — Get snaps for profile
```

### PHASE 9: Landing Page + Polish (20 min)
```
1. Build public/landing/index.html:
   - Hero: "FlashLens — Capture it. Know it. Share it."
   - Three product cards: FlashShop, FlashMenu, FlashSafe
   - Each links to its subdomain
   - Clean, dark design, Flash branding

2. Polish:
   - Wire up all navigation flows end-to-end
   - Add error handling everywhere (API failures show user-friendly messages)
   - Add loading states for all API calls
   - Test: create event → vendor joins → photos → AI → edit → approve → pay → live → buyer browses
   - Test: FlashSafe → add person → snap → AI → emergency mode → share
   - Handle edge cases: no items, event ended, payment failed, AI returned bad JSON
```

---

## RENDER DEPLOYMENT CONFIG

```yaml
# render.yaml
services:
  - type: web
    name: flash-gateway
    runtime: node
    region: oregon
    plan: starter
    rootDir: .
    buildCommand: npm install
    startCommand: node server.js
    healthCheckPath: /api/health
    envVars:
      - key: NODE_ENV
        value: production
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_KEY
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: STRIPE_SECRET_KEY
        sync: false
      - key: STRIPE_WEBHOOK_SECRET
        sync: false
      - key: APP_DOMAIN
        sync: false
```

---

## STRIPE WEBHOOK NOTE

The Stripe webhook endpoint MUST use `express.raw()` not `express.json()`. Set this up BEFORE the global JSON parser:

```javascript
// In server.js — BEFORE app.use(express.json())
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// THEN the global JSON parser
app.use(express.json({ limit: '10mb' }));
```

---

## SUCCESS CRITERIA

The sprint is complete when:

**FlashShop:**
- [ ] Organizer creates event, gets QR code and join code
- [ ] Vendor scans QR / enters code, joins with name + booth
- [ ] Vendor photographs items, gets AI descriptions
- [ ] Vendor edits descriptions, sets prices, approves items
- [ ] Vendor sees marketplace preview with stats
- [ ] Vendor pays $9.99 via Stripe, items go live
- [ ] Buyer on DIFFERENT device opens marketplace, browses, searches, filters
- [ ] Buyer views item detail with vendor booth location
- [ ] Vendor marks items as sold

**FlashMenu:**
- [ ] Same flow as FlashShop but with food-specific UI
- [ ] Dietary info displayed on browse cards
- [ ] Green accent theme

**FlashSafe:**
- [ ] Add person/pet profiles with type selection
- [ ] Take photo, get AI description via server proxy
- [ ] Emergency mode: select who's missing, read script, share flyer
- [ ] Flyer generates correctly for child/adult/pet types
- [ ] No API key needed on client (server proxies everything)

**Infrastructure:**
- [ ] All data in Supabase (survives Render redeploy)
- [ ] All photos in Supabase Storage (permanent URLs)
- [ ] No secrets in client-side code
- [ ] /api/health returns 200 with database connection status
- [ ] Subdomain routing works (or ?product= fallback for dev)

---

## HOW TO RUN THIS SPRINT

```bash
# 1. Create project directory
mkdir flash-platform && cd flash-platform

# 2. Start Claude Code
claude --dangerously-skip-permissions

# 3. First prompt:
```

> Read the master sprint document. Build the Flash Platform following Phases 1-9 in order. This is a Node.js + Express server deployed to Render, with Supabase for database and storage, Anthropic Haiku for AI vision (server-proxied), and Stripe for payments. Build all 3 products: FlashShop (marketplace), FlashMenu (food discovery), and FlashSafe (missing person safety). Each product is a separate PWA in public/shop/, public/menu/, and public/safe/. They share the Flash Core Engine in core/ and API routes in api/. Follow the architecture rules: stateless server, all data in Supabase, all secrets in env vars, no client-side API keys. Go.

---

*Master Sprint — Flash Platform v1*
*Pham Industries / Flash Technologies*
*Estimated build time: 5-6 hours*
