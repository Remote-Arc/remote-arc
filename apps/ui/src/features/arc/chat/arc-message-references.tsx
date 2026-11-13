import type { Translate } from "../../../locales/locale-catalog.js";
import { communityExperience } from "../skills/arc-community-experience.js";
import { ArcReferenceIcon } from "../composer/arc-reference-icon.js";
import type { ArcMention } from "../../../hooks/arc/use-arc-skill-mentions.js";
import { workflowExperience } from "../skills/arc-skill-experience.js";
import type { ChatMessage } from "../../../hooks/arc/use-arc-chat.js";

export function ArcMessageReferences({ message, tr }: { message: ChatMessage; tr: Translate }) {
  const items: ArcMention[] = [
    ...(message.teammates || []).map((person) => ({
      kind: "employee" as const,
      ...person,
      description: person.responsibility,
    })),
    ...(message.apps || []).map((app) => ({ kind: "app" as const, ...app })),
    ...(message.skills || []).map((skill) => ({
      kind: "skill" as const,
      ...skill,
      name:
        communityExperience(skill.id, tr)?.title ||
        workflowExperience(skill.id, tr)?.title ||
        skill.name,
    })),
  ];
  return items.length ? (
    <div className="arcMessageSkills arcMessageReferences">
      {items.map((item) => (
        <span
          className="arcContextChip"
          key={item.kind + ":" + item.id}
          title={item.description || item.name}
        >
          <ArcReferenceIcon item={item} />
          <span className="arcReferenceName">{item.name}</span>
        </span>
      ))}
    </div>
  ) : null;
}
