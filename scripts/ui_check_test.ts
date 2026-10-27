/**
 * Projector layout check inside `deno task test`: the longest questions plus
 * a sample at all four projector sizes. Skipped when no Chrome/Chromium is
 * installed or SKIP_UI_CHECK=1. Full run: `deno task test:ui`.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findBrowser } from "./ui_check.ts";

const skip = Deno.env.get("SKIP_UI_CHECK") === "1" || findBrowser() === null;

Deno.test({
  name: "projector fits without scrolling at 1024x768 … 1920x1080; QR decodes",
  ignore: skip,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { runUiCheck, formatStats } = await import("./ui_check.ts");
    const longest = Number(Deno.env.get("UI_CHECK_LONGEST") || "") || 6;
    const res = await runUiCheck({ longest, log: () => {} });
    console.log(formatStats(res.stats));
    assertEquals(res.failures, []);
  },
});
