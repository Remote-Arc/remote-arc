import { useEffect, useState } from "react";

/** The current URL hash without "#", kept up to date as links change it, so a page
 * can react to the part another page linked to (for example /pricing#max). */
export function useUrlHash() {
  const read = () => (typeof window === "undefined" ? "" : window.location.hash.slice(1));
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const onHash = () => setHash(read());
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}
