/** The account's email language from the browser's first Accept-Language
 * tag: Chinese for any zh tag, otherwise English. */
export function requestLocale(request: Request): "en" | "zh" {
  const first = (request.headers.get("accept-language") || "").split(",")[0]?.trim().toLowerCase();
  return first?.startsWith("zh") ? "zh" : "en";
}
