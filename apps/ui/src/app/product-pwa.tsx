import {useEffect, useState} from 'react';
import {useI18n} from './i18n.js';
import {recoverAdminBrowser} from '../features/admin/admin-client-recovery.js';
import {PRODUCT_SW} from '../config/pwa-config.js';
import {ProductIcon as Icon} from '../components/product-icon.js';
import './product-pwa.css';

type InstallPrompt = Event & {prompt(): Promise<{outcome: 'accepted' | 'dismissed'}>};
let pendingPrompt: InstallPrompt | null = null;
let listening = false;
export async function registerProductPwa(preview: boolean) {
  if (preview || location.protocol !== 'https:' || !['agent.remotearc.app', 'admin.remotearc.app'].includes(location.hostname)) return;
  if (!listening) {
    listening = true;
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault(); pendingPrompt = event as InstallPrompt;
      window.dispatchEvent(new Event('arc-install-ready'));
    });
    window.addEventListener('appinstalled', () => {pendingPrompt = null; window.dispatchEvent(new Event('arc-install-ready'));});
  }
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'admin.remotearc.app' && await recoverAdminBrowser()) return;
  try { await navigator.serviceWorker.register(PRODUCT_SW, {scope: '/', updateViaCache: 'none'}); }
  catch { /* Installation is optional; the online workspace stays available. */ }
}

export function ProductInstall({admin = false}: {admin?: boolean}) {
  const {tr} = useI18n();
  const [ready, setReady] = useState(Boolean(pendingPrompt)), [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?: boolean}).standalone));
  useEffect(() => {
    const update = () => {setReady(Boolean(pendingPrompt)); setInstalled(matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?: boolean}).standalone));};
    window.addEventListener('arc-install-ready', update);
    const display = matchMedia('(display-mode: standalone)'); display.addEventListener('change', update);
    return () => {window.removeEventListener('arc-install-ready', update); display.removeEventListener('change', update);};
  }, []);
  async function install() {
    if (!pendingPrompt) {setHelp(value => !value); return;}
    const event = pendingPrompt; pendingPrompt = null; setReady(false);
    try {await event.prompt();} catch {setHelp(true);}
  }
  return <div className="productInstall"><button type="button" disabled={installed} onClick={() => void install()} aria-expanded={help}>
    <Icon name={installed?'check':'device'} size={16}/>{installed?tr('Installed on this device','已安装到此设备'):ready?tr('Install app','安装应用'):tr(admin?'Install Admin app':'Install Remote Arc','安装应用')}
  </button>{help&&<p role="status">{tr('In Chrome or Edge, choose Install app from the browser menu. On iPhone or iPad, use Share → Add to Home Screen. On Mac Safari, use File → Add to Dock.','Chrome / Edge：浏览器菜单中选择“安装应用”。iPhone / iPad：分享 → 添加到主屏幕。Mac Safari：文件 → 添加到程序坞。')}</p>}</div>;
}
