import "server-only";

/**
 * Buzzebees API access, sourced from the environment.
 *
 * Every value is read lazily rather than at module load, so `next build` — and
 * any route that never talks to Buzzebees — works without them being set. A
 * missing variable fails at the point of use with a message naming it.
 *
 * `server-only` keeps this module out of any client bundle, so nothing here
 * reaches the browser.
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

/** Non-secret endpoints: overridable to point at staging, production default. */
export function merchantBaseUrl(): string {
  return (
    process.env.BUZZEBEES_MERCHANT_BASE_URL?.trim() ||
    "https://api1servicewallet.buzzebees.com"
  );
}

export function stampWalletBaseUrl(): string {
  return (
    process.env.BUZZEBEES_STAMP_WALLET_BASE_URL?.trim() ||
    "https://stampwalletmodule.buzzebees.com"
  );
}

/** CRM Plus back office, which owns the profile-update endpoint. */
export function crmPlusBaseUrl(): string {
  return (
    process.env.BUZZEBEES_CRMPLUS_BASE_URL?.trim() ||
    "https://buzzcrmplusssomodule.buzzebees.com"
  );
}

/**
 * The tenant whose members and levels this deployment manages.
 *
 * Sent as `agencyId` when listing levels, and carried on every profile the
 * update endpoint writes back.
 */
export function agencyId(): string {
  return required("BUZZEBEES_AGENCY_ID");
}

export function appId(): string {
  return required("BUZZEBEES_APP_ID");
}

export type MerchantCredentials = {
  username: string;
  password: string;
  terminalid: string;
  branchid: string;
  brandid: string;
};

/** Sent as multipart/form-data fields to `POST /merchant/login`. */
export function merchantCredentials(): MerchantCredentials {
  return {
    username: required("BUZZEBEES_USERNAME"),
    password: required("BUZZEBEES_PASSWORD"),
    terminalid: required("BUZZEBEES_TERMINAL_ID"),
    branchid: required("BUZZEBEES_BRANCH_ID"),
    brandid: required("BUZZEBEES_BRAND_ID"),
  };
}

/** Every variable the Buzzebees integration needs, for the health probe. */
export const REQUIRED_BUZZEBEES_VARS = [
  "BUZZEBEES_APP_ID",
  "BUZZEBEES_USERNAME",
  "BUZZEBEES_PASSWORD",
  "BUZZEBEES_TERMINAL_ID",
  "BUZZEBEES_BRANCH_ID",
  "BUZZEBEES_BRAND_ID",
] as const;

export function missingBuzzebeesVars(): string[] {
  return REQUIRED_BUZZEBEES_VARS.filter(
    (name) => !process.env[name]?.trim(),
  );
}

/** Credential values that must never reach a log or an error message. */
export function secretValues(): string[] {
  return [process.env.BUZZEBEES_PASSWORD?.trim()].filter(
    (value): value is string => Boolean(value),
  );
}

/**
 * Path of the endpoint that verifies an operator's credentials.
 *
 * Buzzebees exposes several login endpoints and which one authenticates
 * operators differs per deployment, so this is configurable rather than
 * hard-coded. It is joined onto `merchantBaseUrl()`.
 */
export function operatorLoginPath(): string {
  return process.env.BUZZEBEES_LOGIN_PATH?.trim() || "/merchant/login";
}

/**
 * The variables operator login needs.
 *
 * Only the app id: the terminal, branch and brand are typed on the login form
 * by the operator, not configured per deployment.
 */
export const REQUIRED_LOGIN_VARS = ["BUZZEBEES_APP_ID"] as const;

export function missingLoginVars(): string[] {
  return REQUIRED_LOGIN_VARS.filter((name) => !process.env[name]?.trim());
}
