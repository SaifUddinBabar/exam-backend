import mongoose from "mongoose";

// Guard: only a production deployment (NODE_ENV=production, as set in render.yaml) may
// connect to the production database. A local `node server.js` with the default .env
// would otherwise connect to exam_db and let Mongoose create collections/indexes there.
// Override deliberately with ALLOW_PRODUCTION_DB=1 (e.g. an approved maintenance script).
const PRODUCTION_DB_NAMES = new Set(["exam_db"]);

export function databaseNameOf(uri) {
  try {
    return new URL(String(uri).replace(/^mongodb(\+srv)?:/, "http:")).pathname.replace(/^\//, "") || "test";
  } catch {
    return "";
  }
}

export function assertSafeDatabase(uri, env = process.env) {
  const name = databaseNameOf(uri);
  if (PRODUCTION_DB_NAMES.has(name) && env.NODE_ENV !== "production" && env.ALLOW_PRODUCTION_DB !== "1") {
    throw new Error(`Refusing to connect to the production database "${name}" with NODE_ENV=${env.NODE_ENV || "(unset)"}. Use a local/test database (e.g. --env-file=.env.localtest).`);
  }
  return name;
}

const connectDB = async () => {
  try {
    assertSafeDatabase(process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected");
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
};

export default connectDB;
