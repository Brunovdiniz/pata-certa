/* PataCerta — Módulo de IA
   Rede neural (MLP) treinada do zero no navegador, sem pesos pré-treinados.

   Tarefa: dado (perfil do tutor, características da raça) -> compatibilidade entre 0 e 1.
   Para recomendar, o modelo avalia todas as raças e ordena pela compatibilidade prevista.

   Pipeline:
     1. gerarPerfis()      perfis sintéticos de tutores (aleatórios, semente fixa = reprodutível)
     2. rotular()          "professor": conhecimento de especialista que dá o rótulo de compatibilidade (+ ruído)
     3. montarAmostras()   cruza perfil x raça, vetoriza e separa treino/validação POR PERFIL
     4. Rede.treinar()     backpropagation + Adam, minibatches
     5. avaliar()          MAE (pontos de %), e acerto top-1 / top-3 contra o professor em perfis nunca vistos
     6. recomendar()       inferência usada pela interface

   Depende de window.RACAS (dados/racas.js). Expõe window.PataIA. */
(function (global) {
  'use strict';

  var CFG = {
    semente: 42,
    perfisTreino: 500,
    perfisValidacao: 120,
    ruido: 0.03,          // desvio do ruído gaussiano nos rótulos (3 pontos de %)
    camadas: [17, 24, 12, 1],
    epocas: 18,
    lote: 64,
    lr: 0.01
  };

  /* ---------- Utilidades ---------- */
  function rng(seed) { // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rand) {
    var u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

  var HOUSING_LABEL = { 1: 'apartamento pequeno', 2: 'apartamento grande', 3: 'casa sem quintal', 4: 'casa com quintal grande' };
  var ACTIVITY_LABEL = { 1: 'sedentário', 2: 'moderado', 3: 'muito ativo' };
  var TIME_LABEL = { 1: 'menos de 1h por dia', 2: '1 a 3h por dia', 3: 'mais de 3h por dia' };
  var SOCIAL_LABEL = { 1: 'poucas visitas e pouco contato com outros cães', 2: 'visitas ocasionais e contato com outros cães às vezes', 3: 'muitas visitas e muito contato com outros cães' };
  var EXP_LABEL = { 1: 'nenhuma experiência', 2: 'experiência da infância', 3: 'experiência recente', 4: 'perfil de especialista' };

  /* ---------- 1. Perfis sintéticos ---------- */
  function gerarPerfis(n, rand) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({
        activity: 1 + Math.floor(rand() * 3),
        housing: 1 + Math.floor(rand() * 4),
        time: 1 + Math.floor(rand() * 3),
        experience: 1 + Math.floor(rand() * 4),
        social: 1 + Math.floor(rand() * 3),
        kids: rand() < 0.5 ? 'sim' : 'nao'
      });
    }
    return out;
  }

  /* ---------- 2. Professor (rótulo de compatibilidade) ----------
     Regras de especialista: cada descompasso entre perfil e raça gera uma penalidade.
     O modelo NÃO recebe estas regras — só vê pares (entrada, rótulo) e precisa aprendê-las. */
  function lacunas(p, b) {
    return {
      moradia: b.space - p.housing,
      energia: b.energy - p.activity,
      tempo: b.time - p.time,
      experiencia: b.exp - p.experience,
      sociabilidade: p.social - b.social // >0: o usuário precisa de um cão mais sociável do que a raça costuma ser
    };
  }

  function rotular(p, b) {
    var g = lacunas(p, b), pen = 0;
    pen += g.moradia > 0 ? g.moradia * 14 : -g.moradia * 2;
    pen += g.energia > 0 ? g.energia * 20 : -g.energia * 8;
    pen += g.tempo > 0 ? g.tempo * 16 : -g.tempo * 3;
    pen += g.experiencia > 0 ? g.experiencia * 10 : -g.experiencia * 3;
    if (g.sociabilidade > 0) pen += g.sociabilidade * 12;
    if (p.kids === 'sim') pen += b.kids ? -3 : 14;
    return clamp((100 - pen * 0.9) / 100, 0, 1);
  }

  /* ---------- 3. Vetorização ----------
     6 do perfil + 6 da raça + 5 diferenças (raça - perfil) = 17 entradas, todas em ~[0,1]/[-1,1]. */
  function vetorizar(p, b) {
    var a = (p.activity - 1) / 2, h = (p.housing - 1) / 3, t = (p.time - 1) / 2, e = (p.experience - 1) / 3;
    var s = (p.social - 1) / 2, k = p.kids === 'sim' ? 1 : 0;
    var be = (b.energy - 1) / 2, bs = (b.space - 1) / 3, bt = (b.time - 1) / 2, bx = (b.exp - 1) / 3;
    var bo = (b.social - 1) / 2, bk = b.kids ? 1 : 0;
    return [a, h, t, e, s, k,
            be, bs, bt, bx, bo, bk,
            be - a, bs - h, bt - t, bx - e, bo - s];
  }

  function montarAmostras(perfis, racas, rand) {
    var X = [], Y = [];
    perfis.forEach(function (p) {
      racas.forEach(function (b) {
        X.push(vetorizar(p, b));
        Y.push(clamp(rotular(p, b) + gauss(rand) * CFG.ruido, 0, 1));
      });
    });
    return { X: X, Y: Y };
  }

  /* ---------- 4. Rede neural ---------- */
  function Rede(camadas, rand) {
    this.n = camadas;
    this.W = []; this.b = [];
    this.mW = []; this.vW = []; this.mb = []; this.vb = [];
    this.passo = 0;
    for (var l = 0; l < camadas.length - 1; l++) {
      var nin = camadas[l], nout = camadas[l + 1], lim = Math.sqrt(6 / (nin + nout));
      var w = new Float64Array(nin * nout);
      for (var i = 0; i < w.length; i++) w[i] = (rand() * 2 - 1) * lim;
      this.W.push(w);
      this.b.push(new Float64Array(nout));
      this.mW.push(new Float64Array(w.length)); this.vW.push(new Float64Array(w.length));
      this.mb.push(new Float64Array(nout)); this.vb.push(new Float64Array(nout));
    }
  }

  // tanh nas camadas ocultas, sigmoide na saída. cache guarda as ativações para o backprop.
  Rede.prototype.prever = function (x, cache) {
    var a = x, L = this.n.length - 1;
    if (cache) cache[0] = a;
    for (var l = 0; l < L; l++) {
      var nin = this.n[l], nout = this.n[l + 1], W = this.W[l], z = new Float64Array(nout);
      for (var j = 0; j < nout; j++) {
        var s = this.b[l][j], off = j * nin;
        for (var i = 0; i < nin; i++) s += W[off + i] * a[i];
        z[j] = l === L - 1 ? 1 / (1 + Math.exp(-s)) : Math.tanh(s);
      }
      a = z;
      if (cache) cache[l + 1] = a;
    }
    return a[0];
  };

  // Um passo de Adam sobre um minibatch (perda = erro quadrático médio). Retorna a perda do lote.
  Rede.prototype.passoLote = function (X, Y, idx, lr) {
    var L = this.n.length - 1, gW = [], gb = [], l, perda = 0;
    for (l = 0; l < L; l++) { gW.push(new Float64Array(this.W[l].length)); gb.push(new Float64Array(this.b[l].length)); }

    for (var s = 0; s < idx.length; s++) {
      var cache = [], y = this.prever(X[idx[s]], cache), erro = y - Y[idx[s]];
      perda += erro * erro;
      var delta = new Float64Array([2 * erro * y * (1 - y)]);
      for (l = L - 1; l >= 0; l--) {
        var nin = this.n[l], nout = this.n[l + 1], aprev = cache[l], W = this.W[l];
        for (var j = 0; j < nout; j++) {
          gb[l][j] += delta[j];
          var off = j * nin;
          for (var i = 0; i < nin; i++) gW[l][off + i] += delta[j] * aprev[i];
        }
        if (l > 0) {
          var nd = new Float64Array(nin);
          for (var i2 = 0; i2 < nin; i2++) {
            var acc = 0;
            for (var j2 = 0; j2 < nout; j2++) acc += W[j2 * nin + i2] * delta[j2];
            nd[i2] = acc * (1 - aprev[i2] * aprev[i2]);
          }
          delta = nd;
        }
      }
    }

    var B1 = 0.9, B2 = 0.999, EPS = 1e-8, n = idx.length;
    this.passo++;
    var c1 = 1 - Math.pow(B1, this.passo), c2 = 1 - Math.pow(B2, this.passo);
    for (l = 0; l < L; l++) {
      this._adam(this.W[l], gW[l], this.mW[l], this.vW[l], n, lr, B1, B2, EPS, c1, c2);
      this._adam(this.b[l], gb[l], this.mb[l], this.vb[l], n, lr, B1, B2, EPS, c1, c2);
    }
    return perda / n;
  };

  Rede.prototype._adam = function (p, g, m, v, n, lr, B1, B2, EPS, c1, c2) {
    for (var i = 0; i < p.length; i++) {
      var gi = g[i] / n;
      m[i] = B1 * m[i] + (1 - B1) * gi;
      v[i] = B2 * v[i] + (1 - B2) * gi * gi;
      p[i] -= lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + EPS);
    }
  };

  /* ---------- 5. Avaliação ---------- */
  function mse(rede, ds) {
    var s = 0;
    for (var i = 0; i < ds.X.length; i++) { var e = rede.prever(ds.X[i]) - ds.Y[i]; s += e * e; }
    return s / ds.X.length;
  }

  // Em perfis de validação (nunca vistos): erro médio em pontos de % e concordância do ranking com o professor.
  // `prever(p, b, i)` devolve a nota prevista (0-1) do perfil p para a raça b (índice i).
  function avaliar(prever, perfis, racas) {
    var erro = 0, cont = 0, top1 = 0, top3 = 0;
    perfis.forEach(function (p) {
      var prev = [], ref = [];
      racas.forEach(function (b, i) {
        var yp = prever(p, b, i), yr = rotular(p, b);
        erro += Math.abs(yp - yr); cont++;
        prev.push({ i: i, v: yp }); ref.push({ i: i, v: yr });
      });
      prev.sort(function (a, b) { return b.v - a.v; });
      ref.sort(function (a, b) { return b.v - a.v; });
      if (prev[0].i === ref[0].i) top1++;
      // top-3: a raça nº1 do modelo está entre as 3 melhores do professor? (empates não penalizam)
      var best3 = ref.slice(0, 3).map(function (r) { return r.i; });
      if (best3.indexOf(prev[0].i) >= 0 || ref[0].v - ref.filter(function (r) { return r.i === prev[0].i; })[0].v < 0.02) top3++;
    });
    return {
      maePontos: (erro / cont) * 100,
      top1: top1 / perfis.length,
      top3: top3 / perfis.length
    };
  }

  /* ---------- Treino (em fatias, para não travar a interface) ---------- */
  var estado = { rede: null, metricas: null, curva: [] };

  // Treina uma rede com minibatches. Usado para o MLP e para o baseline linear (rede sem camadas ocultas).
  async function ajustar(camadas, tr, va, rand, onPonto) {
    var rede = new Rede(camadas, rand), curva = [];
    var ordem = tr.X.map(function (_, i) { return i; });
    for (var ep = 1; ep <= CFG.epocas; ep++) {
      for (var i = ordem.length - 1; i > 0; i--) { // embaralha (Fisher-Yates)
        var j = Math.floor(rand() * (i + 1)), t = ordem[i]; ordem[i] = ordem[j]; ordem[j] = t;
      }
      var soma = 0, lotes = 0;
      for (var k = 0; k < ordem.length; k += CFG.lote) {
        soma += rede.passoLote(tr.X, tr.Y, ordem.slice(k, k + CFG.lote), CFG.lr);
        lotes++;
        if (lotes % 40 === 0) await yieldUI();
      }
      var ponto = { epoca: ep, treino: soma / lotes, validacao: mse(rede, va) };
      curva.push(ponto);
      if (onPonto) onPonto(ponto);
      await yieldUI();
    }
    return { rede: rede, curva: curva };
  }

  async function treinar(onProgresso) {
    var racas = global.RACAS, rand = rng(CFG.semente);
    var perfisTr = gerarPerfis(CFG.perfisTreino, rand);
    var perfisVa = gerarPerfis(CFG.perfisValidacao, rand);
    var tr = montarAmostras(perfisTr, racas, rand);
    var va = montarAmostras(perfisVa, racas, rand);
    var t0 = Date.now();

    var mlp = await ajustar(CFG.camadas, tr, va, rand, function (pt) { if (onProgresso) onProgresso(pt, CFG.epocas); });
    var rede = mlp.rede;
    estado.curva = mlp.curva;

    // Baselines, avaliados nos mesmos perfis de validação, para mostrar que o MLP aprendeu algo além do trivial.
    var linear = await ajustar([CFG.camadas[0], 1], tr, va, rng(CFG.semente + 1), null);
    var mediaPorRaca = racas.map(function (b) {
      return perfisTr.reduce(function (s, p) { return s + rotular(p, b); }, 0) / perfisTr.length;
    });
    var sorteio = rng(CFG.semente + 2);
    var baselines = [
      Object.assign({ nome: 'Ranking aleatório' }, avaliar(function () { return sorteio(); }, perfisVa, racas)),
      Object.assign({ nome: 'Sempre as mesmas raças (média geral)' }, avaliar(function (p, b, i) { return mediaPorRaca[i]; }, perfisVa, racas)),
      Object.assign({ nome: 'Modelo linear (sem camadas ocultas)' }, avaliar(function (p, b) { return linear.rede.prever(vetorizar(p, b)); }, perfisVa, racas))
    ];

    estado.rede = rede;
    estado.metricas = Object.assign(avaliar(function (p, b) { return rede.prever(vetorizar(p, b)); }, perfisVa, racas), {
      baselines: baselines,
      amostrasTreino: tr.X.length,
      amostrasValidacao: va.X.length,
      parametros: CFG.camadas.slice(0, -1).reduce(function (s, n, l) { return s + n * CFG.camadas[l + 1] + CFG.camadas[l + 1]; }, 0),
      segundos: (Date.now() - t0) / 1000,
      curva: estado.curva
    });
    return estado.metricas;
  }

  /* ---------- 6. Inferência + explicação ---------- */
  function fatores(p, b) {
    var g = lacunas(p, b), f = [];
    if (g.moradia > 0) f.push({ ok: false, text: 'O ' + b.name + ' costuma precisar de mais espaço do que seu(sua) ' + HOUSING_LABEL[p.housing] + ' oferece — passeios extras ajudam a compensar.' });
    else f.push({ ok: true, text: 'Seu(sua) ' + HOUSING_LABEL[p.housing] + ' comporta bem o porte e a energia dessa raça.' });

    if (g.energia === 0) f.push({ ok: true, text: 'O nível de energia da raça combina com o seu perfil ' + ACTIVITY_LABEL[p.activity] + '.' });
    else if (g.energia > 0) f.push({ ok: false, text: 'Ele tem mais energia que o seu ritmo ' + ACTIVITY_LABEL[p.activity] + ' — reserve brincadeiras e passeios diários.' });
    else f.push({ ok: true, text: 'A raça é mais tranquila que o seu ritmo ' + ACTIVITY_LABEL[p.activity] + ', então acompanha você sem estresse.' });

    if (g.tempo > 0) f.push({ ok: false, text: 'A raça pede mais tempo de dedicação do que os ' + TIME_LABEL[p.time] + ' que você tem. Pense em passeador ou creche.' });
    else f.push({ ok: true, text: 'Seu tempo disponível (' + TIME_LABEL[p.time] + ') atende bem às necessidades dela.' });

    if (g.experiencia > 0) f.push({ ok: false, text: 'Essa raça costuma exigir mais experiência de manejo — vale contar com um adestrador positivo.' });
    else f.push({ ok: true, text: 'Com ' + EXP_LABEL[p.experience] + ', você está preparado(a) para lidar com o temperamento dela.' });

    if (g.sociabilidade > 0) f.push({ ok: false, text: 'Essa raça tende a ser mais reservada com visitas e outros cães do que a sua rotina social pede — exige socialização desde cedo e apresentações gradativas.' });
    else f.push({ ok: true, text: 'O temperamento da raça combina com a sua vida social (' + SOCIAL_LABEL[p.social] + ').' });

    if (p.kids === 'sim') {
      f.push(b.kids
        ? { ok: true, text: 'Tem bom histórico de convivência com crianças e outros animais.' }
        : { ok: false, text: 'Exige socialização cuidadosa e supervisão com crianças pequenas e outros pets.' });
    }
    return f;
  }

  function recomendar(p) {
    if (!estado.rede) throw new Error('Modelo ainda não treinado.');
    return global.RACAS.map(function (b) {
      var bruto = estado.rede.prever(vetorizar(p, b));
      return { breed: b, score: Math.round(clamp(bruto * 100, 45, 98)), bruto: bruto, factors: fatores(p, b) };
    }).sort(function (a, b) { return b.bruto - a.bruto; });
  }

  var pronto = null;
  global.PataIA = {
    config: CFG,
    treinar: treinar,
    iniciar: function (onProgresso) { return pronto || (pronto = treinar(onProgresso)); },
    recomendar: recomendar,
    get metricas() { return estado.metricas; }
  };
})(window);
