# Recursos

## Conhecimento

- Material do projeto: NetPractice subject v6.3, 42 (arquivo `en.subject.pdf` nos arquivos do projeto)
  Regras, entrega, README, defesa e regras de IA. Usar para: qualquer dúvida sobre o que é exigido. Fonte primária; vence qualquer outra.
- [RFC 791: Internet Protocol](https://www.rfc-editor.org/rfc/rfc791)
  Define o datagrama IPv4 e o endereço de 32 bits (seção 2.3 e 3.2). Usar para: o que é um endereço IP e como ele se divide.
- [RFC 950: Internet Standard Subnetting Procedure](https://www.rfc-editor.org/rfc/rfc950)
  Introduz a máscara de sub-rede e os endereços "todos zeros" e "todos uns" da parte de host. Usar para: máscara, rede e broadcast.
- [RFC 4632: Classless Inter-domain Routing (CIDR)](https://www.rfc-editor.org/rfc/rfc4632)
  Notação de prefixo `/n` (seção 3.1) e escolha da rota mais específica (seção 5.1). Usar para: CIDR, agregação e longest prefix match.
- [RFC 1918: Address Allocation for Private Internets](https://www.rfc-editor.org/rfc/rfc1918)
  Os três blocos privados e por que não são roteados na Internet. Usar para: níveis com Internet.
- [RFC 1122: Requirements for Internet Hosts](https://www.rfc-editor.org/rfc/rfc1122)
  Seção 3.2.1.3: endereços especiais (0, 127, broadcast) que um host não pode usar. Usar para: por que alguns IPs são recusados.
- [RFC 6890: Special-Purpose IP Address Registries](https://www.rfc-editor.org/rfc/rfc6890)
  Tabela consolidada de blocos reservados. Usar para: consulta rápida de faixas especiais.
- [Cisco: Configure IP Addresses and Unique Subnets for New Users](https://www.cisco.com/c/en/us/support/docs/ip/routing-information-protocol-rip/13788-3.html)
  Tutorial do fabricante com exemplos de sub-rede e máscara. Usar para: segunda explicação, com outros exemplos, de máscara e divisão de blocos.
- [Livro: Computer Networking: A Top-Down Approach, Kurose e Ross](https://gaia.cs.umass.edu/kurose_ross/index.php)
  Capítulo da camada de rede: endereçamento IPv4, sub-redes, encaminhamento. Usar para: visão de conjunto e a diferença entre encaminhamento e roteamento.

## Sabedoria (Comunidades)
- Colegas da 42 SP (cluster, Slack do campus, avaliações em par)
  O subject (cap. III) pede revisão por colegas. Usar para: explicar uma solução em voz alta e comparar raciocínios antes da defesa.

## Lacunas
- Nenhuma fonte oficial descreve a regra de "primeira rota que casa" da interface; ela foi lida no código do pacote 1.9 (ver NOTES.md).
