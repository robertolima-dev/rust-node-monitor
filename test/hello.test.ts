import { describe, it, expect } from "vitest";
import { hello } from "../js/index";

describe("hello()", () => {
  it("retorna a saudação vinda do core Rust", () => {
    expect(hello()).toBe("Hello from Rust");
  });

  it("é uma string", () => {
    expect(typeof hello()).toBe("string");
  });
});
