import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { App } from "./app";

afterEach(cleanup);

it("renders the shell status and version from desktop metadata", () => {
  const { rerender } = render(<App desktop={{ name: "Agent Desktop", version: "0.1.0" }} />);
  expect(screen.getByRole("heading", { name: "Agent Desktop" })).toBeTruthy();
  expect(screen.getByText("Application shell is operational")).toBeTruthy();
  expect(screen.getByText("Version 0.1.0")).toBeTruthy();

  rerender(<App desktop={{ name: "Agent Desktop", version: "0.2.0" }} />);
  expect(screen.getByText("Version 0.2.0")).toBeTruthy();
  expect(screen.queryByText("Version 0.1.0")).toBeNull();
});
