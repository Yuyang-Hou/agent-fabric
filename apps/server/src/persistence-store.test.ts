import { describe, expect, it } from "vitest";

import { MySqlStore } from "@agent-fabric/persistence-mysql";
import { createPersistenceStore } from "./persistence-store.js";
import { loadServerConfig } from "./server-config.js";

const baseEnvironment = {
  AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787",
};

describe("Server persistence selection", () => {
  it("uses MySQL as the Account Agents product database", async () => {
    const store = createPersistenceStore(loadServerConfig({ ...baseEnvironment, DATABASE_URL: "mysql://agent:secret@localhost/agent_fabric" }));
    expect(store).toBeInstanceOf(MySqlStore);
    await store.close();
  });
});
