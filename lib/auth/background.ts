const pending = new Set<Promise<void>>();

/**
 * Runs work (sending auth emails) after the response instead of before it, so a request
 * for an existing account takes as long as one for an unknown address and response times
 * reveal nothing. Failures are logged by error class only; messages can contain
 * addresses.
 */
export function runInBackground(task: Promise<unknown>, label: string): void {
  const tracked: Promise<void> = task
    .then(
      () => undefined,
      (error: unknown) => {
        console.error(
          `[background] ${label} failed:`,
          error instanceof Error ? error.name : "unknown",
        );
      },
    )
    .finally(() => pending.delete(tracked));
  pending.add(tracked);
}

/** Resolves once every queued task has finished. Used by tests and graceful shutdown. */
export async function settleBackgroundTasks(): Promise<void> {
  while (pending.size > 0) {
    await Promise.all(pending);
  }
}
