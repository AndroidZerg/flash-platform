module.exports = `This is a photo of a trading card binder page. Identify EVERY visible card. For each card, determine the game, exact name, set, number, rarity, and visible condition.

Return ONLY a JSON array:
[
  {
    "position": "top-left",
    "game": "pokemon|magic|yugioh",
    "card_name": "exact card name",
    "set_name": "set name",
    "card_number": "number/total",
    "rarity": "rarity level",
    "condition": "NM|LP|MP|HP|DMG",
    "is_foil": true or false
  }
]

Identify all visible cards from left to right, top to bottom. Use positions like "top-left", "top-center", "top-right", "middle-left", etc.`;
