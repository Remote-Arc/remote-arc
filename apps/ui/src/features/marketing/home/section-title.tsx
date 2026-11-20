/**
 * A section headline in two tones: the first sentence carries the weight and the
 * rest steps back ("Ask in chat. Watch the work get done."). English splits at
 * ". " so names like Node.js stay whole; Chinese splits at the first full-width
 * comma or full stop. The split keeps the original spacing (the space after an
 * English full stop, none after Chinese punctuation). One sentence stays one tone.
 */
export function SectionTitle({ text, id }: { text: string; id?: string }) {
  const match = /^(.+?(?:\.\s|[。，！？]))(.+)$/u.exec(text);
  return (
    <h2 id={id}>
      {match ? (
        <>
          {match[1]}
          <span className="sectionTitleRest">{match[2]}</span>
        </>
      ) : (
        text
      )}
    </h2>
  );
}
