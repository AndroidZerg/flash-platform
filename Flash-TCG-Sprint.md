# FlashShop TCG Edition — Sprint Doc
## Bulk Card Scanning + Market Price Integration + Seed Data

---

## WHAT WE'RE BUILDING

A TCG-optimized mode within FlashShop that lets vendors list trading cards in bulk and gives buyers a searchable, price-compared card marketplace. The goal is a demo so polished that TCG players share it with each other at events.

### New Features:
1. **TCG Browse Mode** — Card-specific browse UI optimized for mobile (card image, name, set, rarity, condition, vendor price vs market price)
2. **Bulk Binder Scan** — Vendor photographs a binder page, AI identifies multiple cards, creates multiple listings
3. **Card Database Matching** — AI-identified cards auto-match against TCG databases for exact card data + market pricing
4. **Market Price Comparison** — Every listing shows vendor price alongside TCGPlayer market price
5. **Seed Data** — Pre-populate a demo TCG event with hundreds of real cards at realistic prices

---

## DATA SOURCES (All Free, All Legal)

### Pokémon TCG API — pokemontcg.io
- Free, no auth required for basic access (API key optional, increases rate limit)
- Endpoints:
  - GET https://api.pokemontcg.io/v2/cards?q=name:charizard — search by name
  - GET https://api.pokemontcg.io/v2/cards/{id} — get specific card
  - GET https://api.pokemontcg.io/v2/sets — list all sets
- Returns: card name, set, number, rarity, images (small + large), tcgplayer prices (market, low, mid, high)
- Image URLs are hotlinkable: images.pokemontcg.io/...
- Rate limit: 1000 requests/day without key, 20,000/day with free key

### Scryfall — api.scryfall.com  
- Free, no auth required
- Endpoints:
  - GET https://api.scryfall.com/cards/search?q=name — search
  - GET https://api.scryfall.com/cards/random — random card
  - GET https://api.scryfall.com/cards/{id} — specific card
- Returns: card name, set, rarity, mana cost, type, oracle text, images (small, normal, large, art_crop), prices (usd, usd_foil, eur, tix)
- Image URLs are hotlinkable
- Rate limit: 10 requests/second (generous)

### YGOProDeck — db.ygoprodeck.com/api/v7
- Free, no auth required
- Endpoints:
  - GET https://db.ygoprodeck.com/api/v7/cardinfo.php?name=Dark Magician
  - GET https://db.ygoprodeck.com/api/v7/cardinfo.php?num=50&offset=0 — paginated list
- Returns: card name, type, race, attribute, images, card_prices (tcgplayer, ebay, amazon, coolstuffinc)
- Rate limit: 20 requests/second

---

## TCG BROWSE UI — Mobile Optimized

### Card Listing Card (in browse grid)
```
┌────────────────────────────────┐
│ ┌──────┐                       │
│ │      │  Charizard VMAX       │
│ │ CARD │  Shining Fates        │
│ │ IMG  │  #074/072 · Secret    │
│ │      │  ━━━━━━━━━━━━━━━━━━   │
│ └──────┘  Near Mint             │
│           ──────────────────── │
│  Vendor:  $89.99               │
│  Market:  $95.00  ✅ Good Deal │
│  📍 Booth A-12                 │
└────────────────────────────────┘
```

### Key UI Elements:
- Card image on the left (use official TCG API images)
- Card name, set name, card number, rarity on the right
- Condition badge (Mint, Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged)
- Vendor price (large, bold)
- Market price (smaller, gray, from TCGPlayer/API data)
- Price comparison indicator:
  - Green "✅ Good Deal" if vendor price < market price
  - Gray "Fair Price" if within 10%
  - Yellow "⚠️ Above Market" if vendor price > 110% of market
- Vendor name and booth location
- Tap to expand: full card image, full card details, all vendor prices for same card

### Card Detail View (full screen)
- Large card image (fills width)
- Card name, set, number, rarity
- Condition with description
- Vendor price vs market price comparison bar
- "Other vendors selling this card" section (if multiple vendors have it)
- Vendor booth location + directions

### Search & Filter (critical for TCG)
- Search bar: searches card name, set name, card number
- Game filter: Pokémon | Magic | Yu-Gi-Oh! (tabs or dropdown)
- Rarity filter: Common, Uncommon, Rare, Ultra Rare, Secret Rare, etc.
- Price range slider
- Condition filter: NM, LP, MP, HP
- Sort: Price low→high, Price high→low, Newest, Popular, Market Value
- "Below Market" toggle — only show cards priced below market value

---

## DATABASE CHANGES

