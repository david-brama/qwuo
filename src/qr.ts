import { qrcode } from "jsr:@libs/qrcode@3";

/** SVG QR for player join URL (server-side, offline). */
export function qrSvg(text: string, _moduleSize = 8, border = 2): string {
  return qrcode(text, { output: "svg", border });
}
