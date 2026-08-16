import { MySqlStore } from "@agent-fabric/persistence-mysql";

import type { ServerConfig } from "./server-config.js";

export type AccountAuthenticationPersistencePort = Pick<MySqlStore,
  | "getAccountSessionByCredential"
>;

export type AccountProductBootstrapPersistencePort = Pick<MySqlStore, "getAccountForCredential">;

export type AccountMigrationRecoveryPersistencePort = Pick<MySqlStore,
  | "getLegacyAgentMigrationRecoveryForCredential"
  | "completeLegacyAgentMigrationRecoveryForCredential"
>;

export type HumanFriendshipManagementPersistencePort = Pick<MySqlStore,
  | "listIncomingFriendInvitationsForCredential"
  | "listOutgoingFriendInvitationsForCredential"
  | "createFriendInvitationForCredential"
  | "acceptFriendInvitationForCredential"
  | "rejectFriendInvitationForCredential"
  | "revokeFriendInvitationForCredential"
  | "listFriendsForCredential"
  | "listActiveFriendUserIdsForAccount"
  | "removeFriendForCredential"
>;

export type AccountRuntimeManagementPersistencePort = Pick<MySqlStore,
  | "listAccountRuntimesForCredential"
  | "getAccountRuntimeForCredential"
  | "createAccountRuntimeForCredential"
  | "updateAccountRuntimeForCredential"
  | "observeAccountRuntimeForCredential"
  | "refreshAccountRuntimeForCredential"
  | "planAccountRuntimeDeletionForCredential"
  | "prepareAccountRuntimeDeletionForCredential"
  | "settleAccountRuntimeDeletionTasksForCredential"
  | "deleteAccountRuntimeForCredential"
>;

export type AccountRuntimeConnectionPersistencePort = Pick<MySqlStore, "assertAccountRuntimeConnectionForCredential">;
export type AccountRuntimeObservationPersistencePort = Pick<MySqlStore, "getAccountRuntimeForCredential" | "observeAccountRuntimeForCredential">;

export type AccountAgentManagementPersistencePort = Pick<MySqlStore,
  | "createAccountAgentForCredential"
  | "getAccountAgentForCredential"
  | "getAccountAgentDetailForCredential"
  | "listAccountAgentsForCredential"
  | "queryAccountAgentCatalogForCredential"
  | "updateAccountAgentForCredential"
  | "archiveAccountAgentForCredential"
  | "restoreAccountAgentForCredential"
  | "batchAccountAgentLifecycleForCredential"
  | "listAccountAgentActivitiesForCredential"
  | "listAccountAgentSkillsForCredential"
  | "mutateAccountAgentSkillForCredential"
  | "prepareAccountAgentPrivateConfigurationForCredential"
  | "commitAccountAgentPrivateConfigurationSummaryForCredential"
  | "recordAccountAgentPrivateConfigurationAuditForCredential"
>;

export type AccountAgentCreationPersistencePort = Pick<MySqlStore,
  | "createAccountAgentDraftForCredential"
  | "getAccountAgentDraftForCredential"
  | "listAccountAgentDraftsForCredential"
  | "saveAccountAgentDraftForCredential"
  | "startAccountAgentBuilderTurnForCredential"
  | "completeAccountAgentBuilderTurnForCredential"
  | "validateAccountAgentDraftForCredential"
  | "createAccountAgentFromDraftForCredential"
>;

export type AccountAgentA2APersistencePort = Pick<MySqlStore,
  | "listInvokableAccountAgentsForCredential"
  | "getInvokableAccountAgentForCredential"
  | "createAccountA2ATaskForCredential"
  | "updateAccountA2ATaskState"
  | "getReadableAccountA2ATaskRouteForCredential"
>;

export type AccountSelfTestPersistencePort = Pick<MySqlStore,
  | "createAccountSelfTestForCredential"
  | "revokeAccountSelfTestForCredential"
>;

export type PersistenceStore = MySqlStore;

export function createPersistenceStore(config: ServerConfig): PersistenceStore {
  return new MySqlStore(config.databaseUrl);
}

export function requireAccountAuthenticationPersistence(store: PersistenceStore): AccountAuthenticationPersistencePort {
  const candidate = store as PersistenceStore & Partial<AccountAuthenticationPersistencePort>;
  const methods = ["getAccountSessionByCredential"] as const;
  if (methods.some((method) => typeof candidate[method] !== "function")) throw new Error("account-authentication-storage-unavailable");
  return candidate as PersistenceStore & AccountAuthenticationPersistencePort;
}

export function requireAccountProductBootstrapPersistence(store: PersistenceStore): AccountProductBootstrapPersistencePort {
  const candidate = store as PersistenceStore & Partial<AccountProductBootstrapPersistencePort>;
  if (typeof candidate.getAccountForCredential !== "function") throw new Error("account-bootstrap-storage-unavailable");
  return candidate as PersistenceStore & AccountProductBootstrapPersistencePort;
}

export function requireAccountMigrationRecoveryPersistence(store: PersistenceStore): AccountMigrationRecoveryPersistencePort {
  const candidate = store as PersistenceStore & Partial<AccountMigrationRecoveryPersistencePort>;
  const methods = ["getLegacyAgentMigrationRecoveryForCredential", "completeLegacyAgentMigrationRecoveryForCredential"] as const;
  if (methods.some((method) => typeof candidate[method] !== "function")) throw new Error("account-migration-recovery-storage-unavailable");
  return candidate as PersistenceStore & AccountMigrationRecoveryPersistencePort;
}

