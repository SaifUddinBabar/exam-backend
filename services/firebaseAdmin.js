import admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import jwt from "jsonwebtoken";

const firebase = admin.default || admin;
const projectId = process.env.FIREBASE_PROJECT_ID || "exam-platform-cf110";

let isInitialized = false;
let firebaseApp = null;
const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

try {
  const apps = firebase.apps || [];
  if (apps.length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      } catch (e) {
        console.warn("[FIREBASE ADMIN] Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON format.");
      }
      if (serviceAccount) {
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        firebaseApp = firebase.initializeApp({
          credential: firebase.credential.cert(serviceAccount),
          projectId,
        });
        isInitialized = true;
      }
    }

    if (!isInitialized) {
      firebaseApp = firebase.initializeApp({ projectId });
      isInitialized = true;
    }
    console.log(`[FIREBASE ADMIN] Initialized successfully for project: ${projectId}`);
  } else {
    firebaseApp = apps[0];
    isInitialized = true;
  }
} catch (error) {
  console.warn(`[FIREBASE ADMIN] Initialization notice: ${error.message}`);
}

// ============================================================================
// GOOGLE PUBLIC X.509 CERTIFICATE VERIFICATION (Zero-Credential Resilient)
// Validates Firebase RS256 JWT signatures directly against Google's live certs
// ============================================================================
let cachedCerts = null;
let certsExpiry = 0;

async function getGooglePublicCerts() {
  const now = Date.now();
  if (cachedCerts && now < certsExpiry) {
    return cachedCerts;
  }
  const res = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!res.ok) throw new Error("Failed to fetch Google public certs from Google API.");
  cachedCerts = await res.json();
  certsExpiry = now + 6 * 60 * 60 * 1000; // cache for 6 hours
  return cachedCerts;
}

async function verifyWithGooglePublicCerts(idToken) {
  const decodedHeader = jwt.decode(idToken, { complete: true });
  if (!decodedHeader || !decodedHeader.header || !decodedHeader.header.kid) {
    throw new Error("Malformed JWT header: missing kid property.");
  }
  const kid = decodedHeader.header.kid;
  const certs = await getGooglePublicCerts();
  let cert = certs[kid];
  if (!cert) {
    certsExpiry = 0;
    const fresh = await getGooglePublicCerts();
    cert = fresh[kid];
    if (!cert) throw new Error("Token signing key (kid) does not match any current Google public certificates.");
  }

  return jwt.verify(idToken, cert, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });
}

/**
 * Verify Firebase ID Token passed from client (Phone Auth)
 * Uses Firebase Admin SDK when service account is present, or falls back to
 * cryptographically validating directly against Google's public x509 certs.
 */
export async function verifyFirebaseToken(idToken) {
  if (!idToken || typeof idToken !== "string" || idToken.trim().length === 0) {
    return { valid: false, error: "No token provided." };
  }

  // 1. Try Firebase Admin SDK if service account is configured
  if (isInitialized && firebaseApp && hasServiceAccount) {
    try {
      const auth = getAuth(firebaseApp);
      const decoded = await auth.verifyIdToken(idToken);
      const phone = decoded.phone_number;
      if (phone) {
        const localPhone = phone.replace(/^\+88/, "").replace(/[^0-9]/g, "");
        return {
          valid: true,
          uid: decoded.uid,
          phoneNumber: phone,
          localPhone,
          decoded,
        };
      }
    } catch (adminErr) {
      // Fall through to public cert verification
    }
  }

  // 2. Cryptographic verification directly against Google's live public certs
  try {
    const decoded = await verifyWithGooglePublicCerts(idToken);
    const phone = decoded.phone_number;
    if (!phone) {
      return {
        valid: false,
        error: "Authentication token does not contain a verified mobile number.",
      };
    }
    const localPhone = phone.replace(/^\+88/, "").replace(/[^0-9]/g, "");
    return {
      valid: true,
      uid: decoded.sub || decoded.user_id,
      phoneNumber: phone,
      localPhone,
      decoded,
    };
  } catch (pubErr) {
    // 3. Automated test suite ONLY (explicitly guarded)
    if (process.env.NODE_ENV === "test" && process.env.ALLOW_TEST_MOCK_TOKENS === "true") {
      try {
        const testDecoded = jwt.verify(idToken, process.env.TEST_MOCK_SECRET || "internal-test-key-only");
        if (testDecoded && testDecoded.aud === projectId && testDecoded.phone_number) {
          const phone = testDecoded.phone_number;
          const localPhone = phone.replace(/^\+88/, "").replace(/[^0-9]/g, "");
          return {
            valid: true,
            uid: testDecoded.sub || testDecoded.user_id,
            phoneNumber: phone,
            localPhone,
            decoded: testDecoded,
          };
        }
      } catch (testErr) {
        // invalid test signature
      }
    }

    return {
      valid: false,
      error: `Cryptographic token verification failed: ${pubErr.message || "Invalid Firebase ID token"}`,
    };
  }
}

/**
 * Verify Firebase Google Auth ID Token
 * Validates that token is authentic, issued by Google for our project,
 * and contains a verified email address.
 */
export async function verifyFirebaseGoogleToken(idToken) {
  if (!idToken || typeof idToken !== "string" || idToken.trim().length === 0) {
    return { valid: false, error: "No Google ID token provided." };
  }

  // 1. Try Firebase Admin SDK if service account is configured
  if (isInitialized && firebaseApp && hasServiceAccount) {
    try {
      const auth = getAuth(firebaseApp);
      const decoded = await auth.verifyIdToken(idToken);
      if (decoded.email) {
        return {
          valid: true,
          uid: decoded.uid,
          email: decoded.email.toLowerCase().trim(),
          name: decoded.name || decoded.email.split("@")[0],
          picture: decoded.picture || "",
          signInProvider: decoded.firebase?.sign_in_provider || "google.com",
          decoded,
        };
      }
    } catch (adminErr) {
      // Fall through to public cert verification
    }
  }

  // 2. Cryptographic verification directly against Google's live public certs
  try {
    const decoded = await verifyWithGooglePublicCerts(idToken);
    if (!decoded.email) {
      return { valid: false, error: "Google account does not provide an email address." };
    }

    return {
      valid: true,
      uid: decoded.sub || decoded.user_id,
      email: decoded.email.toLowerCase().trim(),
      name: decoded.name || decoded.email.split("@")[0],
      picture: decoded.picture || "",
      signInProvider: decoded.firebase?.sign_in_provider || "google.com",
      decoded,
    };
  } catch (pubErr) {
    // 3. Automated test mock support
    if (process.env.NODE_ENV === "test" && process.env.ALLOW_TEST_MOCK_TOKENS === "true") {
      try {
        const testDecoded = jwt.verify(idToken, process.env.TEST_MOCK_SECRET || "internal-test-key-only");
        if (testDecoded && testDecoded.aud === projectId && testDecoded.email) {
          return {
            valid: true,
            uid: testDecoded.sub || testDecoded.user_id,
            email: testDecoded.email.toLowerCase().trim(),
            name: testDecoded.name || testDecoded.email.split("@")[0],
            picture: testDecoded.picture || "",
            signInProvider: "google.com",
            decoded: testDecoded,
          };
        }
      } catch {
        // invalid test signature
      }
    }

    return {
      valid: false,
      error: `Cryptographic Google token verification failed: ${pubErr.message || "Invalid ID token"}`,
    };
  }
}

export default admin;
