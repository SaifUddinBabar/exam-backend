import multer from "multer";
import path from "path";
import crypto from "crypto";

// Only images (and PDFs for notice attachments) are accepted. Files are renamed
// to a random name with a whitelisted extension, so an uploaded file can never
// be served as HTML/JS from the API origin.
const IMAGE_TYPES = { "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": null };
const ATTACHMENT_TYPES = { ...IMAGE_TYPES, "application/pdf": ".pdf" };

function makeUploader(types, maxMb) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${crypto.randomBytes(4).toString("hex")}${types[file.mimetype]}`),
  });
  return multer({
    storage,
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      // SVG is rejected: it can carry script.
      if (!types[file.mimetype]) {
        const err = new Error("Only PNG, JPG, GIF or WEBP images" + (types === ATTACHMENT_TYPES ? " or PDF files" : "") + " are allowed.");
        err.status = 400;
        return cb(err);
      }
      cb(null, true);
    },
  });
}

export const upload = makeUploader(IMAGE_TYPES, 5);
export const attachmentUpload = makeUploader(ATTACHMENT_TYPES, 10);

/** Public URL path for a stored file name (or pass-through for absolute URLs). */
export function imagePublicUrl(file) {
  if (!file) return "";
  if (/^(https?:)?\/\//i.test(file) || file.startsWith("data:")) return file;
  return `/uploads/${path.basename(String(file).replace(/^\/?uploads\//i, ""))}`;
}
