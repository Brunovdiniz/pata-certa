/* Gera dados/racas.js a partir de datasets públicos do AKC.
   Uso (Node 16+):  node dados/preparar_dataset.js

   Fontes (em dados/fontes/):
   - akcdata_tmfilho.csv      https://github.com/tmfilho/akcdata (MIT) — 277 raças do site do AKC:
                              altura/peso, energia, treinabilidade, frequência de escovação (escala 0–1)
   - breed_traits_kkakey.csv  https://github.com/kkakey/dog_traits_AKC — notas 1–5 do AKC por raça
                              (usamos "Good With Young Children" e "Mental Stimulation Needs")
   - catalogo.json            curadoria nossa: nome em português, mapeamento de nomes, ilustração e texto

   Conversão para as variáveis do modelo (regras explícitas, ajustáveis abaixo):
   energy 1-3  <- energy_level_value        (<=0.4 ->1 | 0.6 ->2 | >=0.8 ->3)
   space  1-4  <- regra de peso médio (kg)  (<10 ->1 | <22 ->2 | <35 ->3 | >=35 ->4), +1 se energy = 3 (máx. 4);
                  nas raças com dado kkakey, média com a regra de "Adaptability Level" (5 ->1 | 4 ->2 | 3 ->3 | <=2 ->4)
   social 1-3  <- média de "Openness To Strangers" e "Good With Other Dogs" (>=4 ->3 | >=3 ->2 | senão 1);
                  raças sem kkakey: "socialManual" do catálogo (estimativa)
   time   1-3  <- energy, +1 se escovação diária (grooming >= 1.0), máx. 3
   exp    1-4  <- trainability_value        (>=0.8 ->1 | 0.6 ->2 | 0.4 ->3 | <=0.2 ->4),
                  +1 se Mental Stimulation Needs = 5 (máx. 4)
   kids        <- Good With Young Children >= 4 (se a raça não estiver no dataset kkakey, usa kidsManual)
   Vira-lata Caramelo não existe no AKC: usa os valores "manual" do catálogo (estimativa). */
const fs = require('fs');
const path = require('path');
const dir = __dirname;

function csv(t) {
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.length > 1 || r[0] !== '') rows.push(r); r = []; }
    else c += ch;
  }
  if (c || r.length) { r.push(c); rows.push(r); }
  return rows;
}
function tabela(arquivo, chave) {
  const [h, ...linhas] = csv(fs.readFileSync(path.join(dir, 'fontes', arquivo), 'utf8'));
  const idx = h.indexOf(chave), out = {};
  // alguns nomes vêm com espaço não separável (NBSP); normaliza para o mapeamento funcionar
  linhas.forEach(l => { const o = {}; h.forEach((k, i) => o[k] = l[i]); out[l[idx].replace(/ /g, ' ').trim()] = o; });
  return out;
}

