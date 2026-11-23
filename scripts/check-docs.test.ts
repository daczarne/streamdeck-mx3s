import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createScriptFolder, type ScriptFolder } from "../src/test-support/script-folder";

//* Fakes

let folder: ScriptFolder;

beforeEach(() => {
  folder = createScriptFolder("mx3s-check-docs-test-");
});

afterEach(() => {
  folder.remove();
});

/** Writes the lines given as a file in the folder. */
function write(file: string, ...lines: string[]): void {
  folder.write(file, `${lines.join("\n")}\n`);
}

/** Runs the check in the folder. */
function check() {
  return folder.run("scripts/check-docs.mjs");
}

//* Tests

describe("check-docs", () => {
  it("accepts a file whose every declaration has a doc comment", () => {
    write(
      "src/module.ts",
      "/** A function. */",
      "export function run(): void {}",
      "",
      "/** A function held by a variable. */",
      "const arrow = () => 1;",
      "",
      "/** A class. */",
      "export class Thing {",
      "  /** Its constructor. */",
      "  constructor() {}",
      "",
      "  /** A method. */",
      "  method(): number {",
      "    return arrow();",
      "  }",
      "}",
    );

    const { status, stdout } = check();

    expect(status).toBe(0);
    expect(stdout).toContain("check-docs: OK");
  });

  it.each([
    ["a function", "export function run(): void {}", "src/module.ts:1: function run has no doc comment"],
    [
      "a function held by a variable",
      "export const run = () => {};",
      "src/module.ts:1: function run has no doc comment",
    ],
    ["a class", "export class Thing {}", "src/module.ts:1: class Thing has no doc comment"],
    ["a class with no name", "export default class {}", "src/module.ts:1: class (anonymous) has no doc comment"],
  ])("refuses %s at the top of a file without a doc comment", (_name, line, error) => {
    write("src/module.ts", line);

    const { status, stderr } = check();

    expect(status).toBe(1);
    expect(stderr).toContain(error);
  });

  it.each([
    ["its constructor", "  constructor() {}", "constructor Thing"],
    ["a method", "  method(): void {}", "method method"],
    ["an accessor", "  get value(): number {\n    return 1;\n  }", "method value"],
    ["a property set to a function", "  handle = (): void => {};", "method handle"],
  ])("refuses %s of a class without a doc comment", (_name, member, declaration) => {
    write("src/module.ts", "/** A class. */", "export class Thing {", member, "}");

    const { status, stderr } = check();

    expect(status).toBe(1);
    expect(stderr).toContain(`src/module.ts:3: ${declaration} has no doc comment`);
  });

  it("refuses a doc comment between a class's decorator and the class, where TypeScript doesn't attach it", () => {
    write("src/module.ts", "@decorated", "/** A class. */", "export class Thing {}");

    const { status, stderr } = check();

    expect(status).toBe(1);
    expect(stderr).toContain("src/module.ts:1: class Thing has no doc comment");
  });

  it("accepts a doc comment above a class's decorator", () => {
    write("src/module.ts", "/** A class. */", "@decorated", "export class Thing {}");

    expect(check().status).toBe(0);
  });

  it("refuses a comment that isn't a doc comment", () => {
    write("src/module.ts", "// A function.", "export function run(): void {}");

    const { status, stderr } = check();

    expect(status).toBe(1);
    expect(stderr).toContain("src/module.ts:2: function run has no doc comment");
  });

  it("accepts a closure inside a function without a doc comment", () => {
    write(
      "src/module.ts",
      "/** A function. */",
      "export function run(): number {",
      "  function inner(): number {",
      "    return 1;",
      "  }",
      "  const arrow = () => inner();",
      "  return arrow();",
      "}",
    );

    expect(check().status).toBe(0);
  });

  it("accepts a variable that holds no function, without a doc comment", () => {
    write("src/module.ts", "export const LIMIT = 3;", "export const handler = makeHandler(() => {});");

    expect(check().status).toBe(0);
  });

  it("accepts a TypeScript doc comment without @param or @returns, which the signature's types make unneeded", () => {
    write(
      "src/module.ts",
      "/** Adds two numbers. */",
      "export function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
    );

    expect(check().status).toBe(0);
  });

  it.each([
    ["a test", "src/module.test.ts"],
    ["a browser test", "browser-tests/page.test.ts"],
    ["a script's test", "scripts/script.test.ts"],
  ])("checks %s", (_name, file) => {
    write(file, "export function run(): void {}");

    const { status, stderr } = check();

    expect(status).toBe(1);
    expect(stderr).toContain(`${file}:1: function run has no doc comment`);
  });

  it.each([
    ["a script", "scripts/script.mjs"],
    ["a probe", "scripts/probes/probe.mjs"],
    ["a config at the root", "rollup.config.mjs"],
    ["a settings page's script", "com.daczarne.mx3s.sdPlugin/ui/page.js"],
  ])("checks %s, as JavaScript", (_name, file) => {
    write(file, "/** A function. */", "function run() {}");

    const { status, stderr } = check();

    expect(status).toBe(1);
    expect(stderr).toContain(`${file}:2: the doc comment of function run lacks a @returns`);
  });

  it.each([
    ["a vendored library", "com.daczarne.mx3s.sdPlugin/ui/vendor/library.js"],
    ["a JavaScript file in src/", "src/module.js"],
  ])("ignores %s", (_name, file) => {
    write(file, "export function run() {}");

    expect(check().status).toBe(0);
  });

  it("accepts a JavaScript doc comment with a typed @param for each parameter and a typed @returns", () => {
    write(
      "scripts/script.mjs",
      "/**",
      " * Adds two numbers.",
      " *",
      " * @param {number} a the first",
      " * @param {{ b: number }} options the second, by name",
      " * @returns {number}",
      " */",
      "function add(a, { b }) {",
      "  return a + b;",
      "}",
    );

    expect(check().status).toBe(0);
  });

  it("refuses a JavaScript doc comment without a @param for a parameter, or a @returns", () => {
    write("scripts/script.mjs", "/** Adds two numbers. */", "function add(a, b) {", "  return a + b;", "}");

    const { status, stderr } = check();

    expect(status).toBe(1);
    expect(stderr).toContain(
      "scripts/script.mjs:2: the doc comment of function add lacks a @param for a, a @param for b, a @returns",
    );
  });

  it("refuses a JavaScript @param or @returns without its type", () => {
    write(
      "scripts/script.mjs",
      "/**",
      " * Doubles.",
      " *",
      " * @param a the number",
      " * @returns",
      " */",
      "function double(a) {}",
    );

    const { status, stderr } = check();

    expect(status).toBe(1);
    expect(stderr).toContain(
      "scripts/script.mjs:7: the doc comment of function double lacks " +
        "a type in the @param for a, a type in its @returns",
    );
  });

  it("doesn't ask a JavaScript constructor or setter for a @returns", () => {
    write(
      "scripts/script.mjs",
      "/** A class. */",
      "class Thing {",
      "  /**",
      "   * Its constructor.",
      "   *",
      "   * @param {number} value the start",
      "   */",
      "  constructor(value) {",
      "    this._value = value;",
      "  }",
      "",
      "  /**",
      "   * Sets the value.",
      "   *",
      "   * @param {number} value the new one",
      "   */",
      "  set value(value) {",
      "    this._value = value;",
      "  }",
      "}",
    );

    expect(check().status).toBe(0);
  });

  it("reports every problem it finds, not only the first", () => {
    write("src/first.ts", "export function one(): void {}");
    write("src/second.ts", "export class Two {}");

    const { status, stderr } = check();

    expect(status).toBe(1);
    expect(stderr).toContain("src/first.ts:1: function one has no doc comment");
    expect(stderr).toContain("src/second.ts:1: class Two has no doc comment");
  });
});
