const variables = (text) =>
  [
    ...new Set(
      [...String(text || "").matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(
        (m) => m[1],
      ),
    ),
  ].sort((a, b) =>
    /^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : 0,
  );
export function templateSchema(template) {
  const fields = [],
    lines = [];
  let unsupported =
    template.category === "AUTHENTICATION"
      ? "Modelos de autenticação ainda não são suportados."
      : "";
  function inspect(components, prefix = "") {
    for (const c of components || []) {
      const type = String(c.type).toUpperCase(),
        path = prefix + type.toLowerCase();
      if (
        type === "HEADER" &&
        ["IMAGE", "VIDEO", "DOCUMENT"].includes(c.format)
      ) {
        fields.push({
          key: path + ".media",
          label:
            (prefix
              ? "Cartão " + (Number(prefix.split(".")[1]) + 1) + " · "
              : "") +
            {
              IMAGE: "URL da imagem",
              VIDEO: "URL do vídeo",
              DOCUMENT: "URL do documento",
            }[c.format],
          kind: "url",
        });
        lines.push(
          "[" +
            (c.format === "IMAGE"
              ? "Imagem"
              : c.format === "VIDEO"
                ? "Vídeo"
                : "Documento") +
            "]",
        );
      } else if (
        ["HEADER", "BODY", "FOOTER"].includes(type) &&
        (!c.format || c.format === "TEXT")
      ) {
        for (const key of variables(c.text))
          fields.push({
            key: path + "." + key,
            label:
              (prefix
                ? "Cartão " + (Number(prefix.split(".")[1]) + 1) + " · "
                : "") +
              (type === "HEADER"
                ? "Cabeçalho"
                : type === "BODY"
                  ? "Mensagem"
                  : "Rodapé") +
              " · " +
              key,
            kind: "text",
          });
        if (c.text) lines.push({ text: c.text, path });
      } else if (type === "BUTTONS") {
        for (const [i, b] of (c.buttons || []).entries()) {
          if (!["URL", "PHONE_NUMBER", "QUICK_REPLY"].includes(b.type))
            unsupported = "Este tipo de botão ainda não é suportado.";
          for (const key of variables(b.url))
            fields.push({
              key: path + "." + i + "." + key,
              label: "Botão " + b.text + " · " + key,
              kind: "text",
            });
          lines.push({ text: "[" + b.text + "]", path });
        }
      } else if (type === "CAROUSEL") {
        if (!c.cards?.length || c.cards.length > 10 || prefix)
          unsupported = "Este formato de carrossel não é suportado.";
        else
          c.cards.forEach((card, i) => {
            lines.push("Cartão " + (i + 1));
            inspect(card.components, "cards." + i + ".");
          });
      } else unsupported = "Este formato de modelo ainda não é suportado.";
    }
  }
  if (template.status !== "APPROVED")
    unsupported = "Este modelo não está aprovado pela Meta.";
  inspect(template.components);
  return { fields, lines, unsupported };
}
export function templatePreview(template, values = {}) {
  return templateSchema(template)
    .lines.map((line) =>
      typeof line === "string"
        ? line
        : line.text.replace(
            /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
            (_, key) => values[line.path + "." + key] || "{{" + key + "}}",
          ),
    )
    .join("\n\n");
}
export function compileMetaTemplate(template, values = {}) {
  const schema = templateSchema(template);
  if (schema.unsupported) throw Error(schema.unsupported);
  for (const field of schema.fields) {
    const value = values[field.key];
    if (typeof value !== "string" || !value.trim() || value.length > 2000)
      throw Error("Preencha " + field.label + ".");
    if (field.kind === "url") {
      let url;
      try {
        url = new URL(value);
      } catch {
        throw Error("Informe uma URL HTTPS pública para " + field.label + ".");
      }
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !url.hostname.includes(".") ||
        /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname)
      )
        throw Error("Informe uma URL HTTPS pública para " + field.label + ".");
    }
  }
  const named = template.parameter_format === "NAMED";
  function params(text, path) {
    return variables(text).map((key) => ({
      type: "text",
      text: values[path + "." + key].trim(),
      ...(named ? { parameter_name: key } : {}),
    }));
  }
  function build(components, prefix = "") {
    const out = [];
    for (const c of components || []) {
      const type = c.type.toLowerCase(),
        path = prefix + type;
      if (
        type === "header" &&
        ["IMAGE", "VIDEO", "DOCUMENT"].includes(c.format)
      ) {
        const media = c.format.toLowerCase();
        out.push({
          type,
          parameters: [
            { type: media, [media]: { link: values[path + ".media"].trim() } },
          ],
        });
      } else if (type === "header" || type === "body") {
        const parameters = params(c.text, path);
        if (parameters.length) out.push({ type, parameters });
      } else if (type === "buttons") {
        (c.buttons || []).forEach((button, index) => {
          const parameters = params(button.url, path + "." + index);
          if (parameters.length)
            out.push({
              type: "button",
              sub_type: "url",
              index: String(index),
              parameters: parameters.map(({ type, text }) => ({ type, text })),
            });
        });
      } else if (type === "carousel") {
        out.push({
          type,
          cards: c.cards.map((card, i) => ({
            card_index: i,
            components: build(card.components, "cards." + i + "."),
          })),
        });
      }
    }
    return out;
  }
  const components = build(template.components);
  return {
    payload: {
      name: template.name,
      language: { code: template.language },
      ...(components.length ? { components } : {}),
    },
    text: templatePreview(template, values),
  };
}
