// Security regressions found in the final audit.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { startApp, stopApp, makeUser } from "./harness.mjs";

const PASSCODE = process.env.TEACHER_PASSCODE || "006985";
let app;
before(async () => {
  app = await startApp({ snapshot: false });
});
after(stopApp);

const withPassword = async (role, extra = {}) => {
  const password = "Secret#" + Math.random().toString(36).slice(2, 10);
  const u = await makeUser(role, { passwordHash: await bcrypt.hash(password, 4), ...extra });
  return { ...u, password };
};
const idOf = (token) => jwt.decode(token).id;

describe("teacher passcode sign-in", () => {
  test("passcode-only sign-in never opens a real teacher's account", async () => {
    const real = await makeUser("tutor");
    const r = await request(app).post("/api/auth/teacher-verify").send({ teacherPasscode: PASSCODE });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.notEqual(idOf(r.body.token), String(real.user._id));
    const shared = await mongoose.model("User").findById(idOf(r.body.token)).lean();
    assert.equal(shared.email, "teacher@examino.edu.bd");
  });
  test("passcode-only sign-in can be switched off", async () => {
    process.env.PASSCODE_ONLY_LOGIN = "off";
    try {
      assert.equal((await request(app).post("/api/auth/teacher-verify").send({ teacherPasscode: PASSCODE })).status, 403);
    } finally {
      delete process.env.PASSCODE_ONLY_LOGIN;
    }
  });
  test("passcode + password does not demote a centre admin and does not revive a deactivated account", async () => {
    const admin = await withPassword("org_admin");
    const r = await request(app).post("/api/auth/teacher-verify").send({ teacherPasscode: PASSCODE, email: admin.user.email, password: admin.password });
    assert.equal(r.status, 200);
    assert.equal((await mongoose.model("User").findById(admin.user._id).lean()).role, "org_admin");
    const gone = await withPassword("student", { isActive: false });
    const g = await request(app).post("/api/auth/teacher-verify").send({ teacherPasscode: PASSCODE, email: gone.user.email, password: gone.password });
    assert.equal(g.status, 403);
    assert.equal((await mongoose.model("User").findById(gone.user._id).lean()).role, "student");
  });
});

describe("public endpoints expose public fields only", () => {
  test("organization lookup hides contact details, owner, plan, settings and code", async () => {
    const owner = await makeUser("org_admin");
    const org = await mongoose.model("Organization").create({ name: "Audit Centre", slug: "audit-centre", code: "AUD123", ownerId: owner.user._id, contactEmail: "private@example.com", phone: "01700000000" });
    const r = await request(app).get(`/api/organizations/${org.slug}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.organization.name, "Audit Centre");
    for (const k of ["contactEmail", "phone", "ownerId", "plan", "settings", "code"]) assert.equal(r.body.organization[k], undefined, k);
  });
});
