/**
 * Browser-safe NOWPayments helpers: currency metadata and wallet-URI building.
 * (Server-only signature verification lives in nowpayments.server.ts.)
 */

export const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io';

export interface CurrencyMeta {
  code: string;
  name: string;
  network?: string;
  /** wallet URI scheme for QR (BIP21-style), if widely supported */
  uriScheme?: string;
}

/**
 * Display metadata for common NOWPayments currency codes. Anything not listed
 * still works — it just renders with its uppercased ticker.
 */
export const CURRENCY_META: Record<string, CurrencyMeta> = {
  btc: { code: 'btc', name: 'Bitcoin', uriScheme: 'bitcoin' },
  eth: { code: 'eth', name: 'Ethereum', network: 'ERC-20', uriScheme: 'ethereum' },
  ltc: { code: 'ltc', name: 'Litecoin', uriScheme: 'litecoin' },
  bch: { code: 'bch', name: 'Bitcoin Cash', uriScheme: 'bitcoincash' },
  doge: { code: 'doge', name: 'Dogecoin', uriScheme: 'dogecoin' },
  xmr: { code: 'xmr', name: 'Monero', uriScheme: 'monero' },
  sol: { code: 'sol', name: 'Solana', uriScheme: 'solana' },
  trx: { code: 'trx', name: 'TRON' },
  xrp: { code: 'xrp', name: 'XRP' },
  ada: { code: 'ada', name: 'Cardano' },
  bnbbsc: { code: 'bnbbsc', name: 'BNB', network: 'BSC' },
  matic: { code: 'matic', name: 'Polygon' },
  usdttrc20: { code: 'usdttrc20', name: 'Tether USD', network: 'TRC-20' },
  usdterc20: { code: 'usdterc20', name: 'Tether USD', network: 'ERC-20' },
  usdtbsc: { code: 'usdtbsc', name: 'Tether USD', network: 'BEP-20' },
  usdtsol: { code: 'usdtsol', name: 'Tether USD', network: 'Solana' },
  usdcerc20: { code: 'usdcerc20', name: 'USD Coin', network: 'ERC-20' },
  usdctrc20: { code: 'usdctrc20', name: 'USD Coin', network: 'TRC-20' },
  usdc: { code: 'usdc', name: 'USD Coin' },
  usdt: { code: 'usdt', name: 'Tether USD' },
};

/** Currencies pinned to the top of the picker (only shown if actually available). */
export const POPULAR_CURRENCIES = [
  'btc',
  'eth',
  'usdttrc20',
  'usdterc20',
  'usdc',
  'usdcerc20',
  'ltc',
  'trx',
  'sol',
  'bnbbsc',
  'xmr',
  'doge',
  'bch',
  'xrp',
  'matic',
  'ada',
];

export function currencyName(code: string): string {
  return CURRENCY_META[code.toLowerCase()]?.name ?? code.toUpperCase();
}

/** Base coin symbol (strips network suffixes) for icon lookup. */
const ICON_OVERRIDES: Record<string, string> = {
  usdttrc20: 'usdt', usdterc20: 'usdt', usdtbsc: 'usdt', usdtsol: 'usdt', usdtmatic: 'usdt',
  usdcerc20: 'usdc', usdctrc20: 'usdc', usdcbsc: 'usdc', usdcsol: 'usdc',
  bnbbsc: 'bnb', bnbmainnet: 'bnb', maticmainnet: 'matic', busdbsc: 'busd',
};
export function coinSymbol(code: string): string {
  const c = code.toLowerCase();
  if (ICON_OVERRIDES[c]) return ICON_OVERRIDES[c];
  return c.replace(/(trc20|erc20|bep20|bsc|sol|matic|mainnet)$/i, '') || c;
}
/** Iconify name from the colourful `cryptocurrency-color` set (loaded on demand via the Iconify API). */
export function coinIcon(code: string): string {
  return `cryptocurrency-color:${coinSymbol(code)}`;
}

export function currencyNetwork(code: string): string | undefined {
  return CURRENCY_META[code.toLowerCase()]?.network;
}

/**
 * Build a wallet-scannable payment URI for a QR code so the wallet pre-fills the
 * address AND amount (the user just authorises). Uses each chain's correct param:
 *   - bitcoin/litecoin/bitcoincash/dogecoin → BIP21 ?amount=
 *   - ethereum → EIP-681 ?value=<wei>
 *   - monero → ?tx_amount=
 *   - solana → Solana Pay ?amount=
 * Falls back to the bare address (universally scannable) for tokens/unknown coins.
 */
export function buildPaymentUri(currency: string, address: string, amount?: number | string): string {
  const meta = CURRENCY_META[currency.toLowerCase()];
  if (!meta?.uriScheme) return address;

  const scheme = meta.uriScheme;
  const amt = amount !== undefined && amount !== '' ? Number(amount) : NaN;
  if (!Number.isFinite(amt) || amt <= 0) return `${scheme}:${address}`;

  if (scheme === 'ethereum') {
    // value must be in wei
    const wei = BigInt(Math.round(amt * 1e18)).toString();
    return `ethereum:${address}?value=${wei}`;
  }
  if (scheme === 'monero') {
    return `monero:${address}?tx_amount=${amt}`;
  }
  // bitcoin-family + solana use ?amount=
  return `${scheme}:${address}?amount=${amt}`;
}
