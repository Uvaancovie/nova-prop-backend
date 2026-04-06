const ACTIVITY_STATUSES = {
  provisional_booking: {
    label: 'Provisional Booking',
    color: '#8b5cf6',
    borderColor: '#7c3aed',
    textColor: '#ffffff',
    group: 'guest'
  },
  guest_booking_confirmed: {
    label: 'Guest Booking Confirmed',
    color: '#2563eb',
    borderColor: '#1d4ed8',
    textColor: '#ffffff',
    group: 'guest'
  },
  inhouse_checked_in: {
    label: 'In-house / Checked-in',
    color: '#059669',
    borderColor: '#047857',
    textColor: '#ffffff',
    group: 'guest'
  },
  guest_checked_out_invoiced: {
    label: 'Guest Checked Out + Invoiced',
    color: '#14b8a6',
    borderColor: '#0f766e',
    textColor: '#ffffff',
    group: 'guest'
  },
  special_instruction_on_booking: {
    label: 'Special Instruction on Booking',
    color: '#f59e0b',
    borderColor: '#d97706',
    textColor: '#111827',
    group: 'guest'
  },
  owner_stay: {
    label: 'Owner Stay',
    color: '#4f46e5',
    borderColor: '#4338ca',
    textColor: '#ffffff',
    group: 'owner'
  },
  airout: {
    label: 'Airout',
    color: '#84cc16',
    borderColor: '#65a30d',
    textColor: '#111827',
    group: 'operations'
  },
  full_clean: {
    label: 'Full Clean',
    color: '#22c55e',
    borderColor: '#16a34a',
    textColor: '#ffffff',
    group: 'operations'
  },
  deep_clean: {
    label: 'Deep Clean',
    color: '#16a34a',
    borderColor: '#15803d',
    textColor: '#ffffff',
    group: 'operations'
  },
  wipe_and_prep: {
    label: 'Wipe and Prep',
    color: '#a3e635',
    borderColor: '#84cc16',
    textColor: '#111827',
    group: 'operations'
  },
  stock_take: {
    label: 'Stock Take',
    color: '#06b6d4',
    borderColor: '#0891b2',
    textColor: '#ffffff',
    group: 'operations'
  },
  maintenance: {
    label: 'Maintenance',
    color: '#f97316',
    borderColor: '#ea580c',
    textColor: '#111827',
    group: 'maintenance'
  },
  gardens: {
    label: 'Gardens',
    color: '#65a30d',
    borderColor: '#4d7c0f',
    textColor: '#ffffff',
    group: 'maintenance'
  },
  out_of_service: {
    label: 'Out of Service',
    color: '#ef4444',
    borderColor: '#dc2626',
    textColor: '#ffffff',
    group: 'maintenance'
  }
};

const INVOICE_STATES = {
  not_required: { label: 'Not Required' },
  pending_xero: { label: 'Pending on Xero' },
  processing_xero: { label: 'Processing on Xero' },
  invoiced: { label: 'Invoiced' },
  paid: { label: 'Paid' },
  failed: { label: 'Failed' }
};

const STAFF_MEMBERS = [
  { id: 'audrey', name: 'Audrey' },
  { id: 'cathleen', name: 'Cathleen' },
  { id: 'lorraine', name: 'Lorraine' },
  { id: 'nika', name: 'Nika' },
  { id: 'geraldine', name: 'Geraldine' },
  { id: 'levine', name: 'Levine' },
  { id: 'dudley_godwin', name: 'Dudley Godwin' },
  { id: 'corne', name: 'Corne' },
  { id: 'kady_ravon', name: 'Kady Ravon' }
];

module.exports = {
  ACTIVITY_STATUSES,
  INVOICE_STATES,
  STAFF_MEMBERS
};
