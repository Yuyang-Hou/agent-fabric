import {
  CodexAcpRuntimeAdapter,
  NodeCodexAcpProcessFactory,
  SdkCodexAcpClientFactory,
} from "@agent-fabric/runtime-codex-acp";

export function createCodexRuntimeAdapter(options: {
  readonly adapterPath: string;
  readonly nodeExecutablePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
}): CodexAcpRuntimeAdapter {
  return new CodexAcpRuntimeAdapter(
    new SdkCodexAcpClientFactory(
      new NodeCodexAcpProcessFactory({
        adapterPath: options.adapterPath,
        ...(options.nodeExecutablePath ? { nodeExecutablePath: options.nodeExecutablePath } : {}),
        ...(options.environment ? { environment: options.environment } : {}),
      }),
    ),
  );
}
