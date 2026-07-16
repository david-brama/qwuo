/** Embed marked (UMD min) into inline scripts. Trusted quiz content only. */
let cached: string | null = null;

export function markedBundleScript(): string {
  if (cached == null) {
    const url = import.meta.resolve("marked/marked.min.js");
    cached = Deno.readTextFileSync(new URL(url));
  }
  return cached;
}

/** Client helper after marked UMD loads: parse md → HTML. */
export const MD_RENDER_JS = /* js */ `
    marked.setOptions({ gfm: true, breaks: true });
    function md(src) {
      return marked.parse(String(src ?? ""), { async: false });
    }
`;
