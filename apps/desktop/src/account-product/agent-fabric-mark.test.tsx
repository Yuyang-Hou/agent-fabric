// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AGENT_FABRIC_MARK_PATH, AgentFabricMark } from "./agent-fabric-mark.js";

afterEach(cleanup);

describe("Agent Fabric mark", () => {
  it("renders the canonical mouthless monochrome geometry", () => {
    const { container } = render(<AgentFabricMark aria-label="Agent Fabric" />);
    const svg = container.querySelector("[data-agent-fabric-mark]");
    const path = svg?.querySelector("path");

    expect(svg?.getAttribute("viewBox")).toBe("0 0 1024 1024");
    expect(path?.getAttribute("d")).toBe(AGENT_FABRIC_MARK_PATH);
    expect(path?.getAttribute("fill-rule")).toBe("evenodd");
    expect(svg?.querySelectorAll("path")).toHaveLength(1);
  });
});
