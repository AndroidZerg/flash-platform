module.exports = `Identify this trading card. Determine the game (Pokémon, Magic: The Gathering, or Yu-Gi-Oh!), the exact card name, set, card number, rarity, and visible condition.

Return ONLY valid JSON:
{
  "game": "pokemon|magic|yugioh",
  "card_name": "exact card name",
  "set_name": "set name",
  "card_number": "number/total",
  "rarity": "rarity level",
  "condition": "NM|LP|MP|HP|DMG",
  "condition_notes": "specific condition observations",
  "is_foil": true or false,
  "is_first_edition": true or false,
  "is_graded": true or false,
  "grade": "PSA 10, CGC 9.5, etc. or null",
  "language": "English|Japanese|etc",
  "keywords": ["searchable", "terms"]
}`;
