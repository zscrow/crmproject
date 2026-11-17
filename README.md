# zapCaster

CRM em React. Requer Node.js 24. Instale as dependências com `npm install` e
inicie a interface com `npm run dev` (http://127.0.0.1:4173).

## Webhook oficial do WhatsApp

O back-end recebe eventos em **`GET/POST /webhooks/whatsapp`**, seguindo a
[documentação da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint).

### Hospedagem permanente: Cloudflare Workers + D1

O receptor em `server/cloudflare/worker.mjs` roda na Cloudflare com HTTPS em um
endereço `workers.dev`. O D1 armazena os recebimentos. Essa versão funciona
com o computador desligado e substitui o túnel de testes. O endereço publicado
fica disponível no resultado de `npm.cmd run webhook:deploy`; use o caminho
`/webhooks/whatsapp` como callback na Meta e mantenha o mesmo token do `.env`.

O arquivo `wrangler.jsonc` contém o Worker `zapcaster-webhook` e o banco
`zapcaster-webhooks`, com binding `DB`. O perfil de autenticação `zapcaster` é
separado do login padrão do Wrangler. Para reautorizá-lo:

```powershell
npx.cmd wrangler auth create zapcaster --scopes account:read user:read workers_scripts:write workers_tail:read d1:write
```

Após autenticar na conta configurada, valide e publique:

```powershell
npm.cmd run webhook:check
npm.cmd test
npm.cmd run webhook:migrate
npm.cmd run webhook:deploy
```

A publicação envia **somente** `WHATSAPP_VERIFY_TOKEN` e `META_APP_SECRET`
do `.env` aos secrets do Worker. Para o primeiro deploy, o Wrangler exige um
arquivo de secrets; o script cria esse arquivo na pasta ignorada `.runtime`
e o remove ao finalizar. Os valores não aparecem nos argumentos ou em arquivos
versionados. Para atualizar apenas os secrets depois de alterar o `.env`, use
`npm.cmd run webhook:secrets`, que os envia pela entrada padrão do Wrangler.
Alterações locais não afetam o Worker até publicar ou sincronizar os secrets.
Sem os secrets configurados, o receptor responde `503`.

O D1 usa `deliveries` para os metadados de cada recebimento, `delivery_parts`
para o corpo original em blocos binários e `events` para as identidades dos
eventos. `events.payload_path` aponta para a mensagem/status dentro do JSON
original, reconstruído concatenando os blocos por `part_index`. Esse formato
aceita o limite de payload da Meta mesmo quando ele excede o tamanho permitido
para uma linha D1. O lote de gravação é transacional e deduplica as mensagens.
Não existe rota pública de consulta dos dados.

Para consultar apenas contagens do banco remoto:

```powershell
npx.cmd wrangler d1 execute zapcaster-webhooks --remote --profile zapcaster --command "SELECT field, kind, COUNT(*) AS total FROM events GROUP BY field, kind"
```

Para preservar recebimentos do SQLite local anterior, prepare uma importação
idempotente e aplique-a no D1:

```powershell
npm.cmd run webhook:import:prepare
npx.cmd wrangler d1 execute zapcaster-webhooks --remote --profile zapcaster --file .runtime/whatsapp-import.sql
```

O SQL de importação contém as mensagens recebidas e fica apenas na pasta local
ignorada pelo Git. A importação não altera o SQLite original.

Para desenvolvimento, `npm.cmd run webhook:migrate:local` prepara o D1 simulado
e `npm.cmd run webhook:dev` inicia o Worker em `http://localhost:8787`, usando
os segredos do `.env` local. Os testes usam Miniflare/workerd e credenciais
fictícias para verificar assinatura, lotes, duplicatas, payloads grandes e rollback.
O CRM continua em modo de demonstração; esta migração hospeda o receptor,
sem publicar a interface ou sincronizar suas conversas locais.

Os logs da aplicação não incluem mensagens nem segredos. As URLs de requisição
têm a query removida na observabilidade, e os logs automáticos de invocação
ficam desativados. `/health` verifica a configuração e o acesso às tabelas D1.

Para voltar ao receptor anterior durante uma migração, recadastre na Meta a
URL do túnel ainda ativo com o mesmo token. Preserve ambos os bancos até
confirmar a entrega no novo callback.

### Configuração local

1. Copie `.env.example` para `.env`, caso ainda não exista.
2. Defina `WHATSAPP_VERIFY_TOKEN` com uma string aleatória. Para gerar uma:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Preencha `META_APP_SECRET` com o **segredo do aplicativo** em Meta > Configurações
   do aplicativo > Básico. Ele é diferente do token de acesso da API.
4. Execute `npm run webhook`. Por padrão, escuta em `127.0.0.1:3001`.
   Execute `npm run dev` em outro terminal para abrir o CRM.

O `.env` está ignorado pelo Git. Nunca use o prefixo `VITE_` nesses segredos,
pois isso os disponibilizaria ao navegador. Reinicie o back-end após alterá-los.
`GET /health` retorna `200 ready` quando ambos estão preenchidos, ou `503`
quando faltam credenciais; isso não confirma a assinatura do aplicativo na Meta.
Sem os segredos, eventos POST são rejeitados com `503`.

### Publicar e cadastrar na Meta

O servidor precisa estar acessível pela internet com **HTTPS e certificado
válido**, conforme a Meta. Publique o processo Node atrás de um proxy HTTPS e
encaminhe `/webhooks/whatsapp` para `http://127.0.0.1:3001`, preservando o corpo
original e o cabeçalho `X-Hub-Signature-256`. Configure o proxy para aceitar
corpos de pelo menos 3 MiB. Não publique a pasta `.runtime` como conteúdo estático.
O proxy do Vite serve somente ao desenvolvimento e usa a porta padrão 3001;
ajuste `vite.config.mjs` se alterar essa porta no `.env`.

No App Dashboard da Meta:

1. Abra **WhatsApp > Configuração**, ou **Casos de uso > Personalizar >
   Configuração** para aplicativos criados pelo caso de uso WhatsApp.
2. Em **URL de callback**, informe `https://SEU-DOMINIO/webhooks/whatsapp`.
3. Em **Token de verificação**, informe o mesmo `WHATSAPP_VERIFY_TOKEN` do `.env`.
4. Clique em **Verificar e salvar** e assine o campo **`messages`**. Esse campo
   inclui mensagens recebidas e status de mensagens enviadas.
5. Use o teste do painel e depois envie uma mensagem ao número da empresa para
   validar a entrega real. Confirme que o aplicativo está associado à conta
   WhatsApp Business correta e em modo Live para produção.

Se o teste do painel chegar, mas mensagens reais não chegarem, confira também
a assinatura do aplicativo na WABA em
[`/{WABA-ID}/subscribed_apps`](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/subscribed_apps/).
Essa associação é distinta da assinatura do campo `messages` no aplicativo.

Para receber o campo `messages`, o aplicativo precisa da permissão
`whatsapp_business_messaging`. Outros campos podem exigir
`whatsapp_business_management`. Veja os requisitos na
[visão geral oficial](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/).
Não é necessário um token de acesso para validar a assinatura dos POSTs;
autorização de API, envio de mensagens e vínculo com a conta são etapas distintas.

### Teste com HTTPS sem domínio

Para testes locais, um [Quick Tunnel da Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
gera uma URL HTTPS temporária sem conta ou domínio. Com o receptor iniciado e o
`cloudflared` instalado, execute:

```powershell
.runtime/tools/cloudflared.exe tunnel --no-autoupdate --url http://127.0.0.1:3001 --protocol http2
```

Use a URL `https://...trycloudflare.com/webhooks/whatsapp` no callback da Meta.
Esse comando pressupõe o executável oficial em `.runtime/tools/cloudflared.exe`;
ele foi baixado localmente e não faz parte do repositório. O endereço muda ao
reiniciar o túnel e só funciona enquanto o computador, o receptor e o túnel
estiverem ligados. Para produção, use hospedagem e endereço permanentes.

Na configuração local assistida, a URL atual fica em
`.runtime/webhook-tunnel.json`, os PIDs em `.runtime/webhook.pid` e
`.runtime/tunnel.pid`, e os logs em `.runtime/webhook.*.log` e
`.runtime/tunnel.*.log`. Ao preencher ou alterar o App Secret, reinicie somente
o receptor para carregar o `.env`, preservando o túnel e sua URL.

### Recebimento e armazenamento

- GET: compara o token e o modo `subscribe`; responde o `hub.challenge` como texto.
- POST: valida HMAC-SHA256 sobre os bytes originais antes de interpretar o JSON.
- Aceita payloads de até 3 MiB e percorre todas as entradas e alterações do lote.
- Grava o payload original e eventos em SQLite antes de responder `200`.
  Falhas de gravação retornam `500`, permitindo uma nova tentativa pela Meta.
- Evita duplicatas por mensagem, conta e número; preserva estados diferentes da
  mesma mensagem e captura outros campos. Mantém identificadores BSUID mesmo
  quando o telefone não vem no payload.

O banco padrão é `.runtime/whatsapp.sqlite`, com tabelas `deliveries` (payloads
originais) e `events` (mensagens, status e outras alterações). Mantenha esse
arquivo e seus arquivos WAL em disco persistente com acesso restrito e backup.
`WEBHOOK_DB_PATH` permite mudar o destino. A interface ainda usa dados locais
de demonstração: os eventos recebidos não são sincronizados com a caixa de
atendimento, e este receptor não envia mensagens. Não há API pública de leitura
dos eventos nem credenciais armazenadas no navegador.

Validação: `npm test` e `npm run build`. Os testes do webhook usam credenciais
fictícias, servidor HTTP local e banco temporário, sem chamar a Meta.

No PowerShell com bloqueio de scripts, use `npm.cmd` no lugar de `npm`.
