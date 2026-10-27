import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  KEY_NAV_DEBOUNCE_MS,
  keyNavAllowed,
  projectorKeyAction,
} from "./projector_keys.ts";
import { projectorHtml } from "./projector_ui.ts";

const idle = { typing: false, modalOpen: false, onButton: false };

Deno.test("keys: next and back, including clicker PageUp/PageDown", () => {
  for (const key of ["ArrowRight", "PageDown", " ", "Enter"]) {
    assertEquals(projectorKeyAction({ key }, idle), "next", key);
  }
  for (const key of ["ArrowLeft", "PageUp"]) {
    assertEquals(projectorKeyAction({ key }, idle), "back", key);
  }
});

Deno.test("keys: nothing maps to Reset; other keys ignored", () => {
  for (
    const key of ["r", "R", "Delete", "Backspace", "Escape", "Home", "End", "ArrowUp", "ArrowDown", "Tab", "b"]
  ) {
    assertEquals(projectorKeyAction({ key }, idle), null, key);
  }
});

Deno.test("keys: ignored while typing, with a modal open, held or chorded", () => {
  const keys = ["ArrowRight", "ArrowLeft", "PageDown", "PageUp", " ", "Enter"];
  for (const key of keys) {
    assertEquals(projectorKeyAction({ key }, { ...idle, typing: true }), null);
    assertEquals(projectorKeyAction({ key }, { ...idle, modalOpen: true }), null);
    assertEquals(projectorKeyAction({ key, repeat: true }, idle), null);
    assertEquals(projectorKeyAction({ key, ctrlKey: true }, idle), null);
    assertEquals(projectorKeyAction({ key, metaKey: true }, idle), null);
    assertEquals(projectorKeyAction({ key, altKey: true }, idle), null);
  }
});

Deno.test("keys: Space/Enter on a focused button activate the button, not Next", () => {
  const ctx = { ...idle, onButton: true };
  assertEquals(projectorKeyAction({ key: " " }, ctx), null);
  assertEquals(projectorKeyAction({ key: "Enter" }, ctx), null);
  assertEquals(projectorKeyAction({ key: "ArrowRight" }, ctx), "next");
  assertEquals(projectorKeyAction({ key: "PageUp" }, ctx), "back");
});

Deno.test("keys: debounce allows one step per window", () => {
  assertEquals(keyNavAllowed(0, -Infinity, KEY_NAV_DEBOUNCE_MS), true);
  assertEquals(keyNavAllowed(1000, 1000 - KEY_NAV_DEBOUNCE_MS + 1, KEY_NAV_DEBOUNCE_MS), false);
  assertEquals(keyNavAllowed(1000, 1000 - KEY_NAV_DEBOUNCE_MS, KEY_NAV_DEBOUNCE_MS), true);
});

Deno.test("keys: projector page embeds the same mapping", () => {
  const html = projectorHtml("https://example.test/s/x", "<svg></svg>");
  assertEquals(html.includes(projectorKeyAction.toString()), true);
  assertEquals(html.includes(keyNavAllowed.toString()), true);
});
