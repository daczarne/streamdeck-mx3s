import { defineConfig } from "vitest/config";

export default defineConfig({
  // Oxc can't lower standard decorators yet, only TypeScript's legacy ones, and Node can't run them. The action's
  // tests replace @action with a decorator that returns the class unchanged, which works the same either way. The
  // build compiles with tsc, which keeps the standard ones.
  oxc: { decorator: { legacy: true } },
  test: {
    // The plugin's tests, and the scripts' tests, which sit next to them.
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    mockReset: true,
  },
});
