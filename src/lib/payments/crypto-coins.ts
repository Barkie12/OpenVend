/**
 * Display metadata for common NOWPayments currency codes. Client-safe: no
 * server imports. Codes not listed here fall back to their uppercased ticker.
 */

export interface CryptoCoinInfo {
  label: string;
  /** Chain the deposit travels on, shown so buyers pick the right network in their wallet. */
  network: string | null;
}

const COIN_INFO: Record<string, CryptoCoinInfo> = {
  btc: { label: "Bitcoin", network: null },
  eth: { label: "Ethereum", network: null },
  ltc: { label: "Litecoin", network: null },
  sol: { label: "Solana", network: null },
  doge: { label: "Dogecoin", network: null },
  xmr: { label: "Monero", network: null },
  trx: { label: "TRON", network: null },
  xrp: { label: "XRP", network: null },
  ada: { label: "Cardano", network: null },
  ton: { label: "Toncoin", network: "TON" },
  bnbbsc: { label: "BNB", network: "BSC" },
  bnbmainnet: { label: "BNB", network: "BEP-2" },
  pol: { label: "Polygon", network: "Polygon" },
  matic: { label: "Polygon", network: "Polygon" },
  avax: { label: "Avalanche", network: "C-Chain" },
  dash: { label: "Dash", network: null },
  zec: { label: "Zcash", network: null },
  shib: { label: "Shiba Inu", network: "ERC-20" },
  usdttrc20: { label: "Tether", network: "TRC-20" },
  usdterc20: { label: "Tether", network: "ERC-20" },
  usdtbsc: { label: "Tether", network: "BSC" },
  usdtsol: { label: "Tether", network: "Solana" },
  usdtton: { label: "Tether", network: "TON" },
  usdtmatic: { label: "Tether", network: "Polygon" },
  usdc: { label: "USD Coin", network: "ERC-20" },
  usdcsol: { label: "USD Coin", network: "Solana" },
  usdcmatic: { label: "USD Coin", network: "Polygon" },
  usdcbsc: { label: "USD Coin", network: "BSC" },
  dai: { label: "DAI", network: "ERC-20" },
};

/** Checkout shows these first (when the merchant account supports them). */
export const POPULAR_COIN_ORDER = [
  "btc",
  "eth",
  "ltc",
  "usdttrc20",
  "usdterc20",
  "sol",
  "xmr",
  "doge",
] as const;

export function coinInfo(code: string): CryptoCoinInfo {
  return COIN_INFO[code.toLowerCase()] ?? { label: code.toUpperCase(), network: null };
}

/** Short ticker for display, e.g. `usdttrc20` renders as "USDT". */
export function coinTicker(code: string): string {
  const normalized = code.toLowerCase();
  const stablecoinMatch = /^(usdt|usdc|dai|bnb)/.exec(normalized);
  if (stablecoinMatch?.[1]) {
    return stablecoinMatch[1].toUpperCase();
  }
  return code.toUpperCase();
}
