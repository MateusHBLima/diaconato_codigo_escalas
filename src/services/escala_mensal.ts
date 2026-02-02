
import { supabase } from '../config/supabase.js';
import {
    parseDisponibilidade,
    atendePeriodo,
    atendeGenero
} from './parser.js';
import type { Membro, Funcao, Culto, Alocacao, ResultadoEscala } from '../types/index.js';
import { gerarCultosDoMes, salvarCultos, buscarCultosDoMes } from './cultos.js';
import { gerarEscalaComPool } from './escala_diaria_custom.js';

// ============================================
// TIPOS INTERNOS
// ============================================

interface MembroComHistorico extends Membro {
    escalas_no_mes: number;
    ultima_escala?: string;
    limite_mes: number;
    // Marcação interna para fase de distribuição
    pool_cultos_ids?: Set<string>;
}

// ============================================
// HELPERS GERAIS
// ============================================

async function limparDadosDoMes(mes: number, ano: number): Promise<void> {
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('id')
        .eq('mes', mes)
        .eq('ano', ano);

    if (!cultos || cultos.length === 0) return;

    const ids = cultos.map(c => c.id);

    await supabase.from('escalas_alocacoes').delete().in('culto_id', ids);
    await supabase.from('datas_cultos').delete().in('id', ids);
}

async function salvarAlocacoes(alocacoes: Omit<Alocacao, 'id'>[]): Promise<void> {
    const batchSize = 100;
    for (let i = 0; i < alocacoes.length; i += batchSize) {
        const batch = alocacoes.slice(i, i + batchSize);
        await supabase.from('escalas_alocacoes').insert(batch);
    }
}

async function buscarMembrosAtivos(
    periodo: 'quinta' | 'domingo'
): Promise<MembroComHistorico[]> {
    const { data: membros } = await supabase.from('membros').select('*').eq('ativo', true);
    if (!membros) return [];

    return membros
        .map(membro => {
            const dispTexto = periodo === 'quinta'
                ? membro.disponibilidade_quinta
                : membro.disponibilidade_domingo;
            const res = parseDisponibilidade(dispTexto);

            // CORREÇÃO CRÍTICA: Prioridade Mesa ignora limites de frequência
            let limiteFinal = res.vezesPorMes;
            if (membro.aptidoes?.includes('Prioridade Mesa')) {
                limiteFinal = 10; // Força limite alto
            }

            return {
                ...membro,
                escalas_no_mes: 0,
                limite_mes: limiteFinal,
                pool_cultos_ids: new Set(),
                disponivel: res.disponivel // Auxiliar temporário
            };
        })
        .filter(m => {
            return m.disponivel;
        });
}

// ============================================
// FASE 1: DISTRIBUIÇÃO ESTRATÉGICA (PRESENÇA)
// ============================================

