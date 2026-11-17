# PataCerta — Recomendador Inteligente de Cães

Sistema inteligente que recomenda a raça de cão mais adequada para adoção/compra com base no perfil comportamental e na rotina do usuário.

- **Disciplina:** Inteligência Artificial (Faculdade)
- **Tema:** usar IA para recomendar a escolha de um cachorro com base no comportamento/perfil do tutor
- **Restrição do trabalho:** a IA **não pode vir pré-treinada**; o modelo precisa ser criado e treinado por nós, a partir de dados disponíveis na internet.

---

## 1. Escopo da entrega

A entrega final é um sistema inteligente composto por três módulos:

| Módulo | Função | Situação |
|---|---|---|
| Interface com o usuário | Coletar o perfil e exibir a recomendação | ✅ Pronto (1ª entrega) |
| IA | Modelo treinado que calcula a compatibilidade perfil × raça | ✅ Pronto, com ressalvas sobre os dados (ver seção 5) |
| Resposta | Apresentar a recomendação e levar o usuário à ação (adoção/compra) | 🟡 Parcial: card de resultado pronto, ações ainda simuladas |

**1ª entrega (prazo: 07h do dia seguinte ao início do projeto):** frontend + módulo de inteligência.

---

## 2. Estrutura de arquivos

```
PataCerta/
├── index.html                                          # Interface (Tailwind via CDN + JS puro)
├── dados/
│   ├── racas.js                # Base de 30 raças (window.RACAS) — GERADO, não editar à mão
│   ├── preparar_dataset.js     # Gera racas.js a partir dos datasets do AKC (node dados/preparar_dataset.js)
│   └── fontes/
│       ├── akcdata_tmfilho.csv         # Dataset AKC (277 raças): peso, altura, energia, treinabilidade, escovação
│       ├── breed_traits_kkakey.csv     # Dataset AKC (194 raças): notas 1–5, ex.: "Good With Young Children"
│       └── catalogo.json               # Curadoria nossa: nomes PT-BR, mapeamento de nomes, ilustração e texto
├── ia/
│   └── modelo.js       # Módulo de IA: geração de dados, rede neural, treino, avaliação, inferência (window.PataIA)
└── PROJETO.md          # Este documento
```

Para executar: abrir o arquivo HTML no navegador (duplo clique). Não precisa de servidor nem de instalação, mas as pastas `dados/` e `ia/` devem ficar ao lado do HTML, pois são carregadas por caminho relativo.

---

## 3. O que já está pronto

### 3.1 Interface (Módulo de Interface com o Usuário)

Página única, responsiva e acessível (foco visível, `aria-live`, link "ir para o conteúdo", respeito a `prefers-reduced-motion`), com paleta em azul, verde e laranja pastel.

1. **Hero:** título e explicação de que a IA analisa o perfil do usuário.
2. **Painel do Módulo de IA:** status do treino, métricas e curva de erro (seção 3.3).
3. **Formulário de perfil comportamental** (6 campos obrigatórios, com barra de progresso e validação):
   - Nível de atividade física: Sedentário / Moderado / Muito ativo
   - Tipo de moradia: apartamento pequeno / apartamento grande / casa sem quintal / casa com quintal grande
   - Tempo diário para o cão: menos de 1h / 1 a 3h / mais de 3h
   - Experiência prévia: nenhuma / tive na infância / tenho ou tive recentemente / especialista
   - Contato com visitas e outros cães: raramente / às vezes / frequentemente
   - Convívio com crianças pequenas ou outros animais: sim / não
4. **Estado de processamento:** animação de carregamento com etapas, por pelo menos 2 s, ou até o treino terminar caso ainda esteja em andamento.
5. **Resultado:** card com raça recomendada, ilustração SVG, % de compatibilidade, justificativa dinâmica, lista de pontos positivos e de atenção, as 2 raças alternativas e botão "Refazer o teste".
6. **Botões de ação** "Buscar para Adoção" e "Buscar Criadores" (ainda só exibem uma mensagem, ver próximos passos).

### 3.2 Base de dados de raças (`dados/racas.js`)

