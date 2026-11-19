# Revisão dos termos — 19/11/2026

Referência complementar a `meta-conformidade.md`. Não certifica conformidade ou
elegibilidade, não substitui os textos oficiais e não promete ausência de sanções.
Reconsultar fontes oficiais quando decisões dependerem de requisitos atualizados.

## Aceite observado na conexão

A consulta `whatsapp_biz_businesses`, somente leitura, retornou exclusivamente
**Alovi**, Business ID `1464415402550438`, com `prerequisites_met: true`.
A pendência anterior de Developer Terms deixou de aparecer. Portanto, a verificação
de app/termos desta conexão passou; a resposta não discrimina versões aceitas,
quem aceitou ou o instante de cada aceite. Não é prova de aceitação individual de
todos os contratos incorporados, aprovação da operação ou regularização anterior.

O mesmo retorno informa `profile_complete: false` e `business_verified: false`.
Completar os [dados reais do negócio](https://business.facebook.com/settings/info/?business_id=1464415402550438)
antes de prosseguir no onboarding. Verificação empresarial depende do recurso e
do caso de uso; não inventar pessoa jurídica ou documentos para preencher campos.

## Inventário de leitura

| Documento oficial | Alcance efetivamente lido nesta revisão |
| --- | --- |
| [Termos do WhatsApp para a Plataforma](https://www.whatsapp.com/legal/WhatsApp-Terms-for-WhatsApp-Business-Platform) | Texto integral, 17 seções; vigência informada: 23/09/2026. Também fornecido pelo usuário. |
| [Política de Mensagens do WhatsApp Business](https://whatsappbusiness.com/policy/) | Texto integral disponível, incluindo exceções e listas de países; atualização informada: 23/09/2026. |
| [Termos da Plataforma Meta](https://developers.facebook.com/terms/) | Texto integral, seções 1–12, incluindo transferências internacionais e glossário; atualização: 03/02/2026. Obtido da página pública oficial, sem autenticação. |
| [Políticas do Desenvolvedor](https://developers.facebook.com/devpolicy/) | Texto integral, inclusive seções condicionais de outros produtos; atualização: 03/02/2026. Obtido da página pública oficial. |
| [Diretrizes de Mensagens](https://www.whatsapp.com/legal/messaging-guidelines) | Texto integral disponível; atualização informada: 23/09/2026. |
| [Política de Propriedade Intelectual](https://www.whatsapp.com/legal/ip-policy) | Texto integral disponível. |
| [Diretrizes da marca WhatsApp](https://www.meta.com/brand/resources/whatsapp/whatsapp-brand/) | Página integral disponível, incluindo usos proibidos e disposições legais. |
| [Padrões de Publicidade](https://transparency.meta.com/policies/ad-standards/) | Página principal e texto fornecido anteriormente; não todos os subdocumentos vinculados. |
| [Termos da Meta para a Plataforma WhatsApp](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform) | Pendente: fonte oficial redireciona para login/bloqueio; resposta HTTP pública alternativa não apresentou o texto. Não substituído por resumo de terceiros ou versão antiga indexada. |
| [Termos Cloud API](https://www.facebook.com/legal/WhatsApp-Business-Platform-Cloud-API) | Pendente: página oficial não forneceu o texto nas formas de acesso disponíveis. |
| [Termos de Serviço Meta](https://www.facebook.com/legal/terms) e [Termos Comerciais](https://www.facebook.com/legal/commercial_terms) | Pendente nesta revisão: redirecionamento para login/bloqueio. |

O [índice oficial de termos](https://whatsappbusiness.com/terms-and-conditions/)
confirma os contratos específicos da Plataforma e Cloud API. A existência do link
não equivale à leitura. Anexos incorporados, padrões da comunidade e políticas de
produtos adicionais também não foram integralmente auditados. Antes de incorporar
IA, pagamentos, anúncios, atividades reguladas ou novo produto, verificar a cadeia
específica vigente. As regras de Messenger/Instagram não ampliam a janela WhatsApp.

## Exigências expressas e consequências para o Klivo

Dos Termos da Plataforma, seções 3–7:

- Publicar privacidade acessível, declarar dados e finalidades reais e oferecer
  solicitação clara de alteração/exclusão. Aplicar exclusão também ao encerrar
  serviço/conta ou quando os dados deixarem de ser necessários, salvo retenção
  legal demonstrável.
- Se operar para clientes, tratar dados sob suas instruções, separar empresas,
  limitar compartilhamentos e manter identificação dos clientes e fornecedores.
  Fornecedores precisam assumir obrigações escritas; isso exige conferir os
  contratos efetivos, não presumir que a hospedagem já atende.
- Proteger credenciais e dados, permitir relato acessível de vulnerabilidades e
  corrigir falhas. Incidentes exigem comunicação à Meta e cooperação conforme os
  termos e prazos legais aplicáveis.
- Cooperar com análises, auditorias e atestações; aprovação não dispensa cumprimento.
- A seção 7(e)(i)(3) proíbe apps criados ou mantidos para contornar fiscalização ou
  restrições. A conexão nova não demonstra autorização para retomar uso restrito.

Das Políticas do Desenvolvedor, seções 1–3: conta autêntica, consentimento para agir
por terceiros, suporte acessível, cadastro correto e acompanhamento dos avisos.
Nome, ícone e descrição também devem seguir os padrões aplicáveis. Não alegar
parceria ou aprovação inexistente. Regras dos demais produtos são condicionais.

Dos documentos WhatsApp: respeitar autorização e interrupção de contato; aplicar
janela de atendimento e modelos; proteger dados; evitar spam, fraude e conteúdo
proibido; oferecer escalonamento quando houver automação. As diretrizes de marca
vedam usos que confundam o público sobre origem, patrocínio ou parceria.

## Implementação e verificações ainda necessárias

As proteções locais de mensagens e autorização estão descritas em
`meta-conformidade.md` e `testes-preferencias.md`. Foram escolhas de implementação,
não prova da veracidade dos consentimentos nem de cumprimento integral.

Antes da ativação, ainda verificar elegibilidade e restrições anteriores, titularidade
e permissões dos ativos, dados cadastrais, identidade pública e publicação dos
documentos. Validar exclusão de ponta a ponta, retenção e cópias, fornecedores e
contratos, canal de segurança e resposta a incidentes. Conferir requisitos de
acesso/App Review e verificação para o caso de uso real, especialmente terceiros.
Concluir a leitura dos contratos pendentes antes de decisões dependentes deles.

Nesta revisão não houve alteração de produção, aceite em nome do usuário,
configuração de ativos ou envio de mensagens. A atualização é documental e não
exige nova execução de testes de implementação.
