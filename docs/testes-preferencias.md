# Testar autorização e interrupção — etapa 1

Implementação local de 19/11/2026. Não envia mensagens reais nem configura a Meta.
O registro de uma autorização não comprova sua veracidade: use somente evidências
reais em uma operação de produção. Na demonstração, use exclusivamente dados fictícios.

## Abrir a demonstração

Na pasta do projeto, execute:

```powershell
node prepare-react-runtime.cjs
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort
```

Abra http://127.0.0.1:4173/demo. O aviso **Demonstração local · sem envios reais**
identifica o ambiente. Essa entrada só existe no servidor de desenvolvimento;
o build de produção continua exigindo autenticação. A demonstração usa dados
fictícios em armazenamento separado do CRM normal e não consulta as APIs.

## Roteiro manual

1. Abra o atendimento de Mariana Costa e clique em **Preferências de contato**.
2. Registre autorização para **Atualizações de pedidos e serviços**, com finalidade
   `Atualizações sobre o pedido de teste 123`, data passada e referência
   `Formulário fictício de adesão do pedido de teste 123`.
3. Abra novamente as preferências. Confira o status e o histórico. A categoria de
   ofertas deve continuar sem autorização.
4. Em uma conversa encerrada, tente o modelo de exemplo antes e depois de registrar
   autorização para aquele destinatário. Ele simula o envio e não reabre as 24 horas.
5. Volte às preferências e escolha **Registrar pedido de interrupção**, **Ofertas e
   recomendações**, origem **E-mail**. Registre um pedido fictício posterior à
   autorização. Respostas de atendimento ainda devem ser permitidas dentro das 24h.
6. Registre outra interrupção para **Todas as mensagens**. O compositor deve mostrar
   **Contato descadastrado**. Novos envios devem ser bloqueados.
7. Em **Clientes**, o contato sai das abas ativas e passa para **Descadastrados**.
   O histórico permanece acessível. O CSV de contatos ativos não inclui esse número.
8. Recarregue a página: o bloqueio deve permanecer. Recriar o mesmo destinatário,
   inclusive com a variante brasileira sem o nono dígito, não remove a supressão.
9. No atendimento, expanda **Testar recebimento · demonstração**, simule `SAIR` e
   confira o registro automático. Depois simule `Oi`: a janela pode reabrir, mas o
   bloqueio de envios deve permanecer. `parar ofertas` interrompe apenas marketing.
10. Para retomar, um administrador registra uma nova autorização, com data posterior
    ao pedido de saída, evidência e confirmação explícita de retomada. Somente a
    categoria escolhida é autorizada; autorizações antigas não são restauradas.
    Escolha **Respostas de atendimento** para registrar um novo pedido que permita
    retomar respostas livres dentro da janela. Autorizar apenas atualizações não
    libera respostas de atendimento nem ofertas.
11. Troque para um atendente com acesso ao setor. Ele pode registrar interrupção;
    apenas o administrador pode registrar uma nova autorização nesta etapa.

Datas iguais ou anteriores ao último evento da finalidade são recusadas. Aguarde
um segundo ou informe a hora exata ao simular eventos consecutivos.

## Verificações automatizadas

```powershell
node --test tests/communication.test.mjs tests/communication-api.test.mjs tests/outbound.test.mjs
node node_modules/vitest/vitest.mjs run tests/communication-preferences.test.jsx tests/meta-template-dialog.test.jsx tests/demo.test.jsx
```

Os testes de API usam D1 emulado e substituem o transporte da Meta. Validam ausência
de chamadas de envio quando há bloqueio, autorização ausente, estado antigo ou
mensagens recebidas pendentes de processamento. Também validam isolamento por
empresa/setor, permissões, duplicidades, janela e finalidade do modelo.

## Limites desta etapa

- O reconhecimento automático cobre frases diretas de texto e respostas de botões,
  como `SAIR`, `STOP`, `cancelar mensagens` e `parar ofertas`. Não interpreta todos
  os pedidos em linguagem livre, áudio ou outros canais; a equipe precisa registrar
  esses pedidos manualmente. Não há resposta automática ao pedido de saída.
- A finalidade de texto livre depende do contexto do atendimento. O sistema não
  verifica semanticamente se o conteúdo corresponde à autorização. Modelos exigem
  autorização registrada na categoria e confirmação da finalidade pelo atendente.
  Respostas a pedidos do cliente dentro das 24h não precisam de um formulário de
  autorização no Klivo quando não há interrupção anterior. Um registro de retomada
  de atendimento é exigido por este controle após um pedido de interrupção.
- O bloqueio alcança novos envios pelo Klivo. Não desfaz uma mensagem que já foi
  encaminhada à Meta, nem controla envios feitos em outras ferramentas.
- A supressão e a trilha ficam no documento de cada empresa no D1. Não exigem nova
  migração. O limite existente de 900 KB continua aplicável; não há descarte
  automático da trilha. Dados de contas e autorização não são importados do histórico.
- A interface antiga `/whatsapp.html` consulta eventos, mas seu endpoint de envio
  retorna 410 para impedir um caminho sem os controles das conversas.
- Estes testes não verificam elegibilidade da conta nem significam aprovação da
  Meta. Antes de qualquer teste real, conferir conta autorizada, escopo, número,
  destinatário, evidência de adesão e restrições vigentes.
