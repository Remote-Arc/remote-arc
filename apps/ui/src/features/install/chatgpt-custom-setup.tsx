import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";

export function ChatGptCustomSetup() {
  const { tr } = useI18n();
  const steps = [
    {
      image: "01-create-custom-mcp.png",
      title: tr("install.chatgptCustomSetup.addACustomMcpServer"),
      body: tr("install.chatgptCustomSetup.ifYourChatgptAccountSupportsCustom"),
    },
    {
      image: "02-plugin-ready.png",
      title: tr("install.chatgptCustomSetup.connectYourRemoteArcAccount"),
      body: tr("install.chatgptCustomSetup.completeOauthWithTheSameRemote"),
    },
    {
      image: "03-run-in-chat.png",
      title: tr("install.chatgptCustomSetup.startWithAReadOnlyRequest"),
      body: tr("install.chatgptCustomSetup.selectYourCustomRemoteArcConnection"),
    },
    {
      image: "04-mac-result.png",
      title: tr("install.chatgptCustomSetup.checkTheReturnedResult"),
      body: tr("install.chatgptCustomSetup.theOriginalMacExampleBelowShows"),
    },
  ];
  return (
    <div className="pluginCustomWalkthrough">
      <p>{tr("install.chatgptCustomSetup.originalCustomMcpScreenshotGuideThis")}</p>
      <ol>
        {steps.map((step, index) => (
          <li key={step.image}>
            <h3>
              {index + 1}. {step.title}
            </h3>
            <p>{step.body}</p>
            <a
              href={"/chatgpt-setup/" + step.image}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={tr("install.chatgptCustomSetup.openOriginalScreenshot") + step.title}
            >
              <img src={"/chatgpt-setup/" + step.image} alt={step.title} loading="lazy" />
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