function distribuirPresencaQuintas(
    membros: MembroComHistorico[],
    cultos: Culto[]
): void {
    const MINIMO_MEMBROS = 28;

    // Ordenar cultos cronologicamente
    const cultosOrdenados = [...cultos].sort((a, b) => a.data_culto.localeCompare(b.data_culto));

    // Preparar contadores
    const ocupacao = new Map<string, number>();
    cultosOrdenados.forEach(c => ocupacao.set(c.id, 0));

    // ============================================
    // SEPARAR N5 - NÃO CONTAM NO MÍNIMO DE 28
    // ============================================
    const membrosN5 = membros.filter(m => m.nivel_experiencia === 5);
    const membrosSemN5 = membros.filter(m => m.nivel_experiencia !== 5);

    console.log(`   👑 N5 (não contam no mínimo): ${membrosN5.length} membros`);

    // Separar grupos por frequência (EXCLUINDO N5)
    const grupo3x = membrosSemN5.filter(m => m.limite_mes >= 3);
    const grupo2x = [...membrosSemN5.filter(m => m.limite_mes === 2)];
    const grupo1x = [...membrosSemN5.filter(m => m.limite_mes === 1)];

    // Identificar quintas
    const Q1 = cultosOrdenados[0];
    const Q2 = cultosOrdenados[1];
    const Q3 = cultosOrdenados[2];
    const Q4 = cultosOrdenados[3]; // pode ser undefined
    const Q5 = cultosOrdenados[4]; // pode ser undefined

    console.log(`   📅 Quintas do mês: ${cultosOrdenados.length}`);
    console.log(`   👥 Grupos (sem N5): 3x=${grupo3x.length}, 2x=${grupo2x.length}, 1x=${grupo1x.length}`);

    // ============================================
    // NOVA LÓGICA: ESCALA ESPELHO
    // Q1 = Q3 (mesmas pessoas)
    // Q2 = Q4 (mesmas pessoas)
    // Q5 = preencher com sobras
    // ============================================

    // Calcular quantos 2x precisamos para Q1/Q3
    const vagasQ1 = MINIMO_MEMBROS - grupo3x.length;
    const vagasQ2 = MINIMO_MEMBROS - grupo3x.length;

    console.log(`   📊 Vagas a preencher: Q1/Q3=${vagasQ1}, Q2/Q4=${vagasQ2}`);

    // ============================================
    // GRUPO A: Membros 3x vão em Q1, Q2, Q3
    // ============================================
    for (const m of grupo3x) {
        if (Q1) { m.pool_cultos_ids!.add(Q1.id); ocupacao.set(Q1.id, (ocupacao.get(Q1.id) || 0) + 1); }
        if (Q2) { m.pool_cultos_ids!.add(Q2.id); ocupacao.set(Q2.id, (ocupacao.get(Q2.id) || 0) + 1); }
        if (Q3) { m.pool_cultos_ids!.add(Q3.id); ocupacao.set(Q3.id, (ocupacao.get(Q3.id) || 0) + 1); }
    }
    console.log(`   ✅ 3x: ${grupo3x.length} membros em Q1, Q2, Q3`);

    // ============================================
    // GRUPO B: Primeiros 2x vão em Q1 + Q3 (espelho)
    // CORREÇÃO: Intercalar gêneros para garantir mulheres em Q1 (Apoio precisa)
    // ============================================

    // Separar 2x por gênero e intercalar
    const mulheres2x = grupo2x.filter(m => m.sexo === 'MULHER');
    const homens2x = grupo2x.filter(m => m.sexo === 'HOMEM');

    console.log(`   👥 2x por gênero: ${mulheres2x.length} mulheres, ${homens2x.length} homens`);

    // Intercalar: M, H, M, H, M, H... para garantir distribuição equilibrada
    const grupo2x_intercalado: typeof grupo2x = [];
    const maxLen = Math.max(mulheres2x.length, homens2x.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < mulheres2x.length) grupo2x_intercalado.push(mulheres2x[i]);
        if (i < homens2x.length) grupo2x_intercalado.push(homens2x[i]);
    }

    const grupo2x_Q1Q3 = grupo2x_intercalado.splice(0, vagasQ1);
    for (const m of grupo2x_Q1Q3) {
        if (Q1) { m.pool_cultos_ids!.add(Q1.id); ocupacao.set(Q1.id, (ocupacao.get(Q1.id) || 0) + 1); }
        if (Q3) { m.pool_cultos_ids!.add(Q3.id); ocupacao.set(Q3.id, (ocupacao.get(Q3.id) || 0) + 1); }
    }
    console.log(`   ✅ 2x (Q1=Q3): ${grupo2x_Q1Q3.length} membros (${grupo2x_Q1Q3.filter(m => m.sexo === 'MULHER').length} mulheres)`);

    // ============================================
    // GRUPO C: Próximos 2x vão em Q2 + Q4 (espelho)
    // ============================================
    const grupo2x_Q2Q4 = grupo2x_intercalado.splice(0, vagasQ2); // Usa o intercalado
    for (const m of grupo2x_Q2Q4) {
        if (Q2) { m.pool_cultos_ids!.add(Q2.id); ocupacao.set(Q2.id, (ocupacao.get(Q2.id) || 0) + 1); }
        if (Q4) { m.pool_cultos_ids!.add(Q4.id); ocupacao.set(Q4.id, (ocupacao.get(Q4.id) || 0) + 1); }
    }
    console.log(`   ✅ 2x (Q2=Q4): ${grupo2x_Q2Q4.length} membros (${grupo2x_Q2Q4.filter(m => m.sexo === 'MULHER').length} mulheres)`);

    // ============================================
    // GRUPO D: 2x restantes vão em Q4 + Q5 ou só Q5
    // ============================================
    const grupo2x_restante = grupo2x_intercalado; // O que sobrou após splice
    if (grupo2x_restante.length > 0) {
        for (const m of grupo2x_restante) {
            // Se Q4 e Q5 existem, vai nos dois
            if (Q4 && Q5) {
                m.pool_cultos_ids!.add(Q4.id);
                m.pool_cultos_ids!.add(Q5.id);
                ocupacao.set(Q4.id, (ocupacao.get(Q4.id) || 0) + 1);
                ocupacao.set(Q5.id, (ocupacao.get(Q5.id) || 0) + 1);
            } else if (Q5) {
                // Se só Q5 existe, coloca lá (viola limite 2x, mas ok)
                m.pool_cultos_ids!.add(Q5.id);
                ocupacao.set(Q5.id, (ocupacao.get(Q5.id) || 0) + 1);
            } else if (Q4) {
                m.pool_cultos_ids!.add(Q4.id);
                ocupacao.set(Q4.id, (ocupacao.get(Q4.id) || 0) + 1);
            }
        }
        console.log(`   ✅ 2x (restante): ${grupo2x_restante.length} membros em Q4/Q5`);
    }

    // ============================================
    // GRUPO E: 1x vão para QUALQUER quinta abaixo do mínimo (incluindo Q1-Q3)
    // CORREÇÃO: Antes priorizava só Q5/Q4, agora preenche onde precisar
    // ============================================
    for (const m of grupo1x) {
        // Encontrar a quinta com MENOR ocupação (balanceamento global)
        let targetCulto: Culto | null = null;
        let menorCount = Infinity;

        for (const c of cultosOrdenados) {
            const count = ocupacao.get(c.id) || 0;
            if (count < menorCount) {
                menorCount = count;
                targetCulto = c;
            }
        }

        if (targetCulto) {
            m.pool_cultos_ids!.add(targetCulto.id);
            ocupacao.set(targetCulto.id, (ocupacao.get(targetCulto.id) || 0) + 1);
        }
    }
    console.log(`   ✅ 1x: ${grupo1x.length} membros distribuídos (balanceamento global)`);

    // Log final
    console.log(`   📊 Ocupação final das quintas:`);
    cultosOrdenados.forEach((c, idx) => {
        console.log(`      Quinta ${idx + 1} (${c.data_culto.split('T')[0]}): ${ocupacao.get(c.id)} membros`);
    });
}

