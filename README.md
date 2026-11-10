# zapCaster · React

CRM local de atendimento empresarial. Front-end em **React 19**, JavaScript/JSX e CSS, com **Vite 8**. Integração futura com a API oficial do WhatsApp.

## Abrir e executar

Requer Node.js 24 e npm.

```powershell
npm install
npm run dev
```

Acesse **http://127.0.0.1:4173/**. No Windows também pode dar dois cliques em `iniciar.cmd`. O servidor fica disponível somente neste computador. Mantenha o terminal aberto ao iniciar manualmente.

```powershell
npm test          # regras de negócio, armazenamento, áudio e componentes React
npm run build    # gera a versão de produção em dist/
npm run preview  # confere o build localmente (pare o dev antes)
npm run format   # formata os arquivos de código
```

## Organização do código

- `src/main.jsx`: inicia o React e importa os estilos.
- `src/App.jsx`: navegação e estrutura principal.
- `src/pages/`: atendimentos, clientes, conversa, templates, equipe, logs e configurações.
- `src/components/`: compositor, mensagens, formulários, visualizador de arquivos e PDF.
- `src/store.mjs`: estado compartilhado e ações, conectado ao React por `useSyncExternalStore`.
- `src/domain/`: regras independentes para janela de atendimento, responsáveis, permissões e atalhos.
- `src/services/`: gravação de áudio, arquivos locais e formatação.
- `tests/`: testes dos módulos ativos e dos componentes React.
- `legacy/`: cópia da implementação anterior para consulta. Não é carregada pelo aplicativo React.

## Funcionalidades

Fila de cards compactos, cores de situação, setores em botões, responsáveis, transferência unificada, detalhes de espera e primeira resposta. Recentes exibe os últimos 20 atendimentos finalizados do usuário sem apagar o histórico.

Contatos com busca por telefone normalizado antes de cadastrar. O novo contato fica atribuído ao criador e abre a conversa. Favoritos e exportação respeitam o perfil selecionado.

Templates são personalizados na própria aba. Atalhos completos, como `/ola`, se transformam no texto durante a digitação, sem Enter. Configure `chave_pix` e `favorecido` no template `/pix`.

Compositor com anexo, emoji, microfone e envio. Gravação real pelo navegador, revisão e cancelamento; o microfone é liberado ao sair. O áudio aparece em player, sem o nome técnico. A permissão e o funcionamento físico do microfone dependem do dispositivo e do navegador.

Anotações e formulários não fecham ao clicar fora. Alterações não salvas exigem escolha ao fechar explicitamente. Anexos usam IndexedDB; imagens, PDF, áudio, vídeo e texto têm visualizador no aplicativo. Imagens e PDFs oferecem impressão. Outros formatos podem ser baixados. Limite local: 25 MB por arquivo.

O PDF.js é carregado sob demanda; fontes, mapas e WASM são preparados automaticamente antes de iniciar ou gerar o build, em `public/pdf-assets/`.

## Dados e migração

A migração mantém as chaves `zc-*` do localStorage e o banco IndexedDB `zapcaster-media`, versão 1, com a store `assets`. Contatos, mensagens, notas, templates, perfis e anexos continuam no mesmo navegador e origem **http://127.0.0.1:4173**. Trocar navegador, porta ou usar `localhost` no lugar de `127.0.0.1` usa outro armazenamento. Nenhum dado precisa ser enviado para converter o front-end.

Os nomes de autores são gravados em cada mensagem e não mudam quando o perfil é editado. Logs novos registram ações importantes, sem navegação, tema ou recebimento comum.

## Limites da prévia

Ainda é uma demonstração local: não há backend, login real, sincronização entre colaboradores ou conexão com a Meta. O seletor de atendente serve para testar perfis. Permissões do front-end precisam ser validadas no servidor antes de produção.

A janela local de 24h conta da última mensagem recebida do cliente. Texto livre é bloqueado após o prazo; envio do atendente ou modelo não renova a janela. Modelos são rascunhos/exemplos e o botão de envio apenas simula: não transmite mensagens nem gera cobrança. O backend futuro deverá receber webhooks e usar modelos aprovados.

## Respostas citadas e descoberta de atalhos

O botão `Responder` em cada mensagem seleciona uma citação. A prévia pode ser cancelada sem apagar o rascunho. Ao enviar, a mensagem armazena a referência e uma cópia do autor e do trecho citado; clicar na citação volta à mensagem original. A referência é validada contra o histórico do próprio cliente. No backend futuro, essa referência deverá ser ligada ao ID oficial de contexto do WhatsApp.

Digite `/` para listar os templates rápidos ativos. A busca combina atalho e título, ignorando acentos para facilitar a descoberta. Clique ou use as setas e Enter/Tab para inserir; Escape fecha a lista. O atalho completo continua expandindo automaticamente. A seleção insere o texto na caixa, sem enviar. Modelos oficiais fora da janela de 24h continuam no fluxo separado de modelos WhatsApp.
