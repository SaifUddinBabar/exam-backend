import crypto from "crypto";
import config from "../config/env.js";

const OTP_SECRET = process.env.OTP_SECRET || config.jwt.secret || "examino-secure-otp-secret";

/**
 * Normalizes Bangladesh mobile numbers to standard 11-digit local format: 01XXXXXXXXX
 */
export const normalizeBdPhone = (rawPhone) => {
  if (!rawPhone || typeof rawPhone !== "string") return null;
  const digits = rawPhone.replace(/\D/g, "");
  
  if (digits.length === 11 && digits.startsWith("01")) {
    return digits;
  }
  if (digits.length === 13 && digits.startsWith("8801")) {
    return digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith("1")) {
    return `0${digits}`;
  }
  return null;
};

/**
 * Validates Bangladesh mobile number format: 01[3-9]XXXXXXXX
 */
export const isValidBdPhone = (phone) => {
  const normalized = normalizeBdPhone(phone);
  if (!normalized) return false;
  return /^01[3-9]\d{8}$/.test(normalized);
};

/**
 * Generates a cryptographically strong 6-digit OTP
 */
export const generateSecureOtp = () => {
  return String(crypto.randomInt(100000, 1000000));
};

/**
 * Generates HMAC-SHA256 hash of (phone + otp)
 */
export const hashOtp = (phone, otp) => {
  return crypto
    .createHmac("sha256", OTP_SECRET)
    .update(`${phone}:${otp}`)
    .digest("hex");
};

/**
 * Dispatches SMS via configured Gateway (or test mode when not in production)
 */
export const sendSms = async ({ phone, message }) => {
  const normalizedPhone = normalizeBdPhone(phone);
  if (!normalizedPhone) {
    return { success: false, error: "Invalid mobile number format." };
  }

  const apiKey = process.env.SMS_API_KEY;
  const senderId = process.env.SMS_SENDER_ID || "Examino";
  const provider = (process.env.SMS_GATEWAY_PROVIDER || "generic").toLowerCase();
  const apiUrl = process.env.SMS_API_URL;

  // If no SMS provider key configured in environment:
  if (!apiKey) {
    console.warn(`[SMS SIMULATOR] SMS_API_KEY not set. Simulating delivery to ${normalizedPhone}: ${message}`);

    return {
      success: true,
      configured: false,
      testMode: true,
      message: "SMS Gateway is not configured. Running in simulator mode (OTP provided in response/console).",
    };
  }

  // Real HTTP dispatch when SMS_API_KEY is configured
  try {
    let response;

    if (provider === "greenweb") {
      const url = `https://api.greenweb.com.bd/api.php?token=${encodeURIComponent(
        apiKey
      )}&to=${encodeURIComponent(normalizedPhone)}&message=${encodeURIComponent(
        message
      )}`;
      response = await fetch(url, { method: "GET" });
    } else if (provider === "bulksmsbd") {
      const url = `http://bulksmsbd.net/api/smsapi?api_key=${encodeURIComponent(
        apiKey
      )}&type=text&number=${encodeURIComponent(
        normalizedPhone
      )}&senderid=${encodeURIComponent(senderId)}&message=${encodeURIComponent(
        message
      )}`;
      response = await fetch(url, { method: "GET" });
    } else if (apiUrl) {
      // Generic POST gateway
      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          recipient: normalizedPhone,
          senderId,
          message,
        }),
      });
    } else {
      return {
        success: false,
        error: "SMS_API_URL or recognized SMS_GATEWAY_PROVIDER must be configured.",
      };
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("[SMS Gateway Error]:", errText);
      return { success: false, error: "SMS Gateway rejected delivery." };
    }

    return { success: true, message: "SMS dispatched successfully." };
  } catch (err) {
    console.error("[SMS Dispatch Exception]:", err);
    return { success: false, error: "Failed to communicate with SMS Gateway." };
  }
};