30 raças (Galgo, Shih Tzu, Pug, Bulldog Francês, Cavalier King Charles, Poodle, Vira-lata Caramelo, Beagle, Labrador, Golden Retriever, Pastor Alemão, Border Collie, Husky Siberiano, Yorkshire, Maltês, Bichon Frisé, Dachshund, Schnauzer Miniatura, Lulu da Pomerânia, Cocker Spaniel, Jack Russell, Boxer, Rottweiler, Dálmata, Chihuahua, Lhasa Apso, Pinscher Miniatura, Corgi Pembroke, Doberman, Akita).

**Fontes (dados públicos do American Kennel Club):**

- [tmfilho/akcdata](https://github.com/tmfilho/akcdata) (licença MIT): 277 raças extraídas do site do AKC, com altura, peso, energia, treinabilidade e frequência de escovação (escala 0–1).
- [kkakey/dog_traits_AKC](https://github.com/kkakey/dog_traits_AKC): notas de 1 a 5 do AKC por raça. Usamos "Good With Young Children" e "Mental Stimulation Needs". O repositório não declara licença.

O script `dados/preparar_dataset.js` cruza as duas fontes e converte os dados nas variáveis do modelo por regras explícitas (documentadas no topo do script). Para regenerar: `node dados/preparar_dataset.js`.

| Campo | Escala | Origem |
|---|---|---|
| `energy` | 1–3 | `energy_level_value` (≤0,4 → 1; 0,6 → 2; ≥0,8 → 3) |
| `space` | 1–4 | regra de peso (<10 kg → 1; <22 → 2; <35 → 3; ≥35 → 4; +1 se energia = 3). Nas raças com dado kkakey, média com a regra de "Adaptability Level" (5 → 1; 4 → 2; 3 → 3; ≤2 → 4) |
| `social` | 1–3 | média de "Openness To Strangers" e "Good With Other Dogs" (≥4 → 3; ≥3 → 2; senão 1). Pastor Alemão e Husky (ausentes do kkakey) e Vira-lata: estimativa nossa |
| `time` | 1–3 | energia, +1 se a raça pede escovação diária |
| `exp` | 1–4 | `trainability_value` (quanto menos treinável, maior a experiência exigida), +1 se "Mental Stimulation Needs" = 5 |
| `kids` | boolean | "Good With Young Children" ≥ 4 (raças ausentes do kkakey: estimativa nossa) |
| `why`, `fur`, `dark`, `light`, `bg`, `ear` | texto/cores | curadoria nossa (justificativa e ilustração SVG) |

Exceção: o **Vira-lata Caramelo** não existe no AKC e usa valores estimados por nós. O Pastor Alemão e o Husky não constam no kkakey, então o campo `kids` deles é estimativa nossa.

### 3.3 Módulo de IA (`ia/modelo.js`)

**Tarefa:** dado um par (perfil do tutor, características da raça), prever a compatibilidade entre 0 e 1. Para recomendar, o modelo avalia todas as raças e ordena pela compatibilidade prevista.

**Pipeline:**

1. **Geração de perfis sintéticos:** 500 de treino + 120 de validação, com sorteio aleatório e semente fixa (42), portanto reprodutível.
2. **Rótulos ("professor"):** regras de especialista calculam a compatibilidade de cada par, com ruído gaussiano de 3 pontos. As regras penalizam descompasso de moradia, energia, tempo, experiência e convívio com crianças. **O modelo não recebe essas regras**, só vê pares entrada → rótulo e precisa aprendê-las.
3. **Vetorização:** 17 entradas, sendo 6 do perfil, 6 da raça e 5 diferenças (raça − perfil), todas normalizadas.
4. **Rede neural (MLP) escrita do zero, sem bibliotecas:** arquitetura 17 → 24 → 12 → 1, ativação tanh nas camadas ocultas e sigmoide na saída, 745 parâmetros. Treinada com backpropagation e otimizador Adam (lr 0,01), minibatches de 64, 18 épocas e perda MSE. O treino roda em fatias para não travar a interface.
5. **Validação por perfil:** a divisão treino/validação é feita por perfil de tutor, não por par, então a validação usa perfis que o modelo nunca viu.
6. **Inferência e explicação:** o score exibido é a saída da rede (limitada a 45–98%). As justificativas vêm das diferenças entre perfil e raça (explicabilidade simples).

**Resultados medidos (execução em Node):**

| Métrica | Valor |
|---|---|
| Amostras de treino / validação | 15.000 / 3.600 |
| Erro médio absoluto na validação | 1,5 pontos de % |
| Raça nº 1 do modelo = raça nº 1 do especialista | 88% |
| Raça nº 1 do modelo dentro do top-3 do especialista | 99% |
| Tempo de treino | ~6 s (inclui os baselines) |

*(Métricas medidas com a base de 30 raças derivada do AKC. Podem variar um pouco entre execuções do navegador e do Node.)*

**Comparação com baselines** (mesmos perfis de validação, mostrada no painel da página):

| Método | Erro médio | Top-1 | Top-3 |
|---|---|---|---|
| **Rede neural (nosso modelo)** | **1,5 pts** | **88%** | **99%** |
| Modelo linear (sem camadas ocultas) | 9,2 pts | 12% | 48% |
| Sempre as mesmas raças (média geral) | 13,4 pts | 12% | 48% |
| Ranking aleatório | 31,4 pts | 4% | 10% |

O ganho sobre o modelo linear mostra que a rede aprendeu interações não lineares entre perfil e raça, e não só uma média. Uma ressalva: todos os métodos são medidos contra o mesmo professor sintético (seção 5). O top-1 mede só a raça nº 1; o top-3 é mais tolerante a empates de score entre raças parecidas. A curva de erro de treino e validação cai juntas, sem sinal de overfitting. Os resultados qualitativos fazem sentido: perfil sedentário em apartamento pequeno recebe Cavalier King Charles; perfil muito ativo, experiente, com quintal grande e vida social intensa recebe Husky, Corgi e Labrador.

---

## 4. Como o sistema funciona (fluxo)

```
Página abre ──► PataIA.iniciar(): gera dados → treina a rede → calcula métricas ──► painel mostra o status
Usuário preenche o formulário ──► envia
        └─► tela de carregamento (espera o fim do treino + mínimo de 2 s)
              └─► PataIA.recomendar(perfil): pontua as 24 raças e ordena
                    └─► card de resultado (raça, %, justificativa, pontos positivos e de atenção, alternativas)
```

---

## 5. Limitações conhecidas (precisam constar no relatório)

1. **Rótulos sintéticos.** Não existe dataset público de "perfil de tutor → raça ideal". Os rótulos vêm de regras de especialista com ruído. Descrever como *aprendizado supervisionado com dados sintéticos gerados a partir de conhecimento de domínio*. Não há dado real de satisfação de tutores.
2. **As características das raças vêm do AKC, mas passam por conversão nossa.** Energia, treinabilidade, peso e "bom com crianças" são dados do AKC (notas editoriais, não medições). As variáveis `space`, `time` e `exp` são derivadas por regras nossas e o Vira-lata Caramelo é estimado. Isso gera resultados que podem surpreender: por exemplo, o Galgo sai com energia 3 e espaço 4 pelo critério de peso e energia do AKC, embora seja conhecido como calmo dentro de casa. O AKC é um padrão americano, e o contexto de raças no Brasil pode diferir.
3. **Dependência das regras.** O modelo aproxima o professor. Se as regras tiverem vieses, o modelo os herda.
4. **Treino a cada abertura da página.** Os pesos não são salvos; o modelo é retreinado a cada carregamento (~3 s). É determinístico por causa da semente.
5. **Botões "Buscar para Adoção/Criadores"** ainda não consultam nenhuma fonte real.
6. **Ilustrações** são SVG genéricos, não fotos reais das raças.
7. **Teste da interface:** o fluxo completo (validação, 3 perfis, resultado, "refazer") foi simulado automaticamente no Edge, sem erros de JavaScript, e a largura de 390 px não tem rolagem horizontal. Ainda não foi testado em celular físico nem em outros navegadores, nem com leitor de tela.

---

## 6. Próximos passos

### Prioridade alta (antes de entregar a 1ª parte)

- [x] ~~Testar a página no navegador~~ — fluxo simulado no Edge (headless) sem erros; falta uma passada manual rápida em celular real, se houver tempo.
- [x] ~~Substituir `racas.js` por um dataset aberto~~ — feito com os datasets do AKC (seção 3.2).
- [ ] **Revisar as regras de conversão** em `dados/preparar_dataset.js` (ex.: Pastor Alemão e Husky, que não constam no kkakey) e decidir se algum ajuste manual é justificável. Citar licença/fonte no relatório (o kkakey não declara licença).
- [ ] **Escrever o relatório da 1ª entrega:** problema, justificativa, arquitetura (3 módulos), descrição dos dados, modelo, métricas, limitações. Usar as seções 3 a 5 deste documento como base.
- [ ] **Prints/evidências:** tela inicial, painel de treino com a curva de erro, formulário, resultado.

### Prioridade média (evolução do modelo)

- [x] ~~Comparar com baselines~~ — feito (aleatório, média geral e modelo linear). Falta, se houver tempo, incluir k-vizinhos.
- [ ] **Ajustar hiperparâmetros** (neurônios, épocas, lr) e registrar a escolha.
- [ ] **Ampliar atributos:** pelagem/queda de pelo, ruído/latido, tolerância a ficar sozinho, alergias, porte, expectativa de vida.
- [ ] **Salvar os pesos treinados** em arquivo (JSON) para não retreinar a cada abertura, mantendo o botão/rotina de re-treino para demonstrar o treinamento.
- [ ] **Coletar feedback real:** adicionar "Essa recomendação foi útil?" e guardar as respostas para rotulagem real no futuro.

### Entrega final (Módulo de Resposta e integração)

- [ ] **Módulo de Resposta completo:** ações reais para "Buscar para Adoção" (links para busca de ONGs/abrigos da raça ou mistura, por região) e "Buscar Criadores" (criadores registrados, com aviso de compra responsável).
- [ ] **Separar o módulo de IA em backend** (opcional): por exemplo, API em Python (Flask/FastAPI) com o treino em scikit-learn ou PyTorch, e `fetch('/api/recomendar')` na interface. O ponto de troca já está isolado em `PataIA.recomendar()`.
- [ ] **Fotos reais das raças** (com licença livre) no lugar das ilustrações SVG.
- [ ] **Explicabilidade melhor:** mostrar quais fatores mais pesaram no score.
- [ ] **Apresentação/demo** com 2 ou 3 perfis de exemplo contrastantes.

---

## 7. Perguntas em aberto

- A 1ª entrega exige que o treino seja feito em uma linguagem/biblioteca específica (ex.: Python)? Se sim, portar `ia/modelo.js` para esse formato.
- O professor aceita dados sintéticos rotulados por regras, ou exige dataset real rotulado? Isso define o peso da seção 5.
- Haverá apresentação/demonstração ao vivo? A página roda offline, mas o Tailwind e a fonte vêm de CDN, então é preciso internet ou uma versão local deles.

---

## 8. Decisões de projeto

- **Custo mensal removido.** O campo de orçamento foi retirado do formulário, do modelo e da base de raças. Nenhum dataset público traz custo mensal por raça, então ele dependia de uma estimativa nossa sem fonte. Com isso (e com a pergunta de sociabilidade adicionada depois), o formulário tem 6 perguntas e o modelo usa 17 entradas.
- **Temperamento em vez de "agressividade".** Não criamos uma métrica de agressividade por raça (estereótipo, e os dados de mordida não têm denominador). Usamos a sociabilidade da raça (notas do AKC "Openness To Strangers" e "Good With Other Dogs") contra a vida social do usuário (visitas e contato com outros cães). O resultado aparece como ponto de atenção no card, e não como rótulo de perigo.
- **Moradia via adaptabilidade.** A variável `space` passou a combinar a regra de peso com a nota "Adaptability Level" do AKC, o que corrigiu casos como o do Galgo (espaço 4 → 3). A nota mede tolerância a mudanças de rotina, não apartamento especificamente, por isso a combinamos com o peso em vez de substituí-lo.
- **Próxima validação: tutores reais.** Para sair da validação circular (seção 5), a ideia é um formulário com 30 a 50 tutores (perfil, raça que têm, satisfação de 1 a 5) e um botão "a recomendação foi útil?" na página.
