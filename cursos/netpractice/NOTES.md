# Notas do curso NetPractice

## O que o subject exige (en.subject.pdf, versão 6.3)

**Objetivo (cap. II, p. 3; cap. IV, p. 6).** Introdução prática a redes: configurar endereços IP, ligar máquinas por um roteador e entender o papel do gateway. Exige entender endereçamento TCP/IP, máscara de sub-rede e gateway padrão. São 10 níveis (10 exercícios) numa interface web simulada.

**Mecânica (cap. V, p. 7 a 12).** Extrair o pacote, rodar `run.sh` (servidor local; plano B: `python3 -m http.server 49242` e abrir `http://localhost:49242`). Digitar o login na aba Training. Cada nível mostra uma rede quebrada, objetivos no topo, os botões **Check again** e **Get my config**, e logs no rodapé que explicam a falha (gateway faltando, IP inválido). Só os campos sem sombreado são editáveis. Exportar a configuração antes de passar de nível.

**Entrega (cap. VII, p. 15).** 10 arquivos exportados com Get my config, um por nível, na raiz do repositório. O login precisa estar digitado na interface ("very important"). Conferir os nomes dos arquivos. Pelo código da interface, o arquivo sai como `levelN.json`.

**README (cap. VI, p. 13 e 14).** `README.md` na raiz, em inglês.
- Primeira linha em itálico: *This project has been created as part of the 42 curriculum by <login>*.
- **Description**: o projeto, o objetivo e uma visão geral.
- **Instructions**: como rodar a interface (run.sh), como exportar as configurações e os requisitos de entrega, dizendo explicitamente que os 10 arquivos exportados ficam na raiz.
- **Resources**: referências clássicas e a descrição do uso de IA (quais tarefas, quais partes). Precisa citar explicitamente os conceitos estudados: endereçamento TCP/IP, máscaras, gateway padrão, roteadores e switches, camadas OSI etc.

**Defesa (cap. VII, p. 15).** Resolver 3 níveis aleatórios com tempo limitado. Sem ferramentas externas; uma calculadora simples como `bc` é tolerada e é o limite. Pela interface (aba Evaluation): **3 níveis sorteados entre 6 e 10, em 15 minutos**, sem login (configuração aleatória).

**IA (cap. III, p. 4 e 5).** Usar IA para reduzir tarefas repetitivas; só usar conteúdo gerado que se entende por completo e pelo qual se pode responder; refletir antes de perguntar; checar, revisar, questionar e testar tudo; buscar revisão de colegas. Má prática citada: copiar algo que não se sabe explicar na avaliação.

**Relação com as regras do curso.** A regra de integridade do projeto (nunca dar a configuração final dos níveis oficiais, ajuda em escada até o passo 4) está alinhada ao cap. III. O modo defesa do curso treina sem calculadora, mais duro que o subject, que tolera `bc`.

## Mecânica da interface (lida em `js/sim.js` e `js/show.js` do pacote 1.9)

Vocabulário da tela, em inglês: *interface*, *IP*, *Mask*, *Routes* (destino `=>` next hop), *Goal*, *Check again*, *Get my config*, *host*, *router*, *switch*, *Internet*, logs *Forward way* e *Reverse way*.

Regras que o simulador aplica (e que as aulas precisam ensinar):
1. **IP de interface**: 4 octetos; primeiro octeto até 223 (classes D e E recusadas); `127.x.x.x` recusado (loopback); o endereço de rede e o broadcast da própria máscara são recusados.
2. **Máscara**: aceita `/n` ou decimal com pontos, com bits 1 contíguos. Consequência: /31 e /32 não deixam IP utilizável numa interface, então o menor enlace ponto a ponto é /30 (diferente da RFC 3021, que permite /31 em roteadores reais).
3. **Switch** não tem IP: repassa para todos os enlaces.
4. **Chegada**: o pacote só é aceito se o IP da interface de entrada for exatamente o alvo do salto (o destino final ou o next hop da rota). Log: *packet not for me*.
5. **Saída**: se o destino cabe na sub-rede de exatamente uma interface, sai direto por ela. Se cabe em duas, erro. Se não cabe em nenhuma, consulta a tabela de rotas **na ordem e usa só a primeira rota que casa**, não a mais específica (comentário no código: "routes are processed in order, first match only"). Isso difere de um roteador real, que usa *longest prefix match* (RFC 4632, seção 5.1). As aulas ensinam as duas coisas e marcam a diferença.
6. O next hop precisa estar na sub-rede de uma interface da própria máquina.
7. `default` equivale a `0.0.0.0/0`.
8. **Internet**: recusa rota default nela e descarta destino privado (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, RFC 1918).
9. Cada objetivo exige **ida e volta** (*Forward way* e *Reverse way*).
10. O conteúdo do pacote tem licença que proíbe duplicação: nada dele (imagens, código, dados de nível) entra neste repositório. O `assets/netsim.js` é implementação própria dessas regras.

## Preferências de ensino
- Português do Brasil; termos da interface em inglês.
- Posições argumentadas, sem bajulação, sem travessão em nenhum texto.
- Avanço tópico a tópico; só sigo quando a aula atual está dominada (paradas acertadas de primeira).

## Voz
- Voz escolhida: _pendente (amostras em `amostras/`)_.
- Rate: `+0%`.
- Rede: o edge-tts precisa do CA do proxy (o `scripts/tts.py` lê `SSL_CERT_FILE`). Testado em 2026-11-24: funciona com tempo por palavra (WordBoundary).
