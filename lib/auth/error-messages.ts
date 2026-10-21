/** Message keys under `auth.errors`. */
export type AuthErrorKey =
  | "invalidCredentials"
  | "emailNotVerified"
  | "invalidEmail"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordCompromised"
  | "invalidToken"
  | "captchaFailed"
  | "captchaRequired"
  | "tooManyRequests"
  | "signInFailed"
  | "generic";

// Better Auth error codes → translated messages (spec §7.1). Account-related failures
// all collapse into one message so the UI never tells an attacker which part was wrong.
const CODE_TO_KEY: Readonly<Record<string, AuthErrorKey>> = {
  INVALID_EMAIL_OR_PASSWORD: "invalidCredentials",
  INVALID_USERNAME_OR_PASSWORD: "invalidCredentials",
  USERNAME_TOO_SHORT: "invalidCredentials",
  USERNAME_TOO_LONG: "invalidCredentials",
  INVALID_USERNAME: "invalidCredentials",
  INVALID_PASSWORD: "invalidCredentials",
  USER_NOT_FOUND: "invalidCredentials",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "invalidCredentials",
  EMAIL_NOT_VERIFIED: "emailNotVerified",
  INVALID_EMAIL: "invalidEmail",
  PASSWORD_TOO_SHORT: "passwordTooShort",
  PASSWORD_TOO_LONG: "passwordTooLong",
  PASSWORD_COMPROMISED: "passwordCompromised",
  INVALID_TOKEN: "invalidToken",
  TOKEN_EXPIRED: "invalidToken",
  MISSING_RESPONSE: "captchaRequired",
  VERIFICATION_FAILED: "captchaFailed",
  FAILED_TO_CREATE_SESSION: "signInFailed",
};

export type AuthClientError = {
  code?: string | undefined;
  status?: number | undefined;
};

export function authErrorKey(error: AuthClientError): AuthErrorKey {
  if (error.status === 429) return "tooManyRequests";
  return (error.code && CODE_TO_KEY[error.code]) || "generic";
}
