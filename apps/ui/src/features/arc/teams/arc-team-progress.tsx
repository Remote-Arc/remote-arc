import type { Translate } from "../../../locales/locale-catalog.js";
import type { ArcDelegationProgress } from "@remotearc/protocol";
import { TeamAvatar } from "./arc-team-avatar.js";
import "../../../styles/arc/teams/arc-team-progress.css";
type Tr = Translate;
export function ArcTeamProgress({ items, tr }: { items: ArcDelegationProgress[]; tr: Tr }) {
  if (!items.length) return null;
  const members = items.flatMap((item) => item.members),
    completed = members.filter((member) => member.status === "completed").length;
  const label = (state: string) =>
    state === "completed"
      ? tr("arc.teams.arcTeamProgress.completed")
      : state === "working"
        ? tr("arc.teams.arcTeamProgress.working")
        : state === "queued"
          ? tr("arc.teams.arcTeamProgress.queued")
          : state === "paused"
            ? tr("arc.teams.arcTeamProgress.paused")
            : state === "cancelled"
              ? tr("arc.teams.arcTeamProgress.stopped")
              : state === "unknown"
                ? tr("arc.teams.arcTeamProgress.needsAttention")
                : tr("arc.teams.arcTeamProgress.couldNotFinish");
  return (
    <section className="arcTeamProgress" aria-label={tr("arc.teams.arcTeamProgress.teamProgress")}>
      <div className="arcTeamProgressHeading">
        <strong>{tr("arc.teams.arcTeamProgress.teamProgress")}</strong>
        <span aria-live="polite">
          {completed}/{members.length} {tr("arc.teams.arcTeamProgress.completed2")}
        </span>
      </div>
      {members.length ? (
        members.map((member) => (
          <div className="arcTeamProgressMember" key={member.id} data-status={member.status}>
            <TeamAvatar employee={{ name: member.name, avatar: member.avatar }} size={28} />
            <div className="arcTeamProgressText">
              <strong>{member.name}</strong>
              <span>
                {member.status === "working"
                  ? member.activity || tr("arc.teams.arcTeamProgress.workingOnTheAssignment")
                  : member.status === "queued"
                    ? tr("arc.teams.arcTeamProgress.waitingForAnAvailableWorkSlot")
                    : label(member.status)}
              </span>
            </div>
            <small className="arcTeamProgressState">
              <i aria-hidden="true" />
              {label(member.status)}
            </small>
          </div>
        ))
      ) : (
        <p>{label(items[0]!.status)}</p>
      )}
    </section>
  );
}
