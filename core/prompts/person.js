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

  return `Analyze this photo of a ${type} for a missing ${type} flyer. Be specific about colors, patterns, clothing. ${typeContext[type] || typeContext.other}

Return ONLY valid JSON:
{"clothing_top":"desc","clothing_bottom":"desc","shoes":"desc","accessories":"desc or null","estimated_height":"height","hair_description":"desc","eye_color":"color","distinguishing_features":"desc or null","summary":"Full paragraph description suitable for a missing person flyer"}`;
};
