#!/usr/bin/env node
import { createAgentFabricServer } from "./server.js";
import { loadServerConfig } from "./server-config.js";

const server = createAgentFabricServer(loadServerConfig(process.env));
await server.start();
process.stdout.write(`agent-fabric-server-ready ${server.config.publicBaseUrl}\n`);

const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
