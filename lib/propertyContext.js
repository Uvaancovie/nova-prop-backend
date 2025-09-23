const Property = require('../models/Property');

async function buildPropertyContext(ownerUserId, query = '', limit = 8) {
  // 1) Try targeted text search (cheap); else fallback to latest
  const find = query && query.trim()
    ? { ownerUserId, $text: { $search: query } }
    : { ownerUserId };

  const docs = await Property.find(find)
    .select('title description city amenities price.nightly createdAt')
    .sort(query && query.trim() ? undefined : { createdAt: -1 })
    .limit(limit)
    .lean();

  if (!docs || !docs.length) return 'No properties on record.';

  // 2) Flatten to skinny lines (save tokens)
  return docs.map((d, i) =>
    `#${i+1} "${d.title}" — ${d.city || '-'} — R${(d.price && d.price.nightly) || ''}/night\nAmenities: ${(d.amenities||[]).slice(0,8).join(', ')}\nDesc: ${(d.description||'').slice(0,240)}`
  ).join('\n\n');
}

module.exports = { buildPropertyContext };