```sql
-- Add TCG-specific columns to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS tcg_game TEXT; -- pokemon, magic, yugioh
ALTER TABLE items ADD COLUMN IF NOT EXISTS tcg_card_id TEXT; -- API card ID for matching
ALTER TABLE items ADD COLUMN IF NOT EXISTS tcg_set_name TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS tcg_set_code TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS tcg_card_number TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS tcg_rarity TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS tcg_market_price_cents INTEGER; -- TCGPlayer market price
ALTER TABLE items ADD COLUMN IF NOT EXISTS tcg_condition TEXT; -- NM, LP, MP, HP, DMG
ALTER TABLE items ADD COLUMN IF NOT EXISTS tcg_image_url TEXT; -- Official card image from API
ALTER TABLE items ADD COLUMN IF NOT EXISTS tcg_card_data JSONB DEFAULT '{}'; -- Full card metadata

CREATE INDEX IF NOT EXISTS idx_items_tcg_game ON items(tcg_game);
CREATE INDEX IF NOT EXISTS idx_items_tcg_card_id ON items(tcg_card_id);
```

---

## SEED DATA PLAN

### Target: 1 TCG Convention Event with 500+ Card Listings

**Event: "Las Vegas Card Show — Spring 2026"**
- Location: Palace Station Hotel, Las Vegas
- Date: April 5-6, 2026
- Type: marketplace

**10 Vendors, ~50 cards each = 500 total cards**

### Vendor Breakdown:

**1. "Charizard Chaser" — Pokémon chase cards & vintage**
- 50 cards: Charizard variants, Pikachu promos, vintage Base Set holos
- Price range: $15-500
- Condition: mostly NM

**2. "Pallet Town Picks" — Pokémon modern singles**  
- 50 cards: Scarlet & Violet era, Paldea Evolved, Obsidian Flames hits
- Price range: $2-80
- Condition: NM (freshly pulled)

**3. "Sealed Vault" — Pokémon sealed product**
- 30 items: booster boxes, ETBs, special collections
- Price range: $25-400
- These won't be individual cards but sealed products — use product photos

**4. "The Gathering Place" — Magic: The Gathering staples**
- 50 cards: format staples (Modern, Commander, Standard)
- Price range: $5-200
- Mix of conditions

**5. "Commander's Quarters" — MTG Commander/EDH singles**
- 50 cards: popular commanders, staple includes, mana rocks
- Price range: $3-100
- Mostly NM

**6. "Vintage Vault MTG" — Magic reserved list & old border**
- 40 cards: dual lands, Power adjacent, old border foils
- Price range: $20-1000
- Conditions vary (LP to NM)

**7. "Duel Kingdom" — Yu-Gi-Oh! singles**
- 50 cards: meta staples, ghost rares, collector pieces
- Price range: $5-150
- Mix of conditions

**8. "Nostalgia Cards" — Yu-Gi-Oh! vintage**
- 40 cards: LOB 1st edition, MRD, early set holos
- Price range: $10-500
- Conditions vary

**9. "Budget Binder" — All games, bargain cards**
- 60 cards: mix of Pokémon, Magic, Yu-Gi-Oh! commons/uncommons/budget rares
- Price range: $1-10
- All conditions

**10. "Grade Kings" — PSA/CGC graded cards (all games)**
- 30 cards: graded slabs, PSA 9-10
- Price range: $50-2000
- Condition: Graded (PSA 8, 9, 10 / CGC 9, 9.5, 10)

---

## SEED SCRIPT APPROACH

The seed script should:

1. **Fetch real card data from the free APIs:**
   - Pokémon: Fetch 150 popular cards from pokemontcg.io (search for popular Pokémon names)
   - Magic: Fetch 100 popular cards from Scryfall (search for staples)
   - Yu-Gi-Oh!: Fetch 90 popular cards from YGOProDeck
   - Each API returns official images and market prices

2. **For each card, create a realistic vendor listing:**
   - Use the official card image as photo_url and tcg_image_url
   - Store the API's card data in tcg_card_data JSONB
   - Set tcg_market_price_cents from the API's pricing data
   - Set vendor price_cents at a realistic markup/discount from market:
     - 70-90% of market for "deals"
     - 95-105% of market for "fair price"
     - 110-130% of market for graded/premium
   - Assign realistic conditions (weighted: 50% NM, 25% LP, 15% MP, 10% HP)
   - Distribute across the 10 vendors based on their specialty

3. **Insert directly into Supabase** (no AI calls needed — the APIs provide all the data)

---

## API FETCH EXAMPLES

### Pokémon — Get Popular Cards
```javascript
// Fetch Charizard cards
const resp = await fetch('https://api.pokemontcg.io/v2/cards?q=name:charizard&orderBy=-tcgplayer.prices.holofoil.market&pageSize=10');
const data = await resp.json();
// data.data[0].images.large = card image URL
// data.data[0].tcgplayer.prices.holofoil.market = market price
// data.data[0].set.name = "Base Set"
// data.data[0].rarity = "Rare Holo"

// Popular Pokémon to search: charizard, pikachu, mewtwo, lugia, rayquaza, 
// umbreon, gengar, eevee, mew, blastoise, venusaur, dragonite, gardevoir,
// giratina, arceus, palkia, dialga, snorlax, tyranitar, salamence
```

