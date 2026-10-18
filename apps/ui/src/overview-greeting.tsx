import { useEffect, useState } from 'react';

export function OverviewGreeting({ name, tr }: { name: string | null; tr: (en: string, zh: string) => string }) {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const refresh = () => setHour(new Date().getHours());
    const timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const greeting = hour < 5 || hour >= 18 ? tr('Good evening', '晚上好')
    : hour < 12 ? tr('Good morning', '早上好') : tr('Good afternoon', '下午好');
  const firstName = name?.trim().split(/\s+/)[0];
  return <h1 className="overviewGreeting">{greeting}{firstName ? ', ' + firstName : ''}<span aria-hidden="true">.</span></h1>;
}
