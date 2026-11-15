/** A copy glyph that turns into a check once the text is copied. */
export function CopyIcon({ done }: { done: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
      {done ? (
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      ) : (
        <>
          <rect x="8" y="8" width="12" height="12" rx="2.5" />
          <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
        </>
      )}
    </svg>
  );
}
