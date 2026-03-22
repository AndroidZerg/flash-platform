const sharp = require('sharp');
const { supabase } = require('./supabase');
const crypto = require('crypto');

async function uploadPhoto(buffer, originalName) {
  const ext = originalName.split('.').pop() || 'jpg';
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `items/${filename}`;

  const { error } = await supabase.storage
    .from('photos')
    .upload(path, buffer, {
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      upsert: false
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

async function generateThumbnail(buffer, maxWidth = 400) {
  const resized = await sharp(buffer)
    .resize(maxWidth, null, { withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();

  const filename = `${crypto.randomUUID()}_thumb.jpg`;
  const path = `items/${filename}`;

  const { error } = await supabase.storage
    .from('photos')
    .upload(path, resized, {
      contentType: 'image/jpeg',
      upsert: false
    });

  if (error) throw new Error(`Thumbnail upload failed: ${error.message}`);

  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

module.exports = { uploadPhoto, generateThumbnail };
