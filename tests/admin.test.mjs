// Admin and organization portal APIs: permitted and forbidden access.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { startApp, stopApp, makeUser } from "./harness.mjs";

let app, superAdmin, student, teacher, orgAdminA, orgAdminB, orgA, orgB, memberA;
before(async () => {
  app = await startApp({ snapshot: false });
  superAdmin = await makeUser("student", { globalRole: "super_admin" });
  student = await makeUser("student");
  teacher = await makeUser("tutor");
  orgAdminA = await makeUser("org_admin");
  orgAdminB = await makeUser("org_admin");
  const Org = mongoose.model("Organization");
  const M = mongoose.model("OrganizationMembership");
  orgA = await Org.create({ name: "Centre A", slug: "centre-a", code: "CENA", ownerId: orgAdminA.user._id });
  orgB = await Org.create({ name: "Centre B", slug: "centre-b", code: "CENB", ownerId: orgAdminB.user._id });
  await M.create({ organizationId: orgA._id, userId: orgAdminA.user._id, role: "org_admin" });
  await M.create({ organizationId: orgB._id, userId: orgAdminB.user._id, role: "org_admin" });
  memberA = await M.create({ organizationId: orgA._id, userId: student.user._id, role: "student" });
  await M.create({ organizationId: orgB._id, userId: teacher.user._id, role: "teacher" });
});
after(stopApp);

describe("platform admin", () => {
  test("only super admins can use /api/admin", async () => {
    for (const who of [student, teacher, orgAdminA]) {
      for (const url of ["/api/admin/overview", "/api/admin/users", "/api/admin/organizations", "/api/admin/audit-log"]) {
        assert.equal((await request(app).get(url).set(who.auth)).status, 403, url);
      }
      assert.equal((await request(app).patch(`/api/admin/users/${student.user._id}`).set(who.auth).send({ role: "tutor" })).status, 403);
    }
    assert.equal((await request(app).get("/api/admin/overview")).status, 401);
  });
  test("overview and user list come from real data", async () => {
    const o = await request(app).get("/api/admin/overview").set(superAdmin.auth);
    assert.equal(o.status, 200);
    assert.equal(o.body.content.organizations, 2);
    assert.equal(o.body.series.signups.length, 30);
    const u = await request(app).get("/api/admin/users?role=org_admin").set(superAdmin.auth);
    assert.equal(u.body.total, 2);
    assert.ok(u.body.users.every((x) => !("passwordHash" in x)));
  });
  test("role and status changes are applied and audited; self and super admins are protected", async () => {
    const r = await request(app).patch(`/api/admin/users/${student.user._id}`).set(superAdmin.auth).send({ role: "tutor" });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.role, "tutor");
    await request(app).patch(`/api/admin/users/${student.user._id}`).set(superAdmin.auth).send({ role: "student" });
    assert.equal((await request(app).patch(`/api/admin/users/${student.user._id}`).set(superAdmin.auth).send({ role: "super_admin" })).status, 400);
    assert.equal((await request(app).patch(`/api/admin/users/${superAdmin.user._id}`).set(superAdmin.auth).send({ isActive: false })).status, 400);
    const log = await request(app).get("/api/admin/audit-log").set(superAdmin.auth);
    assert.equal(log.body.entries.length, 2);
    assert.equal(log.body.entries[0].before.role, "tutor");
  });
  test("organization status/plan can be changed and a suspended org blocks its admin portal", async () => {
    const r = await request(app).patch(`/api/admin/organizations/${orgB._id}`).set(superAdmin.auth).send({ status: "suspended", plan: "basic" });
    assert.equal(r.status, 200);
    assert.equal((await request(app).get("/api/org/overview").set(orgAdminB.auth)).status, 403);
    await request(app).patch(`/api/admin/organizations/${orgB._id}`).set(superAdmin.auth).send({ status: "active" });
    assert.equal((await request(app).get("/api/org/overview").set(orgAdminB.auth)).status, 200);
  });
});

describe("organization admin", () => {
  test("non-admins cannot use /api/org", async () => {
    assert.equal((await request(app).get("/api/org/overview").set(student.auth)).status, 403);
    assert.equal((await request(app).get("/api/org/members").set(teacher.auth)).status, 403);
  });
  test("an org admin sees only their own organization's members", async () => {
    const a = await request(app).get("/api/org/members").set(orgAdminA.auth);
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.members.map((m) => m.user.email).sort(), [orgAdminA.user.email, student.user.email].sort());
    const b = await request(app).get("/api/org/members").set(orgAdminB.auth);
    assert.ok(!b.body.members.some((m) => m.user.email === student.user.email));
    const spoof = await request(app).get(`/api/org/members?orgId=${orgA._id}`).set(orgAdminB.auth);
    assert.equal(spoof.status, 403, "org admin B must not read org A by passing its id");
  });
  test("invitations can't be listed or revoked across organizations", async () => {
    const inv = await request(app).post("/api/invitations/create").set(orgAdminA.auth).send({ organizationId: String(orgA._id), role: "student" });
    assert.equal(inv.status, 201, JSON.stringify(inv.body));
    const id = inv.body.invitation?._id || inv.body._id;
    assert.equal((await request(app).get(`/api/invitations/list/${orgA._id}`).set(orgAdminB.auth)).status, 403);
    assert.equal((await request(app).delete(`/api/invitations/${id}`).set(orgAdminB.auth)).status, 403);
    const own = await request(app).get(`/api/invitations/list/${orgA._id}`).set(orgAdminA.auth);
    assert.equal(own.status, 200);
    assert.equal(own.body.invitations.length, 1);
  });
  test("member changes are scoped to the admin's organization", async () => {
    const other = await request(app).patch(`/api/org/members/${memberA._id}`).set(orgAdminB.auth).send({ status: "inactive" });
    assert.equal(other.status, 404);
    const ok = await request(app).patch(`/api/org/members/${memberA._id}`).set(orgAdminA.auth).send({ role: "teacher" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.membership.role, "teacher");
    const log = await request(app).get("/api/org/audit-log").set(orgAdminA.auth);
    assert.equal(log.body.entries.length, 1);
    const logB = await request(app).get("/api/org/audit-log").set(orgAdminB.auth);
    assert.equal(logB.body.entries.length, 0);
  });
});
