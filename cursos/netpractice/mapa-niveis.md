# Mapa dos níveis oficiais

Para cada nível: o que aparece na topologia e quais aulas ele exige. Sem respostas e sem os números dos níveis (eles variam com o login).

Aulas (numeração do mapa do curso):
1. Binário e IPv4 · 2. Máscara e CIDR · 3. Rede, broadcast, faixa e número de hosts · 4. Mesma sub-rede ou não · 5. Endereços especiais e reservados · 6. Switch e roteador · 7. Gateway e rota padrão · 8. Tabela de rotas · 9. Ida e volta · 10. Internet · 11. Sub-redes que não se sobrepõem · 12. Método de diagnóstico

| Nível | O que aparece | O que você edita | Aulas necessárias | Cai na defesa? |
|---|---|---|---|---|
| 1 | dois pares de hosts, cada par ligado direto | IPs | 1, 2, 3, 4 | não |
| 2 | dois pares de hosts ligados direto | IPs e uma máscara | 1 a 5 | não |
| 3 | três hosts num switch | IPs e máscaras | 1 a 4, 6 | não |
| 4 | hosts, um switch e um roteador sem rotas | IPs e máscaras | 1 a 6, 11 | não |
| 5 | dois hosts em lados opostos de um roteador | IPs, máscaras e rotas | 1 a 9 | não |
| 6 | host, switch, roteador e Internet | IP, máscara e rotas | 1 a 10 | sim |
| 7 | dois hosts e dois roteadores em série | IPs, máscaras e rotas | 1 a 9, 11 | sim |
| 8 | dois hosts, dois roteadores e Internet | IPs, máscaras e rotas | 1 a 11 | sim |
| 9 | quatro hosts, switch, dois roteadores e Internet | quase tudo | 1 a 12 | sim |
| 10 | quatro hosts, switch, dois roteadores e Internet, muitos objetivos | poucos campos, muito diagnóstico | 1 a 12 | sim |

A defesa sorteia 3 níveis entre 6 e 10 (aba Evaluation da interface), com 15 minutos no total. Por isso as aulas 7 a 12 são o centro do curso, e as aulas 1 a 5 precisam virar cálculo de cabeça rápido.

## Níveis resolvidos sozinho
_(registrar aqui só com evidência: nível, data, tempo, se precisou de ajuda)_
