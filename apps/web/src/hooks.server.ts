import type { Handle } from '@sveltejs/kit';

// NOTE: the old in-process paymentMonitor (setInterval polling the DB) was removed.
// On serverless it ran in every instance and exhausted the database connection pool,
// causing intermittent 500s. Payment confirmation is handled by the NOWPayments IPN
// webhook (/api/payment/ipn) plus on-demand status polling, so the monitor is redundant.

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};
