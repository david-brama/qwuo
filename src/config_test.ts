import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadConfig,
  parseFilterCliArgs,
  parseQuizFilterEnv,
  resolveFilters,
} from "./config.ts";

Deno.test("parseQuizFilterEnv: empty / undefined", () => {
  assertEquals(parseQuizFilterEnv(undefined), []);
  assertEquals(parseQuizFilterEnv(""), []);
  assertEquals(parseQuizFilterEnv("   "), []);
  assertEquals(parseQuizFilterEnv(";;;"), []);
});

Deno.test("parseQuizFilterEnv: single and multi with spaces", () => {
  assertEquals(parseQuizFilterEnv("live=true"), [
    { key: "live", value: "true" },
  ]);
  assertEquals(
    parseQuizFilterEnv(
      "live=true;domain=Tool Design & MCP Integration",
    ),
    [
      { key: "live", value: "true" },
      { key: "domain", value: "Tool Design & MCP Integration" },
    ],
  );
  assertEquals(
    parseQuizFilterEnv(" domain=A ; ; live=false "),
    [
      { key: "domain", value: "A" },
      { key: "live", value: "false" },
    ],
  );
});

Deno.test("parseQuizFilterEnv: malformed segment throws", () => {
  assertThrows(() => parseQuizFilterEnv("novalue"), Error, "missing");
});

Deno.test("parseFilterCliArgs: --filter and --filter=", () => {
  assertEquals(parseFilterCliArgs([]), []);
  assertEquals(
    parseFilterCliArgs(["--filter", "live=true", "--filter=domain=A"]),
    [
      { key: "live", value: "true" },
      { key: "domain", value: "A" },
    ],
  );
});

Deno.test("parseFilterCliArgs: spaced value already one argv token", () => {
  assertEquals(
    parseFilterCliArgs([
      "--filter",
      "domain=Tool Design & MCP Integration",
    ]),
    [{ key: "domain", value: "Tool Design & MCP Integration" }],
  );
  assertEquals(
    parseFilterCliArgs([
      "--filter=domain=Tool Design & MCP Integration",
    ]),
    [{ key: "domain", value: "Tool Design & MCP Integration" }],
  );
});

Deno.test("parseFilterCliArgs: rejects unknown operands (no re-join)", () => {
  assertThrows(
    () =>
      parseFilterCliArgs([
        "--filter",
        "domain=Tool",
        "Design",
      ]),
    Error,
    "Unknown CLI argument",
  );
  assertThrows(
    () => parseFilterCliArgs(["--other"]),
    Error,
    "Unknown CLI argument",
  );
  assertThrows(
    () => parseFilterCliArgs(["--filter"]),
    Error,
    "requires a key=value",
  );
});

Deno.test("parseFilterCliArgs: ignores lone -- separators", () => {
  assertEquals(
    parseFilterCliArgs(["--", "--filter", "live=true"]),
    [{ key: "live", value: "true" }],
  );
});

Deno.test("resolveFilters: env then CLI", () => {
  assertEquals(
    resolveFilters("live=true", [
      "--filter",
      "domain=Tool Design & MCP Integration",
    ]),
    [
      { key: "live", value: "true" },
      { key: "domain", value: "Tool Design & MCP Integration" },
    ],
  );
});

Deno.test("loadConfig: filters from options (no Deno.env QUIZ_FILTER side effects)", () => {
  const cfg = loadConfig({
    args: ["--filter", "live=true"],
    envFilter: "domain=A",
  });
  assertEquals(cfg.filters, [
    { key: "domain", value: "A" },
    { key: "live", value: "true" },
  ]);
});