export function requireHumanFriendshipManagementPersistence(store: PersistenceStore): HumanFriendshipManagementPersistencePort {
  const candidate = store as PersistenceStore & Partial<HumanFriendshipManagementPersistencePort>;
  const methods = [
    "listIncomingFriendInvitationsForCredential", "listOutgoingFriendInvitationsForCredential", "createFriendInvitationForCredential",
    "acceptFriendInvitationForCredential", "rejectFriendInvitationForCredential", "revokeFriendInvitationForCredential",
    "listFriendsForCredential", "removeFriendForCredential",
  ] as const;
  if (methods.some((method) => typeof candidate[method] !== "function")) throw new Error("human-friendship-storage-unavailable");
  return candidate as PersistenceStore & HumanFriendshipManagementPersistencePort;
}

export function requireAccountRuntimeManagementPersistence(store: PersistenceStore): AccountRuntimeManagementPersistencePort {
  const candidate = store as PersistenceStore & Partial<AccountRuntimeManagementPersistencePort>;
  const methods = ["listAccountRuntimesForCredential", "getAccountRuntimeForCredential", "createAccountRuntimeForCredential", "updateAccountRuntimeForCredential", "observeAccountRuntimeForCredential", "refreshAccountRuntimeForCredential", "planAccountRuntimeDeletionForCredential", "prepareAccountRuntimeDeletionForCredential", "settleAccountRuntimeDeletionTasksForCredential", "deleteAccountRuntimeForCredential"] as const;
  if (methods.some((method) => typeof candidate[method] !== "function")) throw new Error("account-runtime-storage-unavailable");
  return candidate as PersistenceStore & AccountRuntimeManagementPersistencePort;
}

export function requireAccountRuntimeConnectionPersistence(store: PersistenceStore): AccountRuntimeConnectionPersistencePort {
  const candidate = store as PersistenceStore & Partial<AccountRuntimeConnectionPersistencePort>;
  if (typeof candidate.assertAccountRuntimeConnectionForCredential !== "function") throw new Error("account-runtime-connection-storage-unavailable");
  return candidate as PersistenceStore & AccountRuntimeConnectionPersistencePort;
}

export function requireAccountRuntimeObservationPersistence(store: PersistenceStore): AccountRuntimeObservationPersistencePort {
  const candidate = store as PersistenceStore & Partial<AccountRuntimeObservationPersistencePort>;
  if (typeof candidate.getAccountRuntimeForCredential !== "function" || typeof candidate.observeAccountRuntimeForCredential !== "function") throw new Error("account-runtime-observation-storage-unavailable");
  return candidate as PersistenceStore & AccountRuntimeObservationPersistencePort;
}

export function requireAccountAgentManagementPersistence(store: PersistenceStore): AccountAgentManagementPersistencePort {
  const candidate = store as PersistenceStore & Partial<AccountAgentManagementPersistencePort>;
  const methods = ["createAccountAgentForCredential", "getAccountAgentForCredential", "getAccountAgentDetailForCredential", "listAccountAgentsForCredential", "queryAccountAgentCatalogForCredential", "updateAccountAgentForCredential", "archiveAccountAgentForCredential", "restoreAccountAgentForCredential", "batchAccountAgentLifecycleForCredential", "listAccountAgentActivitiesForCredential", "listAccountAgentSkillsForCredential", "mutateAccountAgentSkillForCredential", "prepareAccountAgentPrivateConfigurationForCredential", "commitAccountAgentPrivateConfigurationSummaryForCredential", "recordAccountAgentPrivateConfigurationAuditForCredential"] as const;
  if (methods.some((method) => typeof candidate[method] !== "function")) throw new Error("account-agent-storage-unavailable");
  return candidate as PersistenceStore & AccountAgentManagementPersistencePort;
}

export function requireAccountAgentCreationPersistence(store: PersistenceStore): AccountAgentCreationPersistencePort {
  const candidate = store as PersistenceStore & Partial<AccountAgentCreationPersistencePort>;
  const methods = ["createAccountAgentDraftForCredential", "getAccountAgentDraftForCredential", "listAccountAgentDraftsForCredential", "saveAccountAgentDraftForCredential", "startAccountAgentBuilderTurnForCredential", "completeAccountAgentBuilderTurnForCredential", "validateAccountAgentDraftForCredential", "createAccountAgentFromDraftForCredential"] as const;
  if (methods.some((method) => typeof candidate[method] !== "function")) throw new Error("account-agent-creation-storage-unavailable");
  return candidate as PersistenceStore & AccountAgentCreationPersistencePort;
}

export function requireAccountAgentA2APersistence(store: PersistenceStore): AccountAgentA2APersistencePort {
  const candidate = store as PersistenceStore & Partial<AccountAgentA2APersistencePort>;
  const methods = ["listInvokableAccountAgentsForCredential", "getInvokableAccountAgentForCredential", "createAccountA2ATaskForCredential", "updateAccountA2ATaskState", "getReadableAccountA2ATaskRouteForCredential"] as const;
  if (methods.some((method) => typeof candidate[method] !== "function")) throw new Error("account-agent-a2a-storage-unavailable");
  return candidate as PersistenceStore & AccountAgentA2APersistencePort;
}

export function requireAccountSelfTestPersistence(store: PersistenceStore): AccountSelfTestPersistencePort {
  const candidate = store as PersistenceStore & Partial<AccountSelfTestPersistencePort>;
  const methods = ["createAccountSelfTestForCredential", "revokeAccountSelfTestForCredential"] as const;
  if (methods.some((method) => typeof candidate[method] !== "function")) throw new Error("account-self-test-storage-unavailable");
  return candidate as PersistenceStore & AccountSelfTestPersistencePort;
}
