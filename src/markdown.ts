/** Embed marked + DOMPurify (UMD min) into inline scripts. */

let markedCached: string | null = null;
let purifyCached: string | null = null;

export function markedBundleScript(): string {
  if (markedCached == null) {
    const url = import.meta.resolve("marked/marked.min.js");
    markedCached = Deno.readTextFileSync(new URL(url));
  }
  return markedCached;
}

export function purifyBundleScript(): string {
  if (purifyCached == null) {
    const url = import.meta.resolve("dompurify/dist/purify.min.js");
    purifyCached = Deno.readTextFileSync(new URL(url));
  }
  return purifyCached;
}

/** Client helper after marked + DOMPurify UMD load: md → sanitized HTML. */
export const MD_RENDER_JS = /* js */ `
    marked.setOptions({ gfm: true, breaks: true });
    function md(src) {
      const raw = marked.parse(String(src ?? ""), { async: false });
      return DOMPurify.sanitize(raw);
    }
`;
