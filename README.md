# Klivo

CRM em React. Requer Node.js 24. Instale as dependências com `npm install` e
inicie a interface com `npm run dev` (http://127.0.0.1:4173).

## Login e contas

O formulário aceita e-mail ou usuário. Quando uma conta tem `username`
configurado, somente esse usuário permite entrar; o e-mail é mantido como
contato, sem funcionar como login alternativo. O usuário inicial opcional
fica em `KLIVO_ADMIN_USERNAME` no `.env`.

### Leitura e cópia de mensagens

A migração `0005_message_views.sql` guarda a leitura por empresa, usuário,
contato e ID da mensagem. Uma conversa aberta é marcada como lida quando a
aba está visível, com foco e no fim do histórico. É possível marcar a conversa
como não lida e filtrar a fila por não lidas, independentemente de estar
aguardando resposta. A leitura de um usuário não altera a dos demais e não
é gravada no documento compartilhado da empresa. Nenhuma confirmação de
leitura é enviada à Meta. O botão Copiar transfere somente o texto da mensagem
para a área de transferência e mantém as quebras de linha.

### Autenticação

O acesso ao CRM usa e-mail e senha, com logout e alteração de senha. O cadastro público está desativado na interface e na API.
O Worker em `server/crm/` autentica no D1 e usa PBKDF2-SHA256 com salt,
sessões de sete dias e cookies HttpOnly/Secure/SameSite. Há limitação de
tentativas de autenticação. As sessões são invalidadas ao sair ou trocar a senha.
Só o proprietário acessa o painel
global de testes do WhatsApp. O acesso não inclui confirmação de e-mail
nem recuperação de senha por e-mail nesta versão.

As contas, sessões e espaços de empresa são persistidos no servidor. Cada
usuário provisionado recebe uma empresa vazia. Contatos, anotações, histórico de texto
importado, setores, respostas rápidas, rascunhos de modelos, lembretes e logs
são salvos no D1 por empresa. A interface consulta atualizações a cada dez
segundos e ao recuperar o foco. Escritas são confirmadas pelo servidor antes
de aparecerem como salvas; conflitos de revisão retornam 409 e atualizam a tela.

Os acessos de administrador e atendente, setores e capacidades adicionais
são verificados no servidor em todas as operações. O usuário não pode trocar
sua identidade de atendente. Cada conta pode participar de várias empresas
e alternar a empresa ativa. As mutações informam explicitamente a empresa
para evitar que uma troca em outra aba aplique uma alteração ao espaço errado.
Administradores geram convites por link vinculados a e-mail e válidos por sete
dias, gerenciam os acessos e podem removê-los. O convite não é enviado por e-mail.
O último administrador não pode ser removido ou rebaixado.

A migração do armazenamento local é opcional e só pode ser feita por um
administrador em uma empresa vazia: até mil contatos, anotações e histórico
de texto. A versão anterior permanece no navegador; os registros importados
são marcados como históricos e não autorizam envios reais. Anexos locais não
são transferidos para a nuvem nesta etapa. Os arquivos da versão anterior
continuam no IndexedDB de origem.

Nesta primeira implementação, o estado de cada empresa usa um documento D1
com revisão e limite de 900 KB. A autorização revalida a associação do usuário,
incluindo mudanças de papel/setores, no momento da escrita. Recibos por operação
evitam reaplicar uma alteração confirmada. Antes de crescer para bases grandes,
normalize contatos, mensagens e logs em tabelas por entidade e acrescente
armazenamento próprio de mídias. O onboarding de WhatsApp de cada empresa e
o envio real pela caixa de atendimento ainda são etapas separadas.

### Recebimento do WhatsApp na caixa de atendimento

A migração `0004_inbound.sql` associa conta WhatsApp e ID do número a uma
única empresa. Configure `WHATSAPP_BUSINESS_ACCOUNT_ID`,
`WHATSAPP_PHONE_NUMBER_ID` e `KLIVO_ADMIN_EMAIL` no `.env`, aplique as migrações
e execute `node scripts/connect-test-inbox.mjs`. Por padrão, o número de teste
é associado à empresa original da conta proprietária; para selecionar outra
empresa da qual ela seja administradora, informe `KLIVO_TEST_WORKSPACE_ID`.
O script recusa transferir automaticamente um número já vinculado a outra empresa.

O receptor continua validando e armazenando os webhooks antes de responder à
Meta. Ao consultar a empresa, a API processa até vinte eventos de mensagem
pendentes por atualização, identifica a conta e o número exatos e cria ou
reutiliza o contato no setor configurado (Triagem por padrão). O histórico
preserva o ID original da mensagem e sua data; mensagens novas abrem ou
reabrem o atendimento. Eventos antigos não fazem o horário da última mensagem
retroceder nem reabrem um atendimento encerrado com mensagens mais recentes.
Reentregas não duplicam registros. Recibos de projeção e revisão do documento
são gravados em uma transação, sem sobrescrever alterações concorrentes.

A interface atualiza a cada dez segundos, ao recuperar foco e pelo botão
Atualizar mensagens na barra lateral. Com o CRM fechado, os eventos permanecem
no receptor e são incorporados na próxima consulta. Status de envio ficam no
painel de testes e não criam contatos ou conversas recebidas. Textos, respostas
de botões e descrições/legendas de outros tipos aparecem no histórico; download
e reprodução de mídias ainda não estão implementados. Nenhuma resposta,
confirmação de leitura ou mensagem de saída é enviada à Meta por esse processo.

As permissões e restrições de entrega da Meta continuam aplicáveis. Só é possível
exibir uma mensagem real se ela for entregue ao webhook. Dados fictícios do
botão Test do painel com IDs de conta/número diferentes não são associados a
uma empresa como se fossem mensagens reais do número conectado.

Aplique as migrações antes de publicar e execute `node scripts/bootstrap-account.mjs`
uma única vez para preparar o proprietário. As credenciais iniciais ficam em
`KLIVO_ADMIN_EMAIL` e `KLIVO_ADMIN_PASSWORD` no `.env` ignorado pelo Git.
A senha não é publicada como variável de ambiente e não é exibida nos logs.
Troque a senha inicial pelo botão Alterar senha após entrar. Rodar o bootstrap
novamente não altera a senha de uma conta existente.

## Webhook oficial do WhatsApp

### Painel protegido de testes

Acesse `/whatsapp.html` (também disponível nas configurações do CRM) após
entrar na conta administradora. O painel usa a mesma sessão do CRM; a chave
antiga deixou de autorizar requisições. Os segredos da Meta ficam no servidor.

O painel consulta eventos dos dez recebimentos mais recentes no mesmo D1 do
webhook. Ele permite enviar texto ou o modelo de teste `hello_world` somente
para `WHATSAPP_TEST_RECIPIENT`, configurado no servidor. A Meta continua
aplicando suas restrições de destinatário, permissões, publicação e janela
de atendimento. Uma resposta de envio aceito não confirma a entrega.
O painel de testes não mantém
histórico próprio de mensagens enviadas; os status recebidos são mostrados
quando entregues ao webhook. Trata-se de uma ferramenta de teste de uma
única conta, sem suporte a múltiplas empresas.

Configure no `.env` (sem prefixos `VITE_`):

```dotenv
META_ACCESS_TOKEN=token_novo_da_meta
WHATSAPP_PHONE_NUMBER_ID=id_do_numero_de_teste
WHATSAPP_TEST_RECIPIENT=numero_autorizado_com_pais_e_ddd_somente_digitos
```

Compile com `npm.cmd run build` e publique com
`node scripts/cloudflare-app-deploy.mjs`. O script envia apenas as três
variáveis acima e remove o arquivo temporário de segredos ao finalizar.
Atualize e publique novamente quando o token temporário da Meta expirar.

### Publicar a interface no Cloudflare

`wrangler.app.jsonc` publica a interface e a API de autenticação, com fallback
para as rotas React. Depois de autenticar na conta desejada:

```powershell
npm.cmd run build
npx.cmd wrangler deploy --config wrangler.app.jsonc
```

A interface persiste os dados de cada empresa no D1. O recebimento na caixa de
atendimento exige associar a conta e o número à empresa pelo procedimento acima.
O webhook e seu banco D1 são publicados separadamente, conforme abaixo.

O back-end recebe eventos em **`GET/POST /webhooks/whatsapp`**, seguindo a
[documentação da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint).

### Hospedagem permanente: Cloudflare Workers + D1

O receptor em `server/cloudflare/worker.mjs` roda na Cloudflare com HTTPS em um
endereço `workers.dev`. O D1 armazena os recebimentos. Essa versão funciona
com o computador desligado e substitui o túnel de testes. O endereço publicado
fica disponível no resultado de `npm.cmd run webhook:deploy`; use o caminho
`/webhooks/whatsapp` como callback na Meta e mantenha o mesmo token do `.env`.

O arquivo `wrangler.jsonc` contém o Worker `klivo-webhook` e o banco
`klivo-webhooks`, com binding `DB`. Use o login padrão do Wrangler:

```powershell
npx.cmd wrangler login
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
npx.cmd wrangler d1 execute klivo-webhooks --remote --command "SELECT field, kind, COUNT(*) AS total FROM events GROUP BY field, kind"
```

Para preservar recebimentos do SQLite local anterior, prepare uma importação
idempotente e aplique-a no D1:

```powershell
npm.cmd run webhook:import:prepare
npx.cmd wrangler d1 execute klivo-webhooks --remote --file .runtime/whatsapp-import.sql
```

O SQL de importação contém as mensagens recebidas e fica apenas na pasta local
ignorada pelo Git. A importação não altera o SQLite original.

Para desenvolvimento, `npm.cmd run webhook:migrate:local` prepara o D1 simulado
e `npm.cmd run webhook:dev` inicia o Worker em `http://localhost:8787`, usando
os segredos do `.env` local. Os testes usam Miniflare/workerd e credenciais
fictícias para verificar assinatura, lotes, duplicatas, payloads grandes e rollback.
O receptor e sua migração são independentes do armazenamento dos espaços de
empresa. As associações de recebimento são configuradas separadamente.

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
`WEBHOOK_DB_PATH` permite mudar o destino. O receptor local não alimenta a caixa de
atendimento na nuvem e não envia mensagens. Não há API pública de leitura
dos eventos nem credenciais armazenadas no navegador.

Validação: `npm test` e `npm run build`. Os testes do webhook usam credenciais
fictícias, servidor HTTP local e banco temporário, sem chamar a Meta.

No PowerShell com bloqueio de scripts, use `npm.cmd` no lugar de `npm`.

## Respostas reais pelo WhatsApp

A migração 0007_outbox.sql habilita a caixa de saída persistente. Respostas de texto são permitidas somente para contatos recebidos do WhatsApp, dentro de 24 horas da última mensagem, com acesso ao setor e atendimento disponível. O servidor determina o destinatário pelo vínculo com a conta e o número configurados, assina o texto com o nome do atendente e valida citações na própria conversa. Modelos iniciados pela empresa, anexos e áudios continuam indisponíveis no envio conectado.

A reserva da operação acontece antes da chamada externa. Repetir a mesma operação não chama a Meta novamente; falhas de rede ficam sem confirmação e não têm reenvio automático. A API aceitar uma mensagem não equivale à entrega: callbacks atualizam o histórico para enviada, entregue, lida ou não entregue, mostrando o erro da Meta. Apenas confirmação de envio limpa a espera por resposta. Até 20 tentativas por minuto por empresa. O token fica somente no Worker. As restrições da Meta continuam sendo aplicadas.

## Modelos aprovados na Meta

Em Templates → Modelos WhatsApp, o CRM consulta os modelos aprovados da conta vinculada à empresa ativa, usando whatsapp_business_management. O botão Enviar template na conversa permite escolher a versão/idioma, preencher variáveis posicionais ou nomeadas e conferir a prévia. Cabeçalhos com imagem, vídeo ou documento e cartões de carrossel recebem URLs HTTPS públicas; o arquivo é buscado pela Meta. Formatos não suportados são indicados e não são enviados. Os rascunhos locais não são usados para envio real.

O servidor consulta novamente a aprovação e o vínculo antes de enviar, determina nome, idioma e componentes a partir da definição da Meta, exige confirmação de autorização do cliente e usa a mesma caixa de saída idempotente das respostas. Modelos podem ser enviados fora da janela, mas não reabrem o atendimento nem renovam as 24 horas sem resposta do cliente. Aprovação não elimina as restrições e cobranças da Meta. Templates de autenticação ainda não são suportados.
