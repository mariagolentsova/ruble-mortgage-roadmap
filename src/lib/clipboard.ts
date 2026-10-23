// Copying text inside Telegram Mini Apps and ordinary browsers.
// Browsers (and Telegram's in-app WebViews) allow writing to the clipboard only while the user's tap
// is still "fresh", so call copyText() straight from the click handler, before any `await`.

/** Old-style copy through a hidden textarea; works in WebViews without the Clipboard API. */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length); // iOS ignores select() alone
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/** Copies text to the clipboard; resolves to whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* refused (no permission, old WebView) — try the old way */
    }
  }
  return legacyCopy(text);
}
