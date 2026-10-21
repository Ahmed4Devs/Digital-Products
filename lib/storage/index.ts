import "server-only";
import { serverEnv } from "@/lib/env/server";
import { createStorage, type Storage } from "./client";

let storage: Storage | undefined;

/** The application's storage client, created on first use. */
export function getStorage(): Storage {
  storage ??= createStorage(serverEnv());
  return storage;
}
