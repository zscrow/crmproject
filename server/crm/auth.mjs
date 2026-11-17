import { timingSafeEqual } from "node:crypto";
const encoder = new TextEncoder();
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
export const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async (value) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
const safeEqual = (a, b) =>
  a.length === b.length &&
  timingSafeEqual(encoder.encode(a), encoder.encode(b));
export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company,
    role: user.role,
    username: user.username || null,
  };
}
export function sessionCookie(token, age = 604800) {
  return `__Host-klivo_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
}
export async function sessionUser(request, db) {
  const token = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)__Host-klivo_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  return db
    .prepare(
      "SELECT u.*, s.token_hash FROM klivo_sessions s JOIN klivo_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    )
    .bind(await digest(token), Date.now())
    .first();
}
const json = (body, status = 200, cookie) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
async function limit(db, key, max) {
  const now = Date.now();
  await db
    .prepare("DELETE FROM klivo_auth_limits WHERE expires_at < ?")
    .bind(now)
    .run();
  const row = await db
    .prepare(
      "INSERT INTO klivo_auth_limits (key, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts",
    )
    .bind(key, now + 15 * 60000)
    .first();
  return row.attempts <= max;
}
export async function authRoute(request, env) {
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/me" && request.method === "GET") {
    const user = await sessionUser(request, env.DB);
    return user
      ? json({ user: publicUser(user) })
      : json({ error: "Entre na sua conta para continuar." }, 401);
  }
  if (request.method !== "POST")
    return json({ error: "Rota não encontrada." }, 404);
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return json({ error: "Origem não permitida." }, 403);
  if (path === "/api/auth/logout") {
    const user = await sessionUser(request, env.DB);
    if (user)
      await env.DB.prepare("DELETE FROM klivo_sessions WHERE token_hash = ?")
        .bind(user.token_hash)
        .run();
    return json({ ok: true }, 200, sessionCookie("", 0));
  }
  if (
    !["/api/auth/login", "/api/auth/register", "/api/auth/password"].includes(
      path,
    )
  )
    return json({ error: "Rota não encontrada." }, 404);
  const raw = await request.text();
  if (raw.length > 4096)
    return json({ error: "Solicitação muito grande." }, 413);
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: "Dados inválidos." }, 400);
  }
  if (!input || typeof input !== "object")
    return json({ error: "Dados inválidos." }, 400);
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const password = typeof input.password === "string" ? input.password : "";
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (path === "/api/auth/password") {
    const user = await sessionUser(request, env.DB);
    if (!user) return json({ error: "Sessão expirada." }, 401);
    if (
      !(await limit(env.DB, await digest("password:" + user.id + ":" + ip), 10))
    )
      return json({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
    if (!safeEqual(await hashPassword(password, user.salt), user.password_hash))
      return json({ error: "Senha atual incorreta." }, 400);
    if (
      typeof input.newPassword !== "string" ||
      input.newPassword.length < 12 ||
      input.newPassword.length > 128
    )
      return json(
        { error: "Use uma nova senha entre 12 e 128 caracteres." },
        400,
      );
    const salt = randomToken(),
      hash = await hashPassword(input.newPassword, salt);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE klivo_users SET password_hash = ?, salt = ? WHERE id = ?",
      ).bind(hash, salt, user.id),
      env.DB.prepare("DELETE FROM klivo_sessions WHERE user_id = ?").bind(
        user.id,
      ),
    ]);
    return json({ ok: true }, 200, sessionCookie("", 0));
  }
  const register = path.endsWith("/register");
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (
    !(validEmail || (!register && /^[a-z0-9_.-]{3,64}$/.test(email))) ||
    email.length > 254 ||
    password.length > 128
  )
    return json({ error: "Confira o usuário e a senha." }, 400);
  if (
    !(await limit(
      env.DB,
      await digest((register ? "register:" : "login:") + ip),
      register ? 8 : 30,
    ))
  )
    return json({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
  if (
    !register &&
    !(await limit(env.DB, await digest("email:" + email + ":" + ip), 10))
  )
    return json({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
  let user;
  if (register) {
    const name = String(input.name || "").trim(),
      company = String(input.company || "").trim();
    if (
      password.length < 12 ||
      name.length < 2 ||
      name.length > 100 ||
      company.length < 2 ||
      company.length > 100
    )
      return json(
        {
          error:
            "Preencha nome e empresa. A senha deve ter entre 12 e 128 caracteres.",
        },
        400,
      );
    const id = crypto.randomUUID(),
      salt = randomToken(),
      hash = await hashPassword(password, salt);
    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO klivo_users (id,email,name,company,password_hash,salt,created_at) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(id, email, name, company, hash, salt, Date.now())
      .run();
    if (!result.meta.changes)
      return json(
        {
          error:
            "Não foi possível criar a conta com este e-mail. Tente entrar.",
        },
        409,
      );
    user = await env.DB.prepare("SELECT * FROM klivo_users WHERE id = ?")
      .bind(id)
      .first();
  } else {
    user = await env.DB.prepare(
      "SELECT * FROM klivo_users WHERE username = ? OR (username IS NULL AND email = ?)",
    )
      .bind(email, email)
      .first();
    const hash = await hashPassword(password, user?.salt || "klivo-dummy-salt");
    if (!user || !safeEqual(hash, user.password_hash))
      return json({ error: "Usuário ou senha incorretos." }, 401);
  }
  const token = randomToken(),
    tokenHash = await digest(token);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM klivo_sessions WHERE expires_at < ?").bind(
      Date.now(),
    ),
    env.DB.prepare(
      "INSERT INTO klivo_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
    ).bind(tokenHash, user.id, Date.now() + 604800000),
  ]);
  return json({ user: publicUser(user) }, 200, sessionCookie(token));
}
