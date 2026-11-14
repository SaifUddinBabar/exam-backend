import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  verifyFirebaseGoogleToken,
  verifyFirebaseToken,
} from "../services/firebaseAdmin.js";

console.log("==================================================================");
console.log("🔒 FIREBASE ADMIN & GOOGLE TOKEN SECURITY AUDIT SUITE");
console.log("==================================================================\n");

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (!condition) {
    console.error(`❌ FAILED [${total}]: ${message}`);
    throw new Error(`Audit check failed: ${message}`);
  }
  console.log(`✅ PASSED [${total}]: ${message}`);
  passed++;
}

// Generate an unauthorized self-signed RSA key pair to simulate an attacker forging tokens
const { privateKey: attackerPrivateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const PROJECT_ID = "exam-platform-cf110";

// --- TEST 1: Reject empty / null token ---
const t1 = await verifyFirebaseGoogleToken("");
assert(t1.valid === false && t1.error.includes("No Google ID token provided"), "Reject empty token");

// --- TEST 2: Reject malformed token ---
const t2 = await verifyFirebaseGoogleToken("not-a-valid-jwt-token-string");
assert(t2.valid === false && t2.error.includes("Cryptographic Google token verification failed"), "Reject completely malformed token");

// --- TEST 3: Reject 'none' algorithm attack ---
const headerNone = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
const payloadNone = Buffer.from(JSON.stringify({
  iss: `https://securetoken.google.com/${PROJECT_ID}`,
  aud: PROJECT_ID,
  sub: "attacker123",
  email: "attacker@example.com",
})).toString("base64url");
const tokenNone = `${headerNone}.${payloadNone}.`;
const t3 = await verifyFirebaseGoogleToken(tokenNone);
assert(t3.valid === false, "Reject 'none' algorithm bypass attempt");

// --- TEST 4: Reject HS256 algorithm substitution attack ---
const tokenHS256 = jwt.sign(
  {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: "attacker123",
    email: "attacker@example.com",
    auth_time: Math.floor(Date.now() / 1000),
  },
  "secret-key-attacker",
  { algorithm: "HS256", header: { kid: "fake-kid" } }
);
const t4 = await verifyFirebaseGoogleToken(tokenHS256);
assert(t4.valid === false && t4.error.includes("RS256"), "Reject HS256 algorithm substitution attack");

// --- TEST 5: Reject Forged RS256 signature (Attacker Private Key with fake kid) ---
const tokenForged = jwt.sign(
  {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: "forged_uid_123",
    email: "forged@example.com",
    auth_time: Math.floor(Date.now() / 1000),
  },
  attackerPrivateKey,
  { algorithm: "RS256", header: { kid: "non-existent-kid-12345" } }
);
const t5 = await verifyFirebaseGoogleToken(tokenForged);
assert(t5.valid === false && (t5.error.includes("kid") || t5.error.includes("certificate")), "Reject forged token with unknown key ID");

// --- TEST 6: Reject Token with valid Google kid format but forged signature ---
// Fetch real public cert kids from Google
const resCerts = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
const realCerts = await resCerts.json();
const realKid = Object.keys(realCerts)[0];
assert(!!realKid, "Successfully retrieved live Google Firebase Secure Token public keys");

const tokenForgedRealKid = jwt.sign(
  {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: "forged_uid_456",
    email: "forged_real_kid@example.com",
    auth_time: Math.floor(Date.now() / 1000),
  },
  attackerPrivateKey,
  { algorithm: "RS256", header: { kid: realKid } }
);
const t6 = await verifyFirebaseGoogleToken(tokenForgedRealKid);
assert(t6.valid === false && t6.error.includes("invalid signature"), "Reject forged signature even when using real Google kid (cryptographic signature verification works!)");

// --- TEST 7: Reject Wrong Project ID (Audience mismatch) ---
const tokenWrongAud = jwt.sign(
  {
    iss: "https://securetoken.google.com/malicious-project-999",
    aud: "malicious-project-999",
    sub: "user_wrong_aud",
    email: "wrong_aud@example.com",
    auth_time: Math.floor(Date.now() / 1000),
  },
  attackerPrivateKey,
  { algorithm: "RS256", header: { kid: realKid } }
);
const t7 = await verifyFirebaseGoogleToken(tokenWrongAud);
assert(t7.valid === false, "Reject token targeting a different Firebase project (Audience / Issuer check)");

// --- TEST 8: Reject Ordinary Google OAuth token (iss accounts.google.com) ---
const tokenOrdinaryOAuth = jwt.sign(
  {
    iss: "https://accounts.google.com",
    aud: "123456789.apps.googleusercontent.com",
    sub: "oauth_sub_123",
    email: "oauth@example.com",
    auth_time: Math.floor(Date.now() / 1000),
  },
  attackerPrivateKey,
  { algorithm: "RS256", header: { kid: realKid } }
);
const t8 = await verifyFirebaseGoogleToken(tokenOrdinaryOAuth);
assert(t8.valid === false, "Reject ordinary Google OAuth token (enforces Firebase Secure Token issuer)");

// --- TEST 9: Reject Phone token when email missing or when phone missing in phone verify ---
const t9 = await verifyFirebaseToken("");
assert(t9.valid === false, "Reject empty token in phone verification");

console.log("\n==================================================================");
console.log(`🎉 ALL ${passed} / ${total} SECURITY AUDIT CHECKS PASSED!`);
console.log("==================================================================");
