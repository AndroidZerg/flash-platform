module.exports = `Analyze this product photo for a marketplace listing. Identify the product specifically: brand, model, edition, version, year if applicable. Assess visible condition honestly.

Return ONLY valid JSON:
{"title":"Product name with identifiers","category":"Primary category","description":"2-3 sentence buyer-facing description","condition":"New|Like New|Very Good|Good|Acceptable|Poor","condition_notes":"Specific visible condition details","brand":"Brand or null","notable_features":"Key selling points","suggested_price_range":"$X-Y or null","keywords":["search","keywords"]}`;
