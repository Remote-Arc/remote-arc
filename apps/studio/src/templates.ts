import {
  newStudioDocument,
  newStudioScene,
  type StudioDocument,
} from "@rearc/studio/core";
import { translateStudio } from "./strings.js";

export function studioTemplate(
  kind: "product" | "explainer" | "report",
  locale: "en" | "zh" = "zh",
): StudioDocument {
  const title =
    kind === "product"
      ? "让好产品，被看见"
      : kind === "explainer"
        ? "把复杂的事，讲清楚"
        : "让数据说话";
  const document = newStudioDocument(title, "");
  const content =
    kind === "product"
      ? [
          [
            "title",
            "MEET YOUR NEXT IDEA",
            title,
            "一段清楚的介绍，从一个真正的问题开始。",
            [],
          ],
          [
            "feature",
            "01 / THE PROBLEM",
            "你的用户，正在解决什么？",
            "用真实的使用场景，描述他们遇到的困难。",
            [],
          ],
          [
            "list",
            "02 / THE SOLUTION",
            "把价值，讲得具体一点。",
            "展示产品如何帮助用户完成工作。",
            [
              "一个清楚的使用场景",
              "一个看得见的核心功能",
              "一个可信的使用结果",
            ],
          ],
          [
            "outro",
            "MAKE IT HAPPEN",
            "从这里，开始。",
            "放上你的产品名、网址，或一句明确的行动邀请。",
            [],
          ],
        ]
      : kind === "explainer"
        ? [
            [
              "title",
              "A SMALL QUESTION",
              title,
              "从观众关心的一个问题开始。",
              [],
            ],
            [
              "feature",
              "THE IDEA",
              "先讲一个核心概念。",
              "用熟悉的例子，把抽象的想法变成具体的画面。",
              [],
            ],
            [
              "list",
              "STEP BY STEP",
              "分成几个容易理解的步骤。",
              "每个画面只传达一个重点。",
              ["先解释为什么", "再展示如何做", "最后给一个例子"],
            ],
            [
              "outro",
              "TAKE IT WITH YOU",
              "带走一个有用的想法。",
              "用一句话，让观众记住最重要的内容。",
              [],
            ],
          ]
        : [
            [
              "title",
              "THE STORY IN YOUR DATA",
              title,
              "把你已经核实的数据，整理成一条清楚的故事。",
              [],
            ],
            [
              "stats",
              "THE OBSERVATION",
              "这里放一个关键发现。",
              "请使用你的实际数字和来源。",
              [],
            ],
            [
              "list",
              "WHAT IT MEANS",
              "这些变化，意味着什么？",
              "从数据出发，说明观察与推测的区别。",
              ["展示实际变化", "解释可能原因", "说明数据边界"],
            ],
            [
              "outro",
              "THE NEXT STEP",
              "接下来，可以做什么？",
              "给出一个有依据的行动方向。",
              [],
            ],
          ];
  document.scenes = content.map((parts, index) => ({
    ...newStudioScene(parts[0] as "title"),
    kicker: parts[1] as string,
    title: parts[2] as string,
    body: parts[3] as string,
    points: parts[4] as string[],
    durationFrames: 210,
    background:
      index === content.length - 1 ? ("accent" as const) : ("dark" as const),
    transition: index === 0 ? ("fade" as const) : ("slide" as const),
  }));
  document.title = translateStudio(document.title, locale);
  document.scenes = document.scenes.map((scene) => ({
    ...scene,
    title: translateStudio(scene.title, locale),
    body: translateStudio(scene.body, locale),
    points: scene.points.map((point) => translateStudio(point, locale)),
  }));
  return document;
}
