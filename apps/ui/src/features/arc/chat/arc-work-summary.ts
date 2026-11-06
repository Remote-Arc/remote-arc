import type { Translate } from "../../../locales/locale-catalog.js";
export function workStepLabel(tool: string | undefined, tr: Translate) {
  return (
    (
      {
        read_skill: tr("arc.chat.arcWorkSummary.chooseASuitableSkill"),
        read_skill_resource: tr("arc.chat.arcWorkSummary.readSkillResources"),
        prepare_skill: tr("arc.chat.arcWorkSummary.prepareTaskResources"),
        prepare_employee: tr("arc.chat.arcWorkSummary.organizeAnAgent"),
        create_team: tr("arc.chat.arcWorkSummary.organizeTheTeam"),
        delegate_work: tr("arc.chat.arcWorkSummary.assignWork"),
        message_employee: tr("arc.chat.arcWorkSummary.coordinateAgents"),
        list_teammates: tr("arc.chat.arcWorkSummary.findSuitableAgents"),
        call_app: tr("arc.chat.arcWorkSummary.workWithAConnectedApp"),
        read_inbox: tr("arc.chat.arcWorkSummary.readRecentMessages"),
        device_tool: tr("arc.chat.arcWorkSummary.workOnYourComputer"),
        list_devices: tr("arc.chat.arcWorkSummary.findAnAvailableComputer"),
        create_task: tr("arc.chat.arcWorkSummary.arrangeATask"),
        create_routine: tr("arc.chat.arcWorkSummary.arrangeRecurringWork"),
        manage_work: tr("arc.chat.arcWorkSummary.updateTheWorkPlan"),
      } as Record<string, string>
    )[tool || ""] || tr("arc.chat.arcWorkSummary.workStep")
  );
}
export function workStepStatus(status: string | undefined, tr: Translate) {
  return status === "completed"
    ? tr("arc.chat.arcWorkSummary.finished")
    : status === "running"
      ? tr("arc.chat.arcWorkSummary.working")
      : tr("arc.chat.arcWorkSummary.needsAttention");
}
