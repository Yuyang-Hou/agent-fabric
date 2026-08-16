import { accountResourceInvalidationSchema, type AccountResourceInvalidation } from "@agent-fabric/account-agent-domain";

export interface AccountInvalidationTransport {
  readonly readyState: number;
  send(value: string): void;
}

export class AccountInvalidationHub {
  readonly #accountSubscribers = new Map<string, Set<AccountInvalidationTransport>>();
  readonly #humanSubscribers = new Map<string, Set<AccountInvalidationTransport>>();

  register(accountId: string, transport: AccountInvalidationTransport, userId?: string): () => void {
    const account = this.#accountSubscribers.get(accountId) ?? new Set<AccountInvalidationTransport>();
    account.add(transport);
    this.#accountSubscribers.set(accountId, account);
    const human = userId ? this.#humanSubscribers.get(userId) ?? new Set<AccountInvalidationTransport>() : undefined;
    human?.add(transport);
    if (userId && human) this.#humanSubscribers.set(userId, human);
    return () => {
      account.delete(transport);
      if (account.size === 0) this.#accountSubscribers.delete(accountId);
      human?.delete(transport);
      if (userId && human?.size === 0) this.#humanSubscribers.delete(userId);
    };
  }

  publish(value: AccountResourceInvalidation): void {
    const event = accountResourceInvalidationSchema.parse(value);
    const encoded = JSON.stringify(event);
    const subscribers = event.type === "account-resource-invalidated" ? this.#accountSubscribers.get(event.accountId) : this.#humanSubscribers.get(event.userId);
    for (const subscriber of subscribers ?? []) {
      if (subscriber.readyState === 1) subscriber.send(encoded);
    }
  }
}
