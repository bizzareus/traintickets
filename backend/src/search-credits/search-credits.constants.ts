/** Lifetime free ticket searches per client IP. */
export const FREE_SEARCHES_PER_IP = 3;

/** Introductory pack: ₹100 buys 100 non-expiring search credits. */
export const CREDIT_PACK_PRICE_INR = 100;
export const CREDIT_PACK_QUANTITY = 100;
export const CREDIT_PACK_CURRENCY = 'INR';

/** 402 body code the frontend paywall listens for. */
export const SEARCH_CREDITS_EXHAUSTED_CODE = 'SEARCH_CREDITS_EXHAUSTED';

/** Upper bound for one worker settle tick. */
export const SETTLE_BATCH_LIMIT = 200;
