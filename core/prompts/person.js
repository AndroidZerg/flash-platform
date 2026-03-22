module.exports = function(type) {
  const typeContext = {
    child: 'This is a child. Be very specific about clothing colors, patterns, and any accessories.',
    teen: 'This is a teenager. Note clothing style, colors, patterns, and any accessories.',
    adult: 'This is an adult. Note clothing, distinguishing features, and accessories.',
    elder: 'This is an elderly person. Note clothing, mobility aids, and distinguishing features.',
    dog: 'This is a dog. Note breed (or mix), color/markings, size, collar, and any distinguishing features.',
    cat: 'This is a cat. Note breed (or mix), color/markings, collar, and any distinguishing features.',
    other: 'Note all distinguishing features, colors, markings, and any identifying items.'
  };

  const isPet = ['dog', 'cat', 'other'].includes(type);

  return `Analyze this photo of a ${type} for a missing ${type} flyer. ${typeContext[type] || typeContext.other}

List the most visually distinctive identifying features first. Prioritize in this order:
1. ${isPet ? 'Fur/coat' : 'Hair'} color and style
2. Distinguishing marks (scars, birthmarks, unique markings${isPet ? ' like "white blaze on muzzle"' : ''})
3. ${isPet ? 'Collar/harness/leash with colors' : 'Clothing with colors and patterns'}
4. Height/size estimate
5. Accessories (${isPet ? 'leash, tags, harness' : 'backpack, hat, glasses, jewelry'})

These are what a bystander would notice first from a distance.

Return ONLY valid JSON:
{"clothing_top":"desc","clothing_bottom":"desc","shoes":"desc","accessories":"desc or null","estimated_height":"height","hair_description":"desc","eye_color":"color","distinguishing_features":"desc or null","summary":"Full paragraph description suitable for a missing ${type} flyer, leading with the most visually distinctive features"}`;
};
