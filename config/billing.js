'use strict';

// Phase 1 reads only MMS_UNITS. The rest is inert until Phase 2/3.
module.exports = ({ env }) => ({
  FREE_UNITS: env.int('BILLING_FREE_UNITS', 500),
  WARN_PCT: 0.8,
  GRACE_PCT: 0,
  MMS_UNITS: env.int('BILLING_MMS_UNITS', 3),
  BLOCKABLE: ['broadcast'],
  plans: { standard: { includedUnits: 1500, baseFeeCents: 2000, overageCentsPerUnit: 2 } },
  stripe: { priceBase: env('STRIPE_PRICE_BASE'), priceMetered: env('STRIPE_PRICE_METERED'), meterEvent: env('STRIPE_METER_EVENT') },
});
