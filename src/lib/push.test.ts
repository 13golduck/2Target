import { describe, expect, it } from "vitest";

import { safePath } from "./push";

describe("safePath", () => {
  it("apre solo pagine di 2Target", () => {
    expect(safePath("/clienti/3/lead")).toBe("/clienti/3/lead");
    expect(safePath("https://sito-esterno.it")).toBe("/");
    expect(safePath("//sito-esterno.it")).toBe("/");
    expect(safePath(undefined)).toBe("/");
  });
});
