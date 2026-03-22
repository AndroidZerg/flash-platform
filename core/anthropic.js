const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeImage(base64, mediaType, promptText) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: promptText }
      ]
    }]
  });

  const text = response.content[0].text;
  // Try array first (for menu board extraction), then object
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');

  if (arrStart !== -1 && arrEnd !== -1 && (objStart === -1 || arrStart < objStart)) {
    return JSON.parse(text.substring(arrStart, arrEnd + 1));
  }
  if (objStart === -1 || objEnd === -1) throw new Error('AI returned no JSON');
  return JSON.parse(text.substring(objStart, objEnd + 1));
}

module.exports = { analyzeImage };
