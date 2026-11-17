import test from "node:test";
import assert from "node:assert/strict";
import {
  compileMetaTemplate,
  templateSchema,
  templatePreview,
} from "../src/domain/whatsapp-template.mjs";
import { approvedTemplates } from "../server/crm/templates.mjs";
const template = (components) => ({
  id: "t",
  name: "approved_name",
  language: "en_US",
  status: "APPROVED",
  category: "UTILITY",
  parameter_format: "POSITIONAL",
  components,
});
test("template payload uses the approved name, exact language and ordered required values", () => {
  const t = template([
    { type: "HEADER", format: "TEXT", text: "Pedido" },
    { type: "BODY", text: "Hi {{1}}, order {{2}}. Hi {{1}}." },
    { type: "FOOTER", text: "Footer" },
    {
      type: "BUTTONS",
      buttons: [
        { type: "URL", text: "Details", url: "https://example.com/orders" },
      ],
    },
  ]);
  assert.throws(() => compileMetaTemplate(t, {}), /Preencha/);
  const r = compileMetaTemplate(t, { "body.2": "123", "body.1": "Ana" });
  assert.equal(r.payload.name, "approved_name");
  assert.equal(r.payload.language.code, "en_US");
  assert.deepEqual(r.payload.components, [
    {
      type: "body",
      parameters: [
        { type: "text", text: "Ana" },
        { type: "text", text: "123" },
      ],
    },
  ]);
  assert.match(r.text, /Hi Ana, order 123/);
  assert.match(r.text, /\[Details\]/);
  assert.equal(
    compileMetaTemplate(template([{ type: "BODY", text: "Static" }])).payload
      .components,
    undefined,
  );
});
test("named text and media/carousel templates compile using required HTTPS media URLs", () => {
  const named = {
    ...template([{ type: "BODY", text: "Hi {{first_name}}" }]),
    parameter_format: "NAMED",
  };
  assert.equal(
    compileMetaTemplate(named, { "body.first_name": "Ana" }).payload
      .components[0].parameters[0].parameter_name,
    "first_name",
  );
  const t = template([
    { type: "BODY", text: "Recipes" },
    {
      type: "CAROUSEL",
      cards: [
        {
          components: [
            { type: "HEADER", format: "IMAGE" },
            { type: "BODY", text: "First" },
          ],
        },
        {
          components: [
            { type: "HEADER", format: "IMAGE" },
            { type: "BODY", text: "Second" },
          ],
        },
      ],
    },
  ]);
  assert.equal(templateSchema(t).fields.length, 2);
  assert.throws(
    () =>
      compileMetaTemplate(t, {
        "cards.0.header.media": "http://example.com/photo.jpg",
        "cards.1.header.media": "https://example.com/b.jpg",
      }),
    /HTTPS/,
  );
  const r = compileMetaTemplate(t, {
    "cards.0.header.media": "https://example.com/a.jpg",
    "cards.1.header.media": "https://example.com/b.jpg",
  });
  assert.equal(r.payload.components[0].cards[1].card_index, 1);
  assert.equal(
    r.payload.components[0].cards[0].components[0].parameters[0].image.link,
    "https://example.com/a.jpg",
  );
  assert.match(templatePreview(t), /Cartão 2/);
});
test("unsupported or unapproved templates cannot be sent, dynamic URL buttons accept only their approved suffix", () => {
  assert.throws(
    () => compileMetaTemplate({ ...template([]), status: "PAUSED" }),
    /aprovado/,
  );
  assert.throws(
    () => compileMetaTemplate(template([{ type: "FLOW" }])),
    /suportado/,
  );
  const t = template([
    { type: "BODY", text: "Read" },
    {
      type: "BUTTONS",
      buttons: [
        { type: "URL", text: "Open", url: "https://example.com/{{1}}" },
      ],
    },
  ]);
  const p = compileMetaTemplate(t, { "buttons.0.1": "order-123" }).payload
    .components[0];
  assert.deepEqual(p, {
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [{ type: "text", text: "order-123" }],
  });
});
test("Meta pagination uses only cursors and never follows a supplied external next URL", async () => {
  const urls = [];
  const result = await approvedTemplates(
    { META_ACCESS_TOKEN: "private" },
    "account",
    async (url) => {
      urls.push(url);
      return Response.json(
        urls.length === 1
          ? {
              data: [template([{ type: "BODY", text: "One" }])],
              paging: {
                next: "https://evil.test/secret",
                cursors: { after: "cursor" },
              },
            }
          : { data: [{ ...template([]), status: "PAUSED" }] },
      );
    },
  );
  assert.equal(result.length, 1);
  assert.equal(urls.length, 2);
  assert.ok(
    urls.every((url) =>
      url.startsWith("https://graph.facebook.com/v27.0/account/"),
    ),
  );
  assert.equal(new URL(urls[1]).searchParams.get("after"), "cursor");
});
