import { templateSchema } from "../../src/domain/whatsapp-template.mjs";
export async function approvedTemplates(env, accountId, fetcher = fetch) {
  if (!env.META_ACCESS_TOKEN)
    throw Error("O token do WhatsApp não está configurado.");
  const templates = [];
  let after;
  for (let page = 0; page < 10; page++) {
    const url = new URL(
      "https://graph.facebook.com/v27.0/" +
        encodeURIComponent(accountId) +
        "/message_templates",
    );
    url.searchParams.set(
      "fields",
      "id,name,status,language,category,parameter_format,components",
    );
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const r = await fetcher(url.toString(), {
      headers: { Authorization: "Bearer " + env.META_ACCESS_TOKEN },
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    if (!r.ok || !Array.isArray(d.data))
      throw Error(
        d.error?.code === 190
          ? "O token da Meta expirou ou foi revogado."
          : "Não foi possível consultar os modelos na Meta. Confira a permissão whatsapp_business_management.",
      );
    for (const t of d.data) {
      if (t.status !== "APPROVED") continue;
      const template = {
        id: String(t.id),
        name: t.name,
        status: t.status,
        language: t.language,
        category: t.category,
        parameter_format: t.parameter_format,
        components: t.components || [],
      };
      templates.push({
        ...template,
        unsupported: templateSchema(template).unsupported,
      });
    }
    if (!d.paging?.next) return templates;
    after = d.paging?.cursors?.after;
    if (!after) throw Error("A Meta não retornou o cursor da próxima página.");
  }
  throw Error(
    "A lista é muito grande para esta versão. Refine os modelos na Meta.",
  );
}
export async function workspaceTemplates(env, c, fetcher = fetch) {
  const connection = await env.DB.prepare(
    "SELECT account_id FROM klivo_whatsapp_connections WHERE workspace_id=? AND phone_number_id=?",
  )
    .bind(c.workspace.id, env.WHATSAPP_PHONE_NUMBER_ID || "")
    .first();
  if (!connection)
    throw Error("Esta empresa não possui uma conta WhatsApp conectada.");
  return approvedTemplates(env, connection.account_id, fetcher);
}
