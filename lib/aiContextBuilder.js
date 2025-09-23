const Booking = require('../models/Booking');
const Property = require('../models/Property');
const Message = require('../models/Message');

async function buildFullContext(ownerUserId, userQuery = '', limit = 6) {
  // Gather properties (re-use propertyContext logic minimally)
  const properties = await Property.find({ realtor_id: ownerUserId })
    .select('name city price_per_night amenities description')
    .limit(limit)
    .lean();

  const propLines = properties.map((p, i) => `#${i+1} ${p.name} — ${p.city || '-'} — R${p.price_per_night || ''}/night\nAmenities: ${(p.amenities||[]).slice(0,8).join(', ')}\nDesc: ${(p.description||'').slice(0,240)}`);

  // Gather upcoming bookings for the next 60 days
  const now = new Date();
  const in60 = new Date(now.getTime() + 1000*60*60*24*60);
  const bookings = await Booking.find({ realtor_id: ownerUserId, check_in: { $gte: now, $lte: in60 } })
    .select('property_id property_name client_id guest_name guest_email check_in check_out status')
    .sort({ check_in: 1 })
    .limit(limit)
    .lean();

  const bookingLines = bookings.map((b,i) => `#${i+1} Booking for ${b.property_name} — Guest: ${b.guest_name} (${b.guest_email}) — ${new Date(b.check_in).toLocaleDateString()} to ${new Date(b.check_out).toLocaleDateString()} — status: ${b.status}`);

  const lines = [];
  if (propLines.length) {
    lines.push('Properties:\n' + propLines.join('\n\n'));
  }
  if (bookingLines.length) {
    lines.push('Upcoming bookings (next 60 days):\n' + bookingLines.join('\n'));
  }

  if (!lines.length) return 'No properties or upcoming bookings on file.';
  // Also include recent messages involving this realtor (with clients)
  try {
    const messages = await Message.find({
      $or: [
        { sender_id: ownerUserId },
        { receiver_id: ownerUserId }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender_id', 'name email role')
      .populate('receiver_id', 'name email role')
      .lean();

    if (messages && messages.length) {
      const msgLines = messages.map((m, i) => {
        const sender = m.sender_id || {};
        const receiver = m.receiver_id || {};
        const isIncoming = String(sender._id || sender.id || sender) !== String(ownerUserId);
        const other = isIncoming ? sender : receiver;
        const direction = isIncoming ? 'Incoming' : 'Outgoing';
        const who = other && (other.name || other.email) ? (other.name || other.email) : 'Unknown';
        const when = m.createdAt ? new Date(m.createdAt).toLocaleString() : '';
        const readFlag = m.read ? 'read' : 'unread';
        return `#${i+1} [${direction}] ${who} — ${when} — ${readFlag}\n${(m.content||'').slice(0,400)}`;
      });

      lines.push('Recent messages (most recent first):\n' + msgLines.join('\n\n'));
    }
  } catch (err) {
    // Non-fatal: if messages can't be loaded, continue without them
    console.warn('buildFullContext: failed to load messages', err.message || err);
  }

  return lines.join('\n\n');
}

module.exports = { buildFullContext };
