import nodemailer from "nodemailer";
import config from "../config/env.js";

let transporter = null;

if (config.smtp.host && config.smtp.user && config.smtp.pass) {
  try {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  } catch (err) {
    console.warn("⚠️  [EMAIL SERVICE] Failed to initialize SMTP transporter:", err.message);
  }
}

/**
 * Dispatches a password reset email to the user.
 * Tokens are never transmitted to unauthenticated clients over the HTTP API.
 */
export async function sendPasswordResetEmail({ to, name, resetToken }) {
  const resetLink = `${config.frontendUrl}/forgot-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(to)}`;

  const subject = "Reset your Examino password";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e2e8f0; rounded: 12px;">
      <div style="margin-bottom: 24px;">
        <h2 style="color: #101B35; margin: 0; font-size: 24px; font-weight: 800;">Examino</h2>
        <span style="color: #64748B; font-size: 12px;">EdTech SaaS Platform Bangladesh</span>
      </div>
      <h3 style="color: #0F172A; font-size: 18px; margin-top: 0;">Password Reset Request</h3>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">Hello ${name || "Examino User"},</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">We received a request to reset your password for your Examino account. Click the button below to choose a new password:</p>
      <div style="margin: 28px 0;">
        <a href="${resetLink}" style="background-color: #2563EB; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">Reset Password &rarr;</a>
      </div>
      <p style="color: #64748B; font-size: 12px; line-height: 1.5;">This link will expire in <b>15 minutes</b> for security reasons.<br/>If you did not request a password reset, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
      <p style="color: #94A3B8; font-size: 11px;">If the button above does not work, copy and paste this link into your browser:<br/><span style="word-break: break-all; color: #2563EB;">${resetLink}</span></p>
    </div>
  `;

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: config.smtp.from,
        to,
        subject,
        html,
      });
      return { success: true, messageId: info.messageId };
    } catch (sendErr) {
      console.error("❌ [EMAIL SERVICE] SMTP dispatch error:", sendErr.message);
      // Fallback to dev log
    }
  }

  // Safe developer log when SMTP credentials are not yet configured
  if (config.env !== "production") {
    console.log("---------------------------------------------------------");
    console.log(`📨 [EMAIL SERVICE - DEV DISPATCH] Password Reset for: ${to}`);
    console.log(`🔗 Link: ${resetLink}`);
    console.log("---------------------------------------------------------");
  }

  return { success: true, simulated: !transporter };
}

export default {
  sendPasswordResetEmail,
};
