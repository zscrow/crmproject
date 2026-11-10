# Diretrizes de usabilidade do zapCaster

Pesquisa e aplicação: 9 de novembro de 2026.

## Direção de layout

O foco é permitir que a equipe encontre uma pessoa, entenda seu contexto e abra uma conversa com poucos passos. A proposta é uma hipótese de design fundamentada em referências; validar com atendentes reais antes de considerar a interface definitiva.

### Contatos

- Nome da página direto: Contatos. Descrição explica o que fazer.
- Novo contato é a ação principal no cabeçalho.
- Contatos aparecem antes de indicadores. Indicadores ficam na Visão geral.
- Busca, setor, ordenação e visualização têm rótulos permanentes.
- As categorias exibem contagens. Filtros aplicados podem ser removidos com Limpar filtros.
- Cards apresentam nome, empresa, tipo, setor, telefone, e-mail e última atividade.
- Editar e Conversar são botões visíveis; Conversar tem destaque em verde.
- A lista é uma alternativa para comparar os mesmos contatos.
- Ordenação real por nome ou ordem de cadastro; a última atividade demonstrativa não é usada como data de criação.

### Conversas

No desktop amplo: lista de contatos à esquerda, conversa ao centro e dados do contato à direita. A ficha lateral evita abandonar o atendimento para consultar telefone, e-mail ou setor. Em telas intermediárias, esses dados continuam acessíveis pelo cabeçalho e pela edição do contato. No celular, a lista e a conversa ocupam telas separadas, com botão de retorno.

### Navegação e leitura

- Menu com ícone e texto; a área selecionada tem cor, fundo e indicador de posição.
- No celular pequeno, as seis áreas ficam em uma grade de dois níveis, sem rolagem horizontal.
- Filtros de categoria e exportação continuam visíveis no celular.
- Fonte do sistema, sem dependência de carregamento externo de fontes.
- Texto principal em torno de 14 px, nomes em 16–17 px e informações auxiliares em 11–13 px.
- Contraste reforçado e botões principais com área mínima aproximada de 44 px.
- Informação de categoria é textual; não depende só de cor.
- Foco de teclado visível, link para pular o menu e contenção de foco nos formulários modais.
- Estado de demonstração e ausência de conexão real ao WhatsApp explícitos.

## Fontes

1. Nielsen Norman Group — Recognition and Recall: mostrar opções e contexto reduz a necessidade de memorizar comandos.
   https://www.nngroup.com/articles/recognition-and-recall/
2. Nielsen Norman Group — Visibility of System Status: comunicar estado e resultado das ações.
   https://www.nngroup.com/articles/visibility-system-status/
3. GOV.UK Design System — Button: texto de ação claro e destaque para a ação principal.
   https://design-system.service.gov.uk/components/button/
4. W3C — WCAG 2.2, Contrast Minimum: referência de contraste de 4,5:1 para texto normal e 3:1 para texto grande. A atualização não equivale a uma auditoria completa de conformidade.
   https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
5. Intercom — Customize the Inbox: referência de operação com navegação, lista de conversas e detalhes do contato em painéis.
   https://www.intercom.com/help/en/articles/7911926-customize-the-inbox-to-suit-you-and-how-you-work-best

## Validação realizada

- Verificação de sintaxe com npm run check.
- Revisão visual no navegador em desktop e viewport de celular (390 × 844).
- Busca de um contato, abertura da edição, abertura da conversa e exibição do contexto.
- Filtro por setor, ordenação, troca para lista e recuperação do estado sem resultados.
- Conferência de ausência de transbordamento horizontal da página e das categorias no celular.

## Próxima validação com usuários

Pedir a atendentes que encontrem um cliente, iniciem uma conversa, atualizem o setor e cadastrem um contato sem orientação. Observar erros, hesitações e tempo de conclusão. Ajustar nomes e prioridades conforme a rotina da empresa. Backend, autenticação, autorização efetiva e API oficial do WhatsApp continuam fora desta etapa.

## Revisão de operação

A direção visual mais recente é ardósia com azul, com fundo cinza e superfícies diferenciadas para reforçar bordas e contraste. O usuário aprovou a organização de Clientes: sua estrutura foi preservada. Atendimento ganhou responsabilidade explícita, transferência e cronômetros; a biblioteca de mensagens e os logs têm páginas próprias para evitar concentrar todas as ferramentas na fila. As notas e os anexos permanecem junto da conversa. Consulte README.md para o estado funcional e os limites do protótipo.

## Refinamento de operação e acesso

A revisão atual usa cards menores, três por linha em desktop, com faixas laranja/azul/vermelho e métricas em Detalhes. Setores são botões horizontais. O compositor usa ícones para anexos, emojis, microfone e envio; a caixa cresce com o texto. Atalhos expandem automaticamente e são editados somente em Templates. As janelas de anotações não fecham por clique ou arraste externo.

Perfis controlam os setores e recursos visíveis na demonstração, com André Saulo como administrador. O cadastro detecta telefones duplicados e atribui novos contatos ao criador. O visualizador inclui leitor PDF.js, áudio e explorador dos anexos do cliente. Recentes é limitado aos últimos 20 atendimentos do usuário; histórico continua por cliente. Logs guardam apenas eventos relevantes. README.md descreve o estado atual e os limites de autorização/envio reais.
