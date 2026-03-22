module.exports = `Analyze this food photo for a vendor menu. Describe the dish appetizingly. Identify ingredients if visible.

Return ONLY valid JSON:
{"title":"Dish name","description":"Appetizing 1-2 sentence description","category":"Appetizer|Entree|Dessert|Drink|Side|Snack","dietary_info":["vegetarian","gluten-free","vegan","dairy-free","nut-free"],"spice_level":"Mild|Medium|Hot|none","estimated_calories":"range or null","keywords":["search","keywords"]}`;
