import type { Translate } from "../../../locales/locale-catalog.js";
type Tr = Translate;
export function workflowExperience(id: string, tr: Tr) {
  return (
    {
      "arc-verified-inbox": {
        title: tr("arc.skills.arcSkillExperience.summarizeMyInbox"),
        result: tr("arc.skills.arcSkillExperience.aConciseSummaryWithSourceMessages"),
        needs: tr("arc.skills.arcSkillExperience.gmailOrOutlook"),
        providers: ["gmail", "outlook"],
        prompt: tr("arc.skills.arcSkillExperience.summarizeTheImportantRecentEmailsIn"),
      },
      "arc-verified-issue": {
        title: tr("arc.skills.arcSkillExperience.turnAProblemIntoAnIssue"),
        result: tr("arc.skills.arcSkillExperience.aRealIssueLinkCheckedAgainst"),
        needs: "GitHub",
        providers: ["github"],
        prompt: tr("arc.skills.arcSkillExperience.helpMeTurnAProblemInto"),
      },
      "arc-verified-deployment": {
        title: tr("arc.skills.arcSkillExperience.checkADeployment"),
        result: tr("arc.skills.arcSkillExperience.theObservedDeploymentStatusAndIts"),
        needs: "Vercel",
        providers: ["vercel"],
        prompt: tr("arc.skills.arcSkillExperience.checkTheDeploymentIIdentifyNext"),
      },
      "arc-website": {
        title: tr("arc.skills.arcSkillExperience.buildAWorkingWebsite"),
        result: tr("arc.skills.arcSkillExperience.savedSiteFilesAndAPreview"),
        needs: tr("arc.skills.arcSkillExperience.aConnectedComputer"),
        providers: [],
        prompt: tr("arc.skills.arcSkillExperience.buildTheWebsiteIDescribeNext"),
      },
      "arc-report": {
        title: tr("arc.skills.arcSkillExperience.createAUsefulReport"),
        result: tr("arc.skills.arcSkillExperience.aSavedReportWithCheckedSource"),
        needs: tr("arc.skills.arcSkillExperience.sourceMaterialAndAComputer"),
        providers: [],
        prompt: tr("arc.skills.arcSkillExperience.createAReportFromTheSources"),
      },
    } as Record<
      string,
      { title: string; result: string; needs: string; providers: string[]; prompt: string }
    >
  )[id];
}
