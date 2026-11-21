import { describe, expect, it } from "vitest";
import { releaseVersionFromTag } from "./index";

describe("releaseVersionFromTag", () => {
  it("extracts a stable version for installer filenames", () => {
    expect(releaseVersionFromTag("v0.12.3")).toBe("0.12.3");
  });

  it.each(["main", "0.1.0", "v0.01.0", "v0.1.0-rc.1", "v0.1.0\n"])("rejects %j", (tag) => {
    expect(() => releaseVersionFromTag(tag)).toThrow("Expected a stable release tag");
  });
});
