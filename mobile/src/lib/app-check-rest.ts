// FILE: mobile/src/lib/app-check-rest.ts
//
// The request bodies for App Check's App Attest exchange and the server's
// App Check refusal, kept free of React Native so they are unit tested with
// the plain `node --test` runner (tests/app-check.test.ts).
//
// The bodies follow Google's own client (AppCheckCore's
// AppCheckCoreAppAttestAPIService): `key_id` is the key identifier exactly as
// DCAppAttestService returns it, which is already base64. Encoding it again
// names a key Apple never attested, so every exchange is refused and the phone
// never gets a token.

/** Body for `exchangeAppAttestAttestation`. Every value is already base64. */
export function attestationBody(keyId: string, attestation: string, challenge: string) {
  return { attestation_statement: attestation, challenge, key_id: keyId };
}

/** Body for `exchangeAppAttestAssertion`. Every value is already base64. */
export function assertionBody(artifact: string, assertion: string, challenge: string) {
  return { artifact, assertion, challenge };
}

/** The code the hosted API answers with when App Check refuses a request. */
export const APP_CHECK_REFUSED = "app_check_failed";

/**
 * Whether a 401 body is App Check refusing the app rather than the account's
 * token. That says nothing about the sign-in, so it must not sign anyone out:
 * a phone that cannot get a token yet would otherwise be signed out right
 * after creating its account.
 */
export function isAppCheckRefusal(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const { error, code } = body as { error?: unknown; code?: unknown };
  return error === APP_CHECK_REFUSED || code === APP_CHECK_REFUSED;
}
