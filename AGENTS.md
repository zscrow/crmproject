# Klivo

## Desenvolvimento e integração com a Meta

Leia `docs/meta-conformidade.md` antes de alterar autenticação, integração com a
Meta, envio/recebimento de mensagens, cadastro de clientes ou documentos públicos.
Essa referência reúne os documentos fornecidos pelo usuário e o diagnóstico de
18/11/2026. Consulte a fonte oficial atual quando uma decisão depender de um
requisito que possa ter mudado.

- Distinga exigências expressas, recomendações de engenharia e hipóteses sobre
  bloqueios. Não atribua à Meta uma causa de suspensão não demonstrada.
- Use APIs oficiais e somente os acessos necessários à funcionalidade.
- Verifique identidade, titularidade, permissões e elegibilidade dos ativos antes
  de ativar uma integração. Uma nova conta não comprova regularização anterior.
- Não troque perfis, portfólios, apps ou números com o propósito de contornar uma
  restrição. Trate a restrição e as orientações da Meta explicitamente.
- Preserve a validação no servidor da janela de 24 horas, dos modelos aprovados,
  das permissões por empresa e da assinatura dos webhooks.
- Não trate confirmação do atendente como autorização obtida do destinatário.
  Respeite pedidos de interrupção de contato, inclusive recebidos fora do WhatsApp.
- Mantenha termos, privacidade e exclusão coerentes com o comportamento real.
  Não invente responsável legal, documentos, verificações ou autorizações.
- Não exponha tokens, senhas, segredos ou conteúdo privado em Git, logs ou respostas.
- Ao implementar uma proteção, registre o que foi verificado. Não declare
  conformidade integral nem garantia de aprovação da Meta com base em testes.

## Verificação

Use verificações proporcionais à mudança. Alterações somente de documentação não
exigem novos testes de implementação. Para alterações de envio e autorização,
teste os casos de recusa relevantes sem enviar mensagens reais desnecessárias.
