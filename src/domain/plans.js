// Plans definition and helper
const PLANS = {
  free:    { label: 'Free',    priceZar: 0,   quotas: { maxProperties: 2  } },
  starter: { label: 'Starter', priceZar: 149, quotas: { maxProperties: 5  } },
  growth:  { label: 'Growth',  priceZar: 199, quotas: { maxProperties: 10 } },
};

function getPlan(planId) {
  return PLANS[planId] || PLANS.free;
}

module.exports = { PLANS, getPlan };