function distribuirPresencaDomingos(
    membros: MembroComHistorico[], // Lista completa
    cultosDomingo: Culto[]
): void {
    // 1. Agrupar cultos por Data Lógica de Domingo (para frequencia 3x/2x)
    const diasMap = new Map<string, Culto[]>();
    cultosDomingo.forEach(c => {
        const dataBase = c.data_culto.split('T')[0]; // YYYY-MM-DD
        if (!diasMap.has(dataBase)) diasMap.set(dataBase, []);
        diasMap.get(dataBase)!.push(c);
    });

    // Sort das datas para lógica 1ª, 2ª, 3ª semana
    const datasOrdenadas = Array.from(diasMap.keys()).sort();

    // 2. Identificar Duplas (Casais) e Singles
    const processados = new Set<string>();

    for (const mPrincipal of membros) {
        if (processados.has(mPrincipal.id)) continue;

        // Tentar achar cônjuge
        let conjuge: MembroComHistorico | undefined;
        if (mPrincipal.nome_conjuge) {
            const nomeConjugeClean = mPrincipal.nome_conjuge.trim().toLowerCase();
            conjuge = membros.find(m =>
                m.id !== mPrincipal.id &&
                m.nome_completo.toLowerCase().includes(nomeConjugeClean)
            );
        }

        const dupla = conjuge ? [mPrincipal, conjuge] : [mPrincipal];
        dupla.forEach(d => processados.add(d.id));

        // Limite da Dupla: Usar o menor limite para garantir que vão juntos
        const limite = Math.min(...dupla.map(d => d.limite_mes));

        // === PASSO A: Definir SEMANAS de presença (Frequência 3x/2x/1x) ===
        const semanasAlvoIndices: number[] = [];
        const totalSemanas = datasOrdenadas.length;

        // Base determinística para rotação
        const idSum = mPrincipal.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

        if (limite >= 3) {
            // 3x: 3 semanas rotacionadas
            const start = idSum % totalSemanas;
            for (let i = 0; i < 3; i++) {
                semanasAlvoIndices.push((start + i) % totalSemanas);
            }
        } else if (limite === 2) {
            // 2x: Alternado com salto de 1
            const start = idSum % totalSemanas;
            semanasAlvoIndices.push(start % totalSemanas);
            semanasAlvoIndices.push((start + 2) % totalSemanas);
        } else {
            // 1x: Espalhado uniformemente
            const start = idSum % totalSemanas;
            semanasAlvoIndices.push(start);
        }

        // === PASSO B: Definir PERÍODO (Manhã vs Noite) ===
        // Regra RESTRITIVA e "Qualquer = Noite"

        let periodoFinal: 'manha' | 'noite' = 'noite'; // Default seguro

        const prefs = dupla.map(d => d.melhor_periodo_domingo?.toLowerCase() || 'qualquer');
        const temManha = prefs.some(p => p.includes('manhã'));
        const temNoite = prefs.some(p => p.includes('noite'));
        const soQualquer = prefs.every(p => p.includes('qualquer') || p === '');

        if (soQualquer) {
            periodoFinal = 'noite'; // Regra Solteiro/Casal Qualquer -> Noite
        } else if (temManha && !temNoite) {
            periodoFinal = 'manha';
        } else {
            periodoFinal = 'noite'; // Conflito ou Qualquer+Noite -> Noite
        }

        // === PASSO C: Aplicar aos cultos ===
        semanasAlvoIndices.forEach(idx => {
            if (idx >= datasOrdenadas.length) return;
            const dataAlvo = datasOrdenadas[idx];
            const cultosDoDia = diasMap.get(dataAlvo) || [];

            // Achar o culto alvo do período correto
            const cultoAlvo = cultosDoDia.find(c => {
                if (periodoFinal === 'manha') return c.periodo === 'domingo_manha';
                return c.periodo === 'domingo_noite';
            });

            if (cultoAlvo) {
                dupla.forEach(m => m.pool_cultos_ids!.add(cultoAlvo.id));
            }
        });
    }
}