const akc = tabela('akcdata_tmfilho.csv', '');          // 1ª coluna (sem nome) = raça
const kk = tabela('breed_traits_kkakey.csv', 'Breed');
const catalogo = JSON.parse(fs.readFileSync(path.join(dir, 'fontes', 'catalogo.json'), 'utf8'));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const racas = catalogo.map(c => {
  const base = { name: c.nome };
  let dados;
  if (c.manual) {
    dados = Object.assign({}, c.manual, { kids: c.kidsManual, fonte: 'estimativa (raça sem registro no AKC)' });
  } else {
    const a = akc[c.akc];
    if (!a) throw new Error('Raça não encontrada no akcdata: ' + c.akc);
    const k = c.kkakey ? kk[c.kkakey] : null;
    if (c.kkakey && !k) throw new Error('Raça não encontrada no kkakey: ' + c.kkakey);
    ['min_weight', 'max_weight', 'energy_level_value', 'trainability_value', 'grooming_frequency_value'].forEach(f => {
      if (a[f] === '' || a[f] === undefined) throw new Error(c.akc + ': campo vazio no akcdata (' + f + ') — escolha outra variedade/raça');
    });
    const peso = (Number(a.min_weight) + Number(a.max_weight)) / 2;
    const alt = (Number(a.min_height) + Number(a.max_height)) / 2;
    const en = Number(a.energy_level_value), tr = Number(a.trainability_value), gr = Number(a.grooming_frequency_value);

    const energy = en <= 0.4 ? 1 : en <= 0.6 ? 2 : 3;
    const sizeBin = peso < 10 ? 1 : peso < 22 ? 2 : peso < 35 ? 3 : 4;
    const spacePeso = clamp(sizeBin + (energy === 3 ? 1 : 0), 1, 4);
    // "Adaptability Level" do AKC mede a tolerância a mudanças de rotina/moradia (5 = muito adaptável).
    // Raças presentes no kkakey: média entre a regra de peso/energia e a regra de adaptabilidade.
    const adapt = k ? Number(k['Adaptability Level']) : null;
    const spaceAdapt = adapt === null ? null : adapt >= 5 ? 1 : adapt === 4 ? 2 : adapt === 3 ? 3 : 4;
    const space = spaceAdapt === null ? spacePeso : clamp(Math.round((spacePeso + spaceAdapt) / 2), 1, 4);
    // Sociabilidade 1-3: média de "Openness To Strangers" e "Good With Other Dogs" (>=4 -> 3 | >=3 -> 2 | senão 1)
    const socMedia = k ? (Number(k['Openness To Strangers']) + Number(k['Good With Other Dogs'])) / 2 : null;
    const social = socMedia === null ? c.socialManual : socMedia >= 4 ? 3 : socMedia >= 3 ? 2 : 1;
    if (!social) throw new Error(c.nome + ': sem dados de sociabilidade (defina socialManual no catálogo)');
    const time = clamp(energy + (gr >= 1 ? 1 : 0), 1, 3);
    const trainBin = tr >= 0.8 ? 1 : tr >= 0.6 ? 2 : tr >= 0.4 ? 3 : 4;
    const exp = clamp(trainBin + (k && Number(k['Mental Stimulation Needs']) >= 5 ? 1 : 0), 1, 4);
    const kids = k ? Number(k['Good With Young Children']) >= 4 : c.kidsManual;

    dados = { energy, space, time, exp, social, kids,
      fonte: 'AKC via tmfilho/akcdata' + (k ? ' + kkakey/dog_traits_AKC' : ' (crianças: estimativa)'),
      akc: { energia: en, treinabilidade: tr, escovacao: gr, pesoKg: Math.round(peso * 10) / 10, alturaCm: Math.round(alt),
             criancas: k ? Number(k['Good With Young Children']) : null, estimulo: k ? Number(k['Mental Stimulation Needs']) : null,
             adaptabilidade: adapt, estranhos: k ? Number(k['Openness To Strangers']) : null, outrosCaes: k ? Number(k['Good With Other Dogs']) : null } };
  }
  return Object.assign(base, dados, { ear: c.ear, fur: c.fur, dark: c.dark, light: c.light, bg: c.bg, why: c.why });
});

const cab = '/* ARQUIVO GERADO por dados/preparar_dataset.js — não edite à mão.\n' +
  '   Fontes: AKC via github.com/tmfilho/akcdata (MIT) e github.com/kkakey/dog_traits_AKC.\n' +
  '   energy 1-3 | space 1-4 | time 1-3 | exp 1-4 | social 1-3 | kids bool. As regras de conversão estão no script. */\n';
fs.writeFileSync(path.join(dir, 'racas.js'), cab + 'window.RACAS = ' + JSON.stringify(racas, null, 1) + ';\n');
console.log('racas.js gerado com ' + racas.length + ' raças');
console.table(racas.map(r => ({ raca: r.name, energy: r.energy, space: r.space, time: r.time, exp: r.exp, social: r.social, kids: r.kids, kg: r.akc && r.akc.pesoKg })));
