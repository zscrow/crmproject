# Referência de desenvolvimento do Klivo — Meta e WhatsApp

Preparada em 18 de novembro de 2026. O usuário pediu que o desenvolvimento e as
orientações sigam os documentos que forneceu. Este arquivo é uma síntese de
trabalho, não substitui os documentos originais nem certifica aprovação da Meta.

## Fontes e alcance

| Documento | Fonte | Leitura realizada |
| --- | --- | --- |
| Termos do WhatsApp para a Plataforma do WhatsApp Business | https://www.whatsapp.com/legal/WhatsApp-Terms-for-WhatsApp-Business-Platform | Texto fornecido, 17 seções, vigência em 23/09/2026 |
| Política de Mensagens do WhatsApp Business | https://business.whatsapp.com/policy | Texto fornecido e página oficial; o texto colado não contém as listas completas de países das exceções |
| Padrões de Publicidade da Meta | https://transparency.meta.com/policies/ad-standards/ | Página principal e texto fornecido; não todos os subdocumentos vinculados |
| Create an App with Meta | https://developers.facebook.com/documentation/development/create-an-app | Página oficial consultada em 18/11/2026 |
| Aplicação de políticas da Plataforma | https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement | Consultada para interpretar as notificações e os caminhos de análise |

Os termos incorporam outros documentos, incluindo os Termos da Meta para a
Plataforma do WhatsApp Business. A revisão foi ampliada em 19/11/2026:
veja [inventário, requisitos e limites de acesso](meta-termos-revisao.md).
Essa cadeia não foi integralmente auditada.
Consulte o documento aplicável antes de concluir sobre recursos novos, uso por
outras empresas, provedores de IA, tratamento de dados ou atividades reguladas.

## Exigências expressas relevantes

1. **Identidade e informações do negócio.** Manter perfil e contatos corretos e
   atualizados; não representar outra entidade sem autorização. O cadastro deve
   refletir o responsável real. Explicar a relação entre produto Klivo e marca
   operadora sem inventar registro empresarial ou vínculo com a Meta.
2. **Autorização para contato.** Obter número/identificador e adesão do destinatário
   conforme a política; respeitar o contexto e as permissões aplicáveis. Uma
   mensagem de atendimento não demonstra adesão a futuras campanhas de marketing.
3. **Interrupção.** Respeitar pedidos para interromper comunicações recebidos dentro
   ou fora do WhatsApp, inclusive a remoção da lista de contatos conforme a política.
4. **Janela de atendimento.** Respostas livres somente nas 24 horas após a mensagem
   mais recente do usuário. Fora da janela, usar modelo aprovado para sua finalidade.
   Enviar um modelo não reabre a janela; uma nova mensagem do usuário a reinicia.
5. **Automação.** Quando utilizada para responder, oferecer caminhos claros e
   diretos de escalonamento, como atendimento humano ou outros canais listados.
6. **Dados.** Publicar política de privacidade, obter os avisos e permissões
   necessários, limitar finalidades e proteger as informações. Não solicitar os
   identificadores sensíveis completos proibidos nem compartilhar a conversa de um
   cliente com outro cliente. Manter isolamento entre empresas no CRM.
7. **Atividades e conteúdo.** Aplicar as proibições e exceções específicas da
   política. Não presumir que uma licença local ou uma categoria de perfil autoriza
   uma atividade. Verificar produto, país e idade quando aplicáveis.
8. **Restrições.** A seção 3(c) dos termos contém declaração sobre suspensão ou
   remoção anterior; a seção 7 da política permite proibições de uso futuro. Uma
   nova conta, app ou portfólio não comprova autorização para retomar a operação.
9. **Anúncios.** Se implementados, verificar conteúdo, direcionamento, destino,
   atributos pessoais, produtos restritos e uso dos dados de publicidade. Não
   presumir que as regras de anúncios explicam uma suspensão do WhatsApp.

## Recomendações de implementação, não formatos impostos pela Meta

- Registrar a origem, data, finalidade e evidência da autorização, com revogação.
  A política exige autorização real, não um formato específico de banco de dados.
- Manter supressão persistente por destinatário e empresa, aplicada no servidor,
  com fluxo manual para solicitações externas. Reconhecer palavras de saída pode
  ajudar, mas não é o único meio permitido nem cobre todos os pedidos.
- Evitar reenvio automático após resultado incerto; manter idempotência, recibos e
  distinção entre aceitação, entrega e falha.
- Registrar códigos e detalhes técnicos úteis sem expor mensagens ou credenciais;
  apresentar alertas sobre restrições e interromper tentativas repetitivas.
- Definir retenção e procedimento de exclusão que alcance os dados e as cópias
  sob controle do Klivo, preservando somente o que tenha justificativa aplicável.