### Magic — Get Popular Cards
```javascript
// Fetch format staples
const resp = await fetch('https://api.scryfall.com/cards/search?q=name%3A%22Lightning+Bolt%22&unique=prints&order=usd&dir=desc');
const data = await resp.json();
// data.data[0].image_uris.normal = card image URL
// data.data[0].prices.usd = market price (string, convert to float)
// data.data[0].set_name = "Alpha"
// data.data[0].rarity = "common"

// Popular Magic cards: Lightning Bolt, Counterspell, Sol Ring, 
// Rhystic Study, Smothering Tithe, Dockside Extortionist,
// Ragavan Nimble Pilferer, The One Ring, Sheoldred the Apocalypse,
// Atraxa Grand Unifier, Doubling Season, Cyclonic Rift,
// Force of Will, Mana Crypt, Chrome Mox, Thoughtseize
```

### Yu-Gi-Oh! — Get Popular Cards
```javascript
// Fetch specific card
const resp = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?name=Blue-Eyes White Dragon');
const data = await resp.json();
// data.data[0].card_images[0].image_url = card image
// data.data[0].card_prices[0].tcgplayer_price = market price
// data.data[0].type = "Normal Monster"

// Popular YGO cards: Blue-Eyes White Dragon, Dark Magician,
// Ash Blossom & Joyous Spring, Nibiru the Primal Being,
// Accesscode Talker, Apollousa, Infinite Impermanence,
// Called by the Grave, Effect Veiler, Ghost Belle,
// Pot of Prosperity, Forbidden Droplet, Zeus
```

---

## VENDOR PRICE STRATEGY

For realistic demo data, vendor prices should reflect real-world convention pricing:

```javascript
function getVendorPrice(marketPriceCents, vendorType, condition) {
  let multiplier = 1.0;
  
  // Vendor type affects pricing strategy
  if (vendorType === 'budget') multiplier = 0.70;        // Budget vendors price low
  if (vendorType === 'standard') multiplier = 0.90;       // Standard vendors slightly below market
  if (vendorType === 'premium') multiplier = 1.05;        // Premium vendors at/above market
  if (vendorType === 'graded') multiplier = 1.20;         // Graded cards command premium
  
  // Condition affects price
  if (condition === 'NM') multiplier *= 1.0;
  if (condition === 'LP') multiplier *= 0.85;
  if (condition === 'MP') multiplier *= 0.70;
  if (condition === 'HP') multiplier *= 0.50;
  if (condition === 'DMG') multiplier *= 0.30;
  
  // Add some randomness (+/- 10%)
  multiplier *= (0.90 + Math.random() * 0.20);
  
  return Math.round(marketPriceCents * multiplier);
}
```

---

## TCG-SPECIFIC AI PROMPT (for real vendor use — not seeding)

### Single Card Photo
```
Identify this trading card. Determine the game (Pokémon, Magic: The Gathering, or Yu-Gi-Oh!), the exact card name, set, card number, rarity, and visible condition.

Return ONLY valid JSON:
{
  "game": "pokemon|magic|yugioh",
  "card_name": "exact card name",
  "set_name": "set name",
  "card_number": "number/total",
  "rarity": "rarity level",
  "condition": "NM|LP|MP|HP|DMG",
  "condition_notes": "specific condition observations",
  "is_foil": true/false,
  "is_first_edition": true/false,
  "is_graded": true/false,
  "grade": "PSA 10, CGC 9.5, etc. or null",
  "language": "English|Japanese|etc",
  "keywords": ["searchable", "terms"]
}
```

### Binder Page Photo (Multiple Cards)
```
This is a photo of a trading card binder page. Identify EVERY visible card. For each card, determine the game, exact name, set, number, rarity, and visible condition.

Return ONLY a JSON array:
[
  {
    "position": "top-left",
    "game": "pokemon",
    "card_name": "Pikachu V",
    "set_name": "Vivid Voltage",
    "card_number": "043/185",
    "rarity": "Ultra Rare",
    "condition": "NM",
    "is_foil": true
  },
  ...
]
```

---

## SUCCESS CRITERIA

The TCG demo is ready when:
1. A "Las Vegas Card Show" event exists with 500+ card listings
2. Every card has an official card image from the TCG APIs
3. Every card shows vendor price + market price comparison
4. Search works for card names, set names, and card numbers
5. Filter by game (Pokémon/Magic/Yu-Gi-Oh!), rarity, condition, price range
6. "Below Market" toggle works and surfaces the best deals
7. Mobile UI is clean — card image + key info fits on one screen without scrolling
8. Multiple vendors selling the same card shows as "3 vendors have this card"
9. At least 3 events look fully populated when browsing on mobile

---

## HOW TO RUN

```bash
cd "C:\Users\Karaoke 2.0\Flash-Platform"
claude --dangerously-skip-permissions
```

Prompt: Read the TCG sprint doc and execute all phases.
