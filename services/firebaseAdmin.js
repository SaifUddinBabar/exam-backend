import admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import jwt from "jsonwebtoken";

const firebase = admin.default || admin;
const projectId = process.env.FIREBASE_PROJECT_ID || "exam-platform-cf110";

let isInitialized = false;
let firebaseApp = null;

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

/**
 * Verify Firebase ID Token passed from client
 * Uses Firebase Admin SDK to cryptographically verify signature,
 * expiry, project audience, and issuer against Google's public certs.
 */
export async function verifyFirebaseToken(idToken) {
  if (!idToken || typeof idToken !== "string" || idToken.trim().length === 0) {
    return { valid: false, error: "No token provided." };
  }

  // Cryptographic verification via Firebase Admin SDK
  if (isInitialized && firebaseApp) {
    try {
      const auth = getAuth(firebaseApp);
      // verifyIdToken cryptographically validates against Google's live x509 certs
      const decoded = await auth.verifyIdToken(idToken, true);

      // Verify that this token was issued for phone authentication
      const phone = decoded.phone_number;
      if (!phone) {
        return {
          valid: false,
          error: "Authentication token does not contain a verified mobile number.",
        };
      }

      // Strip leading country code +88 if present for consistent DB matching (01XXXXXXXXX)
      let localPhone = phone.replace(/^\+88/, "").replace(/[^0-9]/g, "");

      return {
        valid: true,
        uid: decoded.uid,
        phoneNumber: phone,
        localPhone,
        decoded,
      };
    } catch (err) {
      // In automated test suite ONLY (explicitly guarded):
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
        error: `Cryptographic token verification failed: ${err.message || "Invalid Firebase ID token"}`,
      };
    }
  }

  return { valid: false, error: "Firebase Admin is not initialized." };
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

  if (isInitialized && firebaseApp) {
    try {
      const auth = getAuth(firebaseApp);
      const decoded = await auth.verifyIdToken(idToken, true);

      if (!decoded.email) {
        return { valid: false, error: "Google account does not provide an email address." };
      }

      if (!decoded.email_verified) {
        return { valid: false, error: "Google account email is not verified." };
      }

      return {
        valid: true,
        uid: decoded.uid,
        email: decoded.email.toLowerCase().trim(),
        name: decoded.name || decoded.email.split("@")[0],
        picture: decoded.picture || "",
        signInProvider: decoded.firebase?.sign_in_provider || "google.com",
        decoded,
      };
    } catch (err) {
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
        error: `Cryptographic Google token verification failed: ${err.message || "Invalid ID token"}`,
      };
    }
  }

  return { valid: false, error: "Firebase Admin is not initialized." };
}

export default admin;