- Rever documentos públicos a cada mudança de funcionalidade ou fornecedor.

## Estado conhecido em 18/11/2026

- API oficial, assinatura de webhooks, controles por empresa, janela no servidor,
  consulta a modelos aprovados e prevenção de reenvio incerto existem no código.
- O envio de modelos usa declaração do atendente (`consent: true`), sem um fluxo
  completo de evidências da autorização e revogação.
- Não foi encontrado controle persistente de descadastramento no fluxo de envio.
  Isso é uma lacuna; não demonstra que um pedido real tenha sido desrespeitado.
- Páginas públicas não identificam nominalmente o responsável nem esclarecem a
  relação Klivo/Alovi Tech. Esses dados precisam vir do responsável real.
- A revisão de textos corrige a afirmação desatualizada de que o envio não existe
  e a descrição de cadastro público, atualmente desativado. A correção no código
  local não equivale a publicação.
- A conta de mensagens Alovi Tech estava `Disabled` na última consulta deste chat.
  A captura do usuário também mostra desativação mantida após revisão.
- O histórico contém restrição do Scrow anterior à tentativa com outro app e
  Alovi Tech. O cadastro inicial do Scrow usava site que não representava o projeto;
  foi posteriormente corrigido. Não há prova de que esses fatos causaram o bloqueio.
- O banco consultado registrou seis tentativas pela caixa de saída, todas com
  falha: três `130497` e três `131030`. Esse conjunto não cobre necessariamente
  chamadas diretas do painel de testes e não prova a causa da suspensão.
- O usuário informou ter criado nova conta ou perfil do Facebook. Isso não
  demonstra elegibilidade de novos ativos. Perfil principal representa a pessoa;
  Página representa a marca. Não recomendar identidade fictícia ou recriação para
  contornar restrições.

## Ordem de trabalho

1. Alinhar textos ao funcionamento real e manter estas referências no repositório.
2. Implementar evidências de autorização e interrupção de contato, com verificação
   no servidor e respeito ao escopo do pedido do destinatário.
3. Confirmar identidade pública, responsável e relação entre as marcas.
4. Antes da ativação, conferir elegibilidade, restrições, acesso aos ativos, tipo de
   número, permissões e requisitos do caso de uso. Desenvolvimento local pode seguir
   com testes simulados enquanto essas informações são esclarecidas.
5. Antes de atender empresas externas, verificar os requisitos atuais de App Review,
   acesso e onboarding. A documentação permite criação com portfólio não verificado;
   verificação pode ser exigida para determinados produtos e recursos.

Não prometer desbloqueio, aprovação ou ausência de penalidades. Atualizar fatos de
conta por consulta atual, sem tratar resultados históricos como estado presente.

## Etapa implementada em 19/11/2026 — alterações locais

- Preferências por destinatário e empresa, separadas entre utilidade, marketing e
  autenticação, além da retomada de respostas de atendimento após interrupção.
  Autorizações registram origem, finalidade, data, evidência e autor.
- Administradores registram autorizações; atendentes com acesso ao contato também
  podem registrar pedidos de interrupção, inclusive de outros canais.
- Pedido geral remove autorizações anteriores e bloqueia novos textos e modelos.
  Uma nova mensagem recebida não reativa a autorização. Retomada exige evidência
  posterior, confirmação explícita e autorização para uma categoria específica.
- Pedidos diretos reconhecidos em mensagens são registrados ao projetar o webhook.
  O envio recusa mensagens recebidas ainda não projetadas para não ignorar pedidos
  pendentes. Frases não reconhecidas e pedidos por outros canais exigem ação da equipe.
- Modelos exigem autorização registrada para sua categoria, além da aprovação da
  Meta e da confirmação do atendente sobre a finalidade do envio.
- A supressão acompanha o número, incluindo as variantes brasileiras com/sem nono
  dígito. Importações não fornecem autorização; trocar o registro de contato não
  remove o bloqueio do destinatário.
- Contatos com bloqueio geral ficam na aba Descadastrados, fora da lista e do CSV
  ativos. Histórico e preferências seguem os critérios de conservação/exclusão.
- Painel antigo de testes deixou de enviar para evitar um caminho sem essas
  verificações. Demonstração disponível somente no servidor de desenvolvimento.
- As proteções são escolhas de implementação para cumprir a política, não formatos
  impostos por ela. Não validam sozinhas a veracidade de uma autorização nem o teor
  semântico de uma mensagem; não desfazem envios já encaminhados.

Veja `docs/testes-preferencias.md` para roteiro, testes e limitações. A etapa não
publica o sistema, não altera a conta Meta nem comprova elegibilidade de operação.
