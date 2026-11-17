import { hashPassword, randomToken } from "../../server/crm/auth.mjs";
export async function seedAccount(
  db,
  email,
  password,
  name = "Teste",
  company = "Empresa",
) {
  const salt = randomToken();
  await db
    .prepare(
      "INSERT INTO klivo_users (id,email,name,company,password_hash,salt,created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      email,
      name,
      company,
      await hashPassword(password, salt),
      salt,
      Date.now(),
    )
    .run();
}
