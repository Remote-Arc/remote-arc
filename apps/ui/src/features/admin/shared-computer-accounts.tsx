import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import React, { useEffect, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/admin/shared-computer-accounts.css";

type SharedAccount = {
  userId: string;
  email: string;
  name: string | null;
  match: "machine" | "hostname";
  computer: string;
  trialEndsAt: string | null;
};
type SharedComputers = {
  rulesActive: boolean;
  trialEndsAt: string | null;
  trialBlockedBySharedComputer: boolean;
  accounts: SharedAccount[];
};

/** Admin: other accounts on this account's computers, and whether the Free
 * unlimited trial was withheld because one of them already used it. */
export function AdminSharedComputers({ userId }: { userId: string }) {
  const { tr } = useI18n();
  const [data, setData] = useState<SharedComputers | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    void fetch("/api/admin/shared-computers?userId=" + encodeURIComponent(userId), {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json().then(canonicalErrorEnvelope) as Promise<SharedComputers>;
      })
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const now = new Date().toISOString();
  const trialLabel = (endsAt: string | null) =>
    !endsAt
      ? tr("admin.sharedComputers.noTrial")
      : endsAt > now
        ? tr("admin.sharedComputers.trialUntil", { date: new Date(endsAt).toLocaleDateString() })
        : tr("admin.sharedComputers.trialUsed");

  return (
    <section className="sharedComputers" aria-label={tr("admin.sharedComputers.title")}>
      <div className="sharedComputersTop">
        <strong>{tr("admin.sharedComputers.title")}</strong>
        {data?.trialBlockedBySharedComputer && (
          <span className="sharedComputersBlocked">{tr("admin.sharedComputers.trialBlocked")}</span>
        )}
      </div>
      {error ? (
        <p className="sharedComputersNote">{tr("admin.sharedComputers.couldNotLoad")}</p>
      ) : !data ? (
        <p className="sharedComputersNote">{tr("admin.sharedComputers.loading")}</p>
      ) : (
        <>
          {!data.rulesActive && (
            <p className="sharedComputersNote">{tr("admin.sharedComputers.rulesOff")}</p>
          )}
          {data.accounts.length === 0 ? (
            <p className="sharedComputersNote">{tr("admin.sharedComputers.none")}</p>
          ) : (
            <ul className="sharedComputersList">
              {data.accounts.map((account) => (
                <li key={account.userId}>
                  <div>
                    <strong>{account.name || account.email}</strong>
                    <small>{account.email}</small>
                  </div>
                  <div>
                    <span>{account.computer}</span>
                    <small>
                      {account.match === "machine"
                        ? tr("admin.sharedComputers.matchMachine")
                        : tr("admin.sharedComputers.matchHostname")}
                    </small>
                  </div>
                  <span className="sharedComputersTrial">{trialLabel(account.trialEndsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