// ============================================
// FASE 1.5: LÍDERES N5 SEMPRE PRESENTES + SINCRONIZAÇÃO DE CASAIS
// Líderes N5 ignoram frequência e estão em TODOS os cultos
// ============================================

function sincronizarCasaisLideres(
    membros: MembroComHistorico[],
    todosCultos: Culto[]
): void {
    console.log(`   👑 Forçando Líderes N5 em TODOS os cultos...`);

    // Identificar líderes Nível 5
    const lideresN5 = membros.filter(m => m.nivel_experiencia === 5);

    for (const lider of lideresN5) {
        // REGRA 1: Líder N5 está em TODOS os cultos (ignora frequência)
        for (const culto of todosCultos) {
            lider.pool_cultos_ids!.add(culto.id);
        }
        console.log(`      ✅ ${lider.nome_completo} (N5) forçado em ${todosCultos.length} cultos`);

        // REGRA 2: Cônjuge também vai em TODOS os cultos (se serve junto)
        const nomeConjuge = (lider as any).nome_conjuge;
        const conjugeServeJunto = (lider as any).conjuge_serve_junto;

        // Verificar se tem cônjuge E se serve junto
        if (!nomeConjuge || !conjugeServeJunto) continue;

        const nomeConjugeLower = nomeConjuge.toLowerCase().trim();
        const conjuge = membros.find(m => {
            if (m.id === lider.id) return false;
            const nomeLower = m.nome_completo.toLowerCase().trim();
            if (nomeLower === nomeConjugeLower) return true;
            const primeiroNome = nomeConjugeLower.split(' ')[0];
            if (nomeLower.includes(primeiroNome)) return true;
            return false;
        });

        if (conjuge) {
            for (const culto of todosCultos) {
                conjuge.pool_cultos_ids!.add(culto.id);
            }
            console.log(`      ✅ ${conjuge.nome_completo} (cônjuge) forçado em ${todosCultos.length} cultos`);
        }
    }
}

// ============================================
// FASE 1.6: MEMBROS COM PRIORIDADE MESA SEMPRE PRESENTES
// José Duarte e outros com "Prioridade Mesa" devem estar em TODOS os cultos
// ============================================

function sincronizarMembrosMesa(
    membros: MembroComHistorico[],
    todosCultos: Culto[]
): void {
    console.log(`   🍽️ Forçando membros com Prioridade Mesa em TODOS os cultos...`);

    // Identificar membros com aptidão "Prioridade Mesa"
    const membrosMesa = membros.filter(m => m.aptidoes?.includes('Prioridade Mesa'));

    for (const membro of membrosMesa) {
        // REGRA: Membro com Prioridade Mesa está em TODOS os cultos (ignora frequência)
        for (const culto of todosCultos) {
            membro.pool_cultos_ids!.add(culto.id);
        }
        console.log(`      ✅ ${membro.nome_completo} (Prioridade Mesa) forçado em ${todosCultos.length} cultos`);
    }
}

