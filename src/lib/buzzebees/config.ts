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

/**
 * The CRM Plus module that serves the level list and the change log.
 *
 * A different host from the one profile updates go to — `buzzcrmplusmodule`
 * rather than `buzzcrmplusssomodule` — so the two are configured separately
 * rather than sharing a base and quietly sending one endpoint's request to the
 * other's host.
 */
export function crmPlusModuleBaseUrl(): string {
  return (
    process.env.BUZZEBEES_CRMPLUS_MODULE_BASE_URL?.trim() ||
    "https://buzzcrmplusmodule.buzzebees.com"
  );
}

/**
 * CRM Plus back office: profile updates.
 *
 * Every default here is production. Reference requests for these endpoints
 * have been captured against `-uat` hosts, but those are request templates —
 * the shape of a call, not the host to send it to. Point this at a non-
 * production host only to deliberately target one.
 *
 * This one serves `/crmplusoffice/*`; the level list lives on
 * `crmPlusModuleBaseUrl()`.
 */
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

/**
 * Single sign-on, which issues the token the CRM Plus endpoints accept.
 *
 * Signing in hits this alongside the wallet login: the two return different
 * tokens, and the back office uses each for its own set of endpoints.
 *
 * Required rather than defaulted. Every sign-in posts an operator's real
 * credentials here, so the host is one to be chosen deliberately, not one this
 * app guesses — an unset variable fails loudly instead of sending a password
 * somewhere nobody picked.
 */
export function ssoBaseUrl(): string {
  return required("BUZZEBEES_SSO_BASE_URL");
}

/** As `BUZZEBEES_LOGIN_PATH`, but for single sign-on. */
export function ssoLoginPath(): string {
  return process.env.BUZZEBEES_SSO_LOGIN_PATH?.trim() || "/auth/bzbs_login";
}

export function appId(): string {
  return required("BUZZEBEES_APP_ID");
}

/**
 * Every variable the Buzzebees integration needs, for the health probe.
 *
 * No credentials among them: operators sign in with their own, and the token
 * they get back is what every later call travels with. The terminal, branch
 * and brand are typed at the login screen, not configured here.
 */
export const REQUIRED_BUZZEBEES_VARS = [
  "BUZZEBEES_APP_ID",
  "BUZZEBEES_AGENCY_ID",
] as const;

export function missingBuzzebeesVars(): string[] {
  return REQUIRED_BUZZEBEES_VARS.filter(
    (name) => !process.env[name]?.trim(),
  );
}

/**
 * Path of the endpoint that verifies an operator's credentials.
 *
 * Buzzebees exposes several login endpoints and which one authenticates
 * operators differs per deployment, so this is configurable rather than
 * hard-coded. A path is joined onto `merchantBaseUrl()`; a whole URL is used
 * as given; and a bare host gets `/merchant/login` appended, since a host on
 * its own is a base to send the login to rather than the endpoint itself.
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
