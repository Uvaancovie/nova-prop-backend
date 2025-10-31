// Plans definition and helper
const PLANS = {
  free:    { label: 'Free',    priceZar: 0,   quotas: { maxProperties: 2,  maxAiRequests: 8,  maxSavedListings: 10 } },
  starter: { label: 'Starter', priceZar: 149, quotas: { maxProperties: 5,  maxAiRequests: 15, maxSavedListings: 10 } },
  growth:  { label: 'Growth',  priceZar: 199, quotas: { maxProperties: 10, maxAiRequests: 15, maxSavedListings: 10 } },
};

function getPlan(planId) {
  return PLANS[planId] || PLANS.free;
}

module.exports = { PLANS, getPlan };
