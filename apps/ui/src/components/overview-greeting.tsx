import type { Translate } from "../locales/locale-catalog.js";
import { useEffect, useState } from "react";

export function OverviewGreeting({ name, tr }: { name: string | null; tr: Translate }) {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const refresh = () => setHour(new Date().getHours());
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const greeting =
    hour < 5 || hour >= 18
      ? tr("components.overviewGreeting.goodEvening")
      : hour < 12
        ? tr("components.overviewGreeting.goodMorning")
        : tr("components.overviewGreeting.goodAfternoon");
  const firstName = name?.trim().split(/\s+/)[0];
  return (
    <h1 className="overviewGreeting">
      {greeting}
      {firstName ? ", " + firstName : ""}
      <span aria-hidden="true">.</span>
    </h1>
  );
}
