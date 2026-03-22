module.exports = `This appears to be a menu board, price list, or chalkboard with food/drink items and prices. Extract ALL item names and prices visible.

Return ONLY a valid JSON array:
[{"name":"Item Name","price_cents":899}]

Rules:
- Convert dollar prices to cents (e.g., $8.99 = 899)
- Include ALL items visible, even partially
- If a price is unclear, set price_cents to null
- If items have size variants, list each as a separate entry with the size in the name`;
