import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
test("login, sessions, account isolation, logout and password change on Workers with D1", async (t) => {
  execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "deploy",
      "--config",
      "wrangler.app.jsonc",
      "--dry-run",
      "--outdir",
      ".runtime/auth-test-build",
    ],
    { stdio: "pipe" },
  );
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: readFileSync(".runtime/auth-test-build/worker.js", "utf8"),
      compatibilityDate: "2026-11-16",
      compatibilityFlags: ["nodejs_compat"],
      cf: false,
      d1Databases: ["DB"],
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  for (const migration of ["0001_webhooks.sql", "0002_auth.sql", "0006_usernames.sql"])
    await db.batch(
      readFileSync("server/cloudflare/migrations/" + migration, "utf8")
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((sql) => db.prepare(sql)),
    );
  const req = (path, unused, cookie) =>
    mf.dispatchFetch("https://klivo.test" + path, {
      headers: cookie ? { Cookie: cookie } : {},
    });
  const post = (path, body, cookie, origin = "https://klivo.test") =>
    mf.dispatchFetch("https://klivo.test/api/auth/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  assert.equal((await req("/api/whatsapp/events")).status, 401);
  assert.equal(
    (
      await post(
        "register",
        {
          email: "a@example.com",
          password: "very-secure-password",
          name: "Ana",
          company: "Studio",
        },
        null,
        "https://foreign.test",
      )
    ).status,
    403,
  );
  let response = await post("register", {
    email: "a@example.com",
    password: "very-secure-password",
    name: "Ana",
    company: "Studio",
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  const cookie = setCookie.split(";")[0],
    user = (await response.json()).user;
  assert.equal(user.role, "member");
  assert.equal(user.password_hash, undefined);
  assert.equal((await req("/api/auth/me", null, cookie)).status, 200);
  assert.equal((await req("/api/whatsapp/events", null, cookie)).status, 403);
  assert.equal(
    (await post("login", { email: "a@example.com", password: "wrong" })).status,
    401,
  );
  assert.equal(
    (
      await post("register", {
        email: "a@example.com",
        password: "very-secure-password",
        name: "Ana",
        company: "Studio",
      })
    ).status,
    409,
  );
  const second = await post("register", {
    email: "b@example.com",
    password: "very-secure-password",
    name: "Bia",
    company: "Other",
  });
  const secondUser = (await second.json()).user;
  assert.notEqual(user.id, secondUser.id);
  await db
    .prepare("UPDATE klivo_users SET role = 'owner' WHERE id = ?")
    .bind(user.id)
    .run();
  assert.equal((await req("/api/whatsapp/events", null, cookie)).status, 200);
  const stored = await db
    .prepare("SELECT password_hash FROM klivo_users WHERE id = ?")
    .bind(user.id)
    .first();
  assert.notEqual(stored.password_hash, "very-secure-password");
  response = await post(
    "password",
    {
      password: "very-secure-password",
      newPassword: "another-secure-password",
    },
    cookie,
  );
  assert.equal(response.status, 200);
  assert.equal((await req("/api/auth/me", null, cookie)).status, 401);
  response = await post("login", {
    email: "a@example.com",
    password: "another-secure-password",
  });
  assert.equal(response.status, 200);
  const renewed = response.headers.get("set-cookie").split(";")[0];
  await post("logout", {}, renewed);
  assert.equal((await req("/api/auth/me", null, renewed)).status, 401);
  await db.prepare("UPDATE klivo_users SET username='Alovi' WHERE id=?").bind(user.id).run();
  assert.equal((await post('login',{email:'a@example.com',password:'another-secure-password'})).status,401);
  assert.equal((await post('login',{email:'alovi',password:'another-secure-password'})).status,200);
  const rateBody = {
    email: "nonexistent@example.com",
    password: "incorrect-password",
  };
  let rateResponse;
  for (let i = 0; i < 11; i++) rateResponse = await post("login", rateBody);
  assert.equal(rateResponse.status, 429);
});
