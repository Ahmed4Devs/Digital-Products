import arAccount from "./ar/account.json";
import arAdmin from "./ar/admin.json";
import arAuth from "./ar/auth.json";
import arCommon from "./ar/common.json";
import arEmails from "./ar/emails.json";
import arStore from "./ar/store.json";
import enAccount from "./en/account.json";
import enAdmin from "./en/admin.json";
import enAuth from "./en/auth.json";
import enCommon from "./en/common.json";
import enEmails from "./en/emails.json";
import enStore from "./en/store.json";

// Messages are split by domain; each domain becomes a top-level namespace.
const ar = {
  common: arCommon,
  store: arStore,
  auth: arAuth,
  account: arAccount,
  admin: arAdmin,
  emails: arEmails,
};

/** Arabic (the default locale) is the source of truth for message keys and their types. */
export type Messages = typeof ar;
export type MessageNamespace = keyof Messages;

const en: Messages = {
  common: enCommon,
  store: enStore,
  auth: enAuth,
  account: enAccount,
  admin: enAdmin,
  emails: enEmails,
};

export const messagesByLocale = { ar, en } as const;