// ============================================
// ORQUESTRADOR PRINCIPAL
// ============================================

export async function gerarEscalaMensal(mes: number, ano: number) {
    console.log(`\n🚀 INICIANDO GERAÇÃO (FASE 1 = Custom | FASE 2 = Strict Clone): ${mes}/${ano}`);

    // FASE 0: LIMPEZA
    console.log(`\n🧹 Fase 0: Limpeza...`);
    await limparDadosDoMes(mes, ano);

    // GERAR CULTOS
    await salvarCultos(await gerarCultosDoMes(mes, ano));
    const cultos = await buscarCultosDoMes(mes, ano);

    const quintas = cultos.filter(c => c.periodo === 'quinta');
    const domingos = cultos.filter(c => c.periodo.startsWith('domingo'));

    // CARREGAR MEMBROS
    const membrosQuinta = await buscarMembrosAtivos('quinta');
    const membrosDomingo = await buscarMembrosAtivos('domingo');

    // FASE 1: DISTRIBUIÇÃO (POOL)
    console.log(`\n🌊 Fase 1: Distribuição de Presença`);
    distribuirPresencaQuintas(membrosQuinta, quintas);
    distribuirPresencaDomingos(membrosDomingo, domingos);

    // FASE 1.5: LÍDERES N5 SEMPRE PRESENTES (IGNORAM FREQUÊNCIA)
    // Garantir que líderes N5 + cônjuges estejam em TODOS os cultos
    sincronizarCasaisLideres(membrosQuinta, quintas);
    sincronizarCasaisLideres(membrosDomingo, domingos);

    // FASE 1.6: MEMBROS COM PRIORIDADE MESA SEMPRE PRESENTES
    // José Duarte e outros com aptidão "Prioridade Mesa" devem estar em TODOS os cultos
    sincronizarMembrosMesa(membrosQuinta, quintas);
    sincronizarMembrosMesa(membrosDomingo, domingos);

    // FASE 2: ALOCAÇÃO TÁTICA (DELEGADA AO CLONE DIÁRIO)
    console.log(`\n🧩 Fase 2: Alocação Tática (Via Clone Diário)`);

    const alocacoesTotais: Omit<Alocacao, 'id'>[] = [];
    const resultadosPorCulto: ResultadoEscala[] = [];

    // Processar TODOS os cultos
    for (const culto of cultos) {

        // 1. Definir Pool do Dia
        // ATENÇÃO: Aqui passamos o Pool JÁ filtrado pela Fase 1
        const listSet = culto.periodo === 'quinta' ? membrosQuinta : membrosDomingo;
        const poolDoDia = listSet.filter(m => m.pool_cultos_ids!.has(culto.id));

        if (poolDoDia.length === 0) {
            console.log(`   ⚠️ Pool vazio para ${culto.nome_culto} (${culto.data_culto})`);
            continue;
        }

        // 2. Chamar o Clone Diário
        // Ele vai alocar funções, responsáveis, validar regras, etc.
        const resultadoCulto = await gerarEscalaComPool(culto, poolDoDia);

        // Acumular alocações
        // IMPORTANTE: gerarEscalaComPool retorna alocacoes com IDs e tudo mais.
        // Precisamos garantir que não salve duas vezes se o clone salvar.
        // O clone atual NÃO salva alocações no DB (eu comentei/pus return).

        // Vamos extrair as alocacoes retornadas pelo clone e acumular para salvar em batch.
        // O meu código do clone retornava { alocacoes: ... }
        // Se eu modifiquei o clone para retornar, aqui eu pego.
        if (resultadoCulto.alocacoes) {
            alocacoesTotais.push(...resultadoCulto.alocacoes);
        }

        resultadosPorCulto.push(resultadoCulto);
    }

    // SALVAR EM BATCH (Mais eficiente que salvar culto a culto)
    console.log(`\n💾 Salvando ${alocacoesTotais.length} alocações finais...`);
    await salvarAlocacoes(alocacoesTotais);

    return {
        success: true,
        mes,
        ano,
        resultados: resultadosPorCulto
    };
}
