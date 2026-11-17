# 🐾 PataCerta — Recomendador Inteligente de Cães

Sistema inteligente que recomenda a raça de cão mais compatível com o perfil e a rotina do usuário, para adoção ou compra. A IA é uma rede neural **treinada do zero** (sem pesos pré-treinados) a cada abertura da página.

Projeto da disciplina de Inteligência Artificial — protótipo da 1ª entrega (interface + módulo de inteligência).

## Equipe

- Bruno Diniz
- Mozart Mendes

## Como executar

1. Baixe ou clone a pasta inteira (o HTML carrega os scripts de `dados/` e `ia/` por caminho relativo).
2. Abra o arquivo `index.html` no navegador (Chrome, Edge ou Firefox).
3. Aguarde alguns segundos: o painel "🧠 Módulo de IA" mostra o treino e, ao terminar, as métricas.
4. Responda ao formulário e clique em **Descobrir minha raça ideal**.

É preciso estar online na primeira abertura: o Tailwind CSS e a fonte Nunito vêm de CDN. A IA em si não precisa de internet nem de servidor.

Para regenerar a base de raças (opcional, requer Node 16+): `node dados/preparar_dataset.js`

## Arquitetura

O sistema tem três módulos, separados por responsabilidade:

| Módulo | Arquivo | O que faz |
|---|---|---|
| Interface com o usuário | `index.html` | Formulário, tela de processamento e card de resultado |
| IA | `ia/modelo.js` | Gera dados, treina a rede neural, avalia e recomenda |
| Resposta | card de resultado no HTML | Raça, % de compatibilidade, justificativa, pontos de atenção e alternativas |

A interface só conhece `PataIA.recomendar(perfil)`. Esse é o contrato com o módulo de IA, e o mesmo código roda no Node, o que permite expô-lo via API sem alterar o modelo.

```
PataCerta/
├── index.html
├── ia/modelo.js                 # Módulo de IA (window.PataIA)
├── dados/
│   ├── racas.js                 # Base de 30 raças (gerado)
│   ├── preparar_dataset.js      # Gera racas.js a partir dos CSVs do AKC
│   └── fontes/                  # CSVs de origem + catálogo (nomes PT-BR, ilustrações, textos)
├── PROJETO.md                   # Documentação detalhada e próximos passos
└── README.md
```

## Como a IA funciona

- **Tarefa:** dado um perfil de tutor e uma raça, prever a compatibilidade (0 a 1). Para recomendar, o modelo pontua todas as raças e ordena.
- **Modelo:** rede neural MLP 17 → 24 → 12 → 1 (tanh nas camadas ocultas, sigmoide na saída), 745 parâmetros, escrita em JavaScript puro, com backpropagation e otimizador Adam.
- **Entradas (17):** 6 do perfil (atividade, moradia, tempo, experiência, vida social, crianças/pets), 6 da raça e 5 diferenças entre raça e perfil.
- **Dados de treino:** 500 perfis sintéticos de tutores (semente fixa) cruzados com as 30 raças, 15.000 pares. A validação usa 120 perfis que o modelo nunca viu.
- **Rótulos:** uma função de "especialista" (regras de domínio com ruído) dá a nota de cada par. O modelo não recebe as regras, só aprende com os pares.
- **Explicação:** os pontos positivos e de atenção do card vêm das diferenças entre perfil e raça.

### Resultados (perfis de validação)

| Método | Erro médio | Top-1 | Top-3 |
|---|---|---|---|
| **Rede neural (nosso modelo)** | **1,5 pts** | **88%** | **99%** |
| Modelo linear (sem camadas ocultas) | 9,2 pts | 12% | 48% |
| Sempre as mesmas raças (média geral) | 13,4 pts | 12% | 48% |
| Ranking aleatório | 31,4 pts | 4% | 10% |

Top-1 e Top-3: a raça nº 1 do modelo coincide com a nº 1 (ou está entre as 3 melhores) do especialista.

## Dados

As características das raças vêm de dados públicos do American Kennel Club (AKC):

- [tmfilho/akcdata](https://github.com/tmfilho/akcdata) (licença MIT): altura, peso, energia, treinabilidade e frequência de escovação.
- [kkakey/dog_traits_AKC](https://github.com/kkakey/dog_traits_AKC): notas de 1 a 5 do AKC (convivência com crianças, adaptabilidade, abertura a estranhos, convivência com outros cães, estímulo mental). O repositório não declara licença.

As variáveis do modelo (energia, espaço, tempo, experiência, sociabilidade) são derivadas desses dados por regras explícitas, documentadas no topo de `dados/preparar_dataset.js`.

## Limitações

- **Rótulos sintéticos:** não existe dataset público de "perfil de tutor → raça ideal". As métricas medem a concordância com as regras de especialista, não a satisfação real de tutores. A validação com tutores reais é o próximo passo.
- **Dados do AKC:** são notas editoriais, não medições, e refletem o contexto americano. O Vira-lata Caramelo não existe no AKC e tem valores estimados; o Pastor Alemão e o Husky tiveram a sociabilidade e a convivência com crianças estimadas.
- **Sem agressividade por raça:** usamos sociabilidade (abertura a estranhos e a outros cães) em vez de rotular raças como agressivas, porque o comportamento depende muito de socialização e criação.
- **Treino a cada abertura:** os pesos não são salvos (cerca de 6 s). É determinístico por causa da semente.
- **Botões "Buscar para Adoção/Criadores"** ainda não consultam fontes reais.

> Adotar é um ato de amor: considere sempre abrigos e ONGs primeiro. A recomendação é uma orientação e não substitui a avaliação de um profissional.

Mais detalhes, decisões de projeto e próximos passos estão em [PROJETO.md](PROJETO.md).
