export const PRODUCT_SW = '/sw.js?v=arc-shell-v2';
export const PRODUCT_CACHE = 'remote-arc-shell-v2';

export function currentProductWorker(scriptURL: string, origin: string) {
  try {
    const url = new URL(scriptURL);
    return url.origin === origin && url.pathname === '/sw.js' && url.searchParams.get('v') === 'arc-shell-v2';
  } catch { return false; }
}
