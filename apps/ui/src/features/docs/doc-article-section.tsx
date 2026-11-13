import React from "react";
import type { DocSection } from "../../../../../packages/docs/src/catalog.js";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/docs/doc-article-section.css";

/** Renders one documentation section: opening paragraph, list, more paragraphs and a note. */
export function DocArticleSection({ section }: { section: DocSection }) {
  const { locale } = useI18n();
  const List = section.list?.ordered ? "ol" : "ul";
  return (
    <section className="docArticleSection">
      <h2>{section.heading[locale]}</h2>
      <p>{section.text[locale]}</p>
      {section.list && (
        <List className="docArticleList">
          {section.list.items.map((item, index) => (
            <li key={index}>{item[locale]}</li>
          ))}
        </List>
      )}
      {section.paragraphs?.map((paragraph, index) => (
        <p key={index}>{paragraph[locale]}</p>
      ))}
      {section.note && <p className="docArticleNote">{section.note[locale]}</p>}
    </section>
  );
}
