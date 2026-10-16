import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArcWhy } from "../src/arc-why.tsx";

// Assert the rendered public contract, rather than a source-text pattern or
// full markup snapshot. Both locales must distinguish what users can use now.
function decode(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function text(value) { return decode(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }
function attributes(value) { return Object.fromEntries([...value.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, item]) => [key, decode(item)])); }

for (const locale of ["en", "zh"]) {
  const prefix = locale === "zh" ? "/zh" : "";
  const connectHref = prefix + "/connect-ai?source=why-arc&path=connect";
  const earlyAccessHref = prefix + "/early-access?source=why-arc&path=hosted";
  const html = renderToStaticMarkup(React.createElement(ArcWhy, {
    tr: (en, zh) => locale === "zh" ? zh : en,
    connectHref,
    earlyAccessHref,
  }));
  const section = [...html.matchAll(/<section\b([^>]*)>/g)].map(match => attributes(match[1])).find(item => item.id === "why-arc");
  assert.ok(section, "Expose an addressable Why Arc section");
  assert.ok(section["aria-labelledby"], "The section needs an accessible heading");
  const headings = [...html.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/g)].map(([, props, content]) => ({ ...attributes(props), text: text(content) }));
  const title = headings.find(heading => heading.id === section["aria-labelledby"]);
  assert.ok(title?.text.includes("Arc"), "The section label must reference its visible Arc heading");
  assert.ok(locale === "zh" ? /[\u3400-\u9fff]/u.test(title.text) : /[A-Za-z]/.test(title.text), "Localize the section heading");

  const cards = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map(([, content]) => {
    const heading = content.match(/<h[34]\b[^>]*>([\s\S]*?)<\/h[34]>/);
    return { heading: heading ? text(heading[1]) : "", text: text(content) };
  });
  const choices = cards.filter(card => /ChatGPT|Remote Arc Connect|Arc Hosted/.test(card.heading));
  assert.equal(choices.length, 3, "Explain the three product choices without conflating them");
  const direct = choices.find(card => /ChatGPT/.test(card.heading));
  const connect = choices.find(card => /Remote Arc Connect/.test(card.heading));
  const hosted = choices.find(card => /Arc Hosted/.test(card.heading));
  assert.ok(direct && connect && hosted, "Offer direct ChatGPT, Connect and Hosted choices");
  assert.match(connect.text, locale === "zh" ? /现已可用/ : /available today/i, "Connect must remain an available product");
  assert.match(hosted.text, locale === "zh" ? /开发中/ : /in development/i, "Hosted must remain explicitly in development");
  assert.doesNotMatch(hosted.text, locale === "zh" ? /现已可用/ : /available today/i, "Do not present Hosted as already available");

  const focusList = html.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/);
  assert.ok(focusList, "Present the three focus pillars as a readable list");
  const pillars = [...focusList[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(([, content]) => text(content));
  assert.equal(pillars.length, 3, "Explain device fleet, per-device rules and AI teammates");
  for (const pillar of pillars.slice(0, 2)) assert.match(pillar, locale === "zh" ? /现已可用/ : /available today/i);
  assert.match(pillars[2], locale === "zh" ? /开发中/ : /in development/i);
  const body = text(html);
  assert.match(body, /Windows/i, "Show a concrete computer in the multi-device example");
  assert.match(body, /Mac(?:Book|OS)?/i, "Show cross-device work in the example");
  assert.match(body, locale === "zh" ? /团队|队友|成员/ : /teammate|team/i, "Explain the AI teammate benefit");
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, props, content]) => ({ ...attributes(props), text: text(content) }));
  for (const href of [connectHref, earlyAccessHref]) {
    const link = links.find(item => item.href === href);
    assert.ok(link, "Preserve the supplied localized CTA link and its query");
    assert.match(link.text, locale === "zh" ? /[\u3400-\u9fff]/u : /[A-Za-z]/, "CTAs need useful localized text");
  }
}
console.log("PASS: real bilingual Arc positioning render, accessible heading, current/planned choices, multi-device story and localized CTA links");
