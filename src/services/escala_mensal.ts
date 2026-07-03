
import { supabase } from '../config/supabase.js';
import {
    parseDisponibilidade,
    atendePeriodo,
    atendeGenero
} from './parser.js';
import type { Membro, Funcao, Culto, Alocacao } from '../types/index.js';
import { gerarCultosDoMes, salvarCultos, buscarCultosDoMes } from './cultos.js';

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
    const MAXIMO_MEMBROS = 30; // Cap máximo por quinta (exclui N5)

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
    // Ordenação SMART: Nível Ascendente (1->4) para priorizar operários nas funções básicas
    // e Alfabetica para determinismo
    const sortSmart = (a: MembroComHistorico, b: MembroComHistorico) =>
        (a.nivel_experiencia || 1) - (b.nivel_experiencia || 1) || (a.nome_completo || '').localeCompare(b.nome_completo || '');

    const grupo3x = membrosSemN5.filter(m => m.limite_mes >= 3);
    const grupo2x = [...membrosSemN5.filter(m => m.limite_mes === 2)].sort(sortSmart);
    const grupo1x = [...membrosSemN5.filter(m => m.limite_mes === 1)].sort(sortSmart);

    // Identificar quintas
    const Q1 = cultosOrdenados[0];
    const Q2 = cultosOrdenados[1];
    const Q3 = cultosOrdenados[2];
    const Q4 = cultosOrdenados[3]; // pode ser undefined
    const Q5 = cultosOrdenados[4]; // pode ser undefined

    console.log(`   📅 Quintas do mês: ${cultosOrdenados.length}`);
    console.log(`   👥 Grupos (sem N5): 3x=${grupo3x.length}, 2x=${grupo2x.length}, 1x=${grupo1x.length}`);

    // ============================================
    // GRUPO N5: Líderes vão em TODAS as quintas disponíveis
    // ============================================
    for (const m of membrosN5) {
        cultosOrdenados.forEach(c => {
            m.pool_cultos_ids!.add(c.id);
            ocupacao.set(c.id, (ocupacao.get(c.id) || 0) + 1);
        });
    }
    console.log(`   ✅ N5: ${membrosN5.length} membros alocados em TODAS as quintas`);

    // ============================================
    // GRUPO A: Membros 3x (Rotação Balanceada)
    // Antes: Q1, Q2, Q3 (Fixo) -> Q4 morria.
    // Agora: 4 Padrões de Rotação para cobrir Q4 também.
    // ============================================
    // Padrões (Indices 0..3):
    // 0: [0, 1, 2] -> Q1, Q2, Q3
    // 1: [0, 1, 3] -> Q1, Q2, Q4
    // 2: [0, 2, 3] -> Q1, Q3, Q4
    // 3: [1, 2, 3] -> Q2, Q3, Q4

    const patterns3x = [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3]
    ];

    for (const m of grupo3x) {
        // Seleção Determinística do Padrão via Hash do Nome
        // (Isso garante consistência se rodar de novo)
        const idSum = m.nome_completo.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const patternIdx = idSum % 4;
        const indices = patterns3x[patternIdx];

        indices.forEach(idx => {
            const culto = cultosOrdenados[idx]; // Q1..Q4
            if (culto && (ocupacao.get(culto.id) || 0) < MAXIMO_MEMBROS) {
                m.pool_cultos_ids!.add(culto.id);
                ocupacao.set(culto.id, (ocupacao.get(culto.id) || 0) + 1);
            }
        });
    }
    console.log(`   ✅ 3x: ${grupo3x.length} membros distribuídos (Rotação Balanceada 4 Padrões)`);

    // ============================================
    // GRUPO B: 2x (Divisão Estrita 50/50 e Espelhada)
    // Balanceia Bases de Q1/Q3 e Q2/Q4
    // ============================================

    // Separar 2x por gênero para manter proporção Hall(H)/Apoio(M)
    const mulheres2x = grupo2x.filter(m => m.sexo === 'MULHER');
    const homens2x = grupo2x.filter(m => m.sexo === 'HOMEM');

    const grupo2x_Q1Q3: typeof grupo2x = [];
    const grupo2x_Q2Q4: typeof grupo2x = [];

    // Distribuir Mulheres (Intercalado: A, B, A, B...)
    mulheres2x.forEach((m, i) => {
        if (i % 2 === 0) grupo2x_Q1Q3.push(m);
        else grupo2x_Q2Q4.push(m);
    });

    // Distribuir Homens (Intercalado: A, B, A, B...)
    homens2x.forEach((m, i) => {
        if (i % 2 === 0) grupo2x_Q1Q3.push(m);
        else grupo2x_Q2Q4.push(m);
    });

    console.log(`   ⚖️ Split 2x: A=${grupo2x_Q1Q3.length} vs B=${grupo2x_Q2Q4.length}`);

    // ALOCAR Q1/Q3 (Grupo A - "Primeiras Quintas")
    for (const m of grupo2x_Q1Q3) {
        if (Q1 && (ocupacao.get(Q1.id) || 0) < MAXIMO_MEMBROS) { m.pool_cultos_ids!.add(Q1.id); ocupacao.set(Q1.id, (ocupacao.get(Q1.id) || 0) + 1); }
        if (Q3 && (ocupacao.get(Q3.id) || 0) < MAXIMO_MEMBROS) { m.pool_cultos_ids!.add(Q3.id); ocupacao.set(Q3.id, (ocupacao.get(Q3.id) || 0) + 1); }
    }
    console.log(`   ✅ 2x (Q1=Q3): ${grupo2x_Q1Q3.length} membros`);

    // ALOCAR Q2/Q4 (Grupo B - "Segundas Quintas")
    for (const m of grupo2x_Q2Q4) {
        if (Q2 && (ocupacao.get(Q2.id) || 0) < MAXIMO_MEMBROS) { m.pool_cultos_ids!.add(Q2.id); ocupacao.set(Q2.id, (ocupacao.get(Q2.id) || 0) + 1); }
        if (Q4 && (ocupacao.get(Q4.id) || 0) < MAXIMO_MEMBROS) { m.pool_cultos_ids!.add(Q4.id); ocupacao.set(Q4.id, (ocupacao.get(Q4.id) || 0) + 1); }
    }
    console.log(`   ✅ 2x (Q2=Q4): ${grupo2x_Q2Q4.length} membros alocados`);

    // ============================================
    // GRUPO E: 1x e Sobras (Global Balance)
    // Vão para QUALQUER quinta abaixo da média
    // ============================================
    for (const m of grupo1x) {
        // Encontrar a quinta com MENOR ocupação que ainda não atingiu o máximo
        let targetCulto: Culto | null = null;
        let menorCount = Infinity;

        for (const c of cultosOrdenados) {
            const count = ocupacao.get(c.id) || 0;
            if (count < MAXIMO_MEMBROS && count < menorCount) {
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


interface SchedulingUnit {
    members: MembroComHistorico[];
    type: 'casal' | 'solteiro';
    sharedFreq: number; // Frequência garantida juntos (miníma)
    surplusMember?: MembroComHistorico; // Quem tem dias a mais
    surplusFreq?: number;
    preferredShift: 'manha' | 'noite' | 'qualquer';
    assignedShifts: { [key: string]: 'manha' | 'noite' }; // Rastrear turno por data base
}

function distribuirPresencaDomingos(
    membros: MembroComHistorico[],
    cultosDomingo: Culto[]
): void {
    const MAXIMO_MEMBROS_POR_CULTO = 30; // Cap máximo por culto de domingo
    // 1. Agrupar cultos por Data Lógica (YYYY-MM-DD)
    const diasMap = new Map<string, { manha?: Culto, noite?: Culto }>();
    cultosDomingo.forEach(c => {
        const dataBase = c.data_culto.split('T')[0];
        if (!diasMap.has(dataBase)) diasMap.set(dataBase, {});
        const dia = diasMap.get(dataBase)!;
        if (c.periodo.endsWith('manha')) dia.manha = c;
        else dia.noite = c;
    });

    const datasOrdenadas = Array.from(diasMap.keys()).sort();

    // Identificar Quintas Lógicas (D1, D2, D3, D4, D5)
    // Usaremos índices 0, 1, 2, 3, 4
    const D1_Data = datasOrdenadas[0];
    const D2_Data = datasOrdenadas[1];
    const D3_Data = datasOrdenadas[2];
    const D4_Data = datasOrdenadas[3];
    const D5_Data = datasOrdenadas[4];

    console.log(`   📅 Domingos detectados: ${datasOrdenadas.length}`);

    // 2. Construir Unidades de Agendamento (Casais e Solteiros)
    const units: SchedulingUnit[] = [];
    const processados = new Set<string>();

    for (const mPrincipal of membros) {
        if (processados.has(mPrincipal.id)) continue;

        let membersList = [mPrincipal];
        let type: 'casal' | 'solteiro' = 'solteiro';
        let sharedFreq = mPrincipal.limite_mes;
        let surplusMember: MembroComHistorico | undefined;
        let surplusFreq = 0;

        // Tentar achar cônjuge
        if (mPrincipal.nome_conjuge) {
            const nomeConjugeClean = mPrincipal.nome_conjuge.trim().toLowerCase();
            const conjuge = membros.find(m => {
                if (m.id === mPrincipal.id) return false;
                const match1 = m.nome_completo.toLowerCase().includes(nomeConjugeClean);
                const mNomeConjugeClean = m.nome_conjuge ? m.nome_conjuge.trim().toLowerCase() : '';
                const match2 = mNomeConjugeClean && mPrincipal.nome_completo.toLowerCase().includes(mNomeConjugeClean);
                return match1 && match2;
            });
            if (conjuge) {
                membersList.push(conjuge);
                type = 'casal';
                processados.add(conjuge.id);

                // Lógica Híbrida:
                // Shared = Mínimo dos dois
                // Surplus = Diferença do maior
                const minLimit = Math.min(mPrincipal.limite_mes, conjuge.limite_mes);
                sharedFreq = minLimit;

                if (mPrincipal.limite_mes > minLimit) {
                    surplusMember = mPrincipal;
                    surplusFreq = mPrincipal.limite_mes - minLimit;
                } else if (conjuge.limite_mes > minLimit) {
                    surplusMember = conjuge;
                    surplusFreq = conjuge.limite_mes - minLimit;
                }
            }
        }
        processados.add(mPrincipal.id);

        // Definir preferência unificada
        // Regra "Restritiva": Qualquer + Noite = Noite. Manhã só se Manhã + Manhã ou Manhã + Qualquer
        const prefs = membersList.map(m => m.melhor_periodo_domingo?.toLowerCase() || 'qualquer');
        let finalPref: 'manha' | 'noite' | 'qualquer' = 'qualquer';

        if (prefs.some(p => p.includes('noite'))) finalPref = 'noite';
        else if (prefs.some(p => p.includes('manhã'))) finalPref = 'manha';
        else finalPref = 'noite'; // Default "Qualquer" -> Strictly Night (Regra de Negócio para cobrir falta)

        units.push({
            members: membersList,
            type,
            sharedFreq,
            surplusMember,
            surplusFreq,
            preferredShift: finalPref,
            assignedShifts: {}
        });
    }

    // Rastrear as estatísticas por data e turno
    const poolStats = new Map<string, {
        manha: { count: number, men: number, women: number, mesa: number, n3men: number },
        noite: { count: number, men: number, women: number, mesa: number, n3men: number }
    }>();

    for (const d of datasOrdenadas) {
        poolStats.set(d, {
            manha: { count: 0, men: 0, women: 0, mesa: 0, n3men: 0 },
            noite: { count: 0, men: 0, women: 0, mesa: 0, n3men: 0 }
        });
    }

    // Função de Pontuação
    const calculateShiftScore = (
        unit: SchedulingUnit,
        date: string,
        shift: 'manha' | 'noite'
    ): number => {
        const stats = poolStats.get(date);
        if (!stats) return -999;
        const shiftStats = stats[shift];

        // Verificar o cap máximo do culto
        const numNewMembers = unit.members.length;
        if (shiftStats.count + numNewMembers > MAXIMO_MEMBROS_POR_CULTO) {
            return -999; // Cap excedido, descarte absoluto
        }

        let score = 0;

        const numNewMen = unit.members.filter(m => m.sexo === 'HOMEM').length;
        const numNewWomen = unit.members.filter(m => m.sexo === 'MULHER').length;
        const numNewMesa = unit.members.filter(m => m.aptidoes?.includes('Prioridade Mesa')).length;
        const numNewN3Men = unit.members.filter(m => m.sexo === 'HOMEM' && m.nivel_experiencia === 3).length;

        // 1. Equilíbrio de Gênero (Meta: 6 homens, 4 mulheres por turno)
        if (shiftStats.men < 6 && numNewMen > 0) {
            score += numNewMen * 20;
        }
        if (shiftStats.women < 4 && numNewWomen > 0) {
            score += numNewWomen * 20;
        }

        // 2. Homens Nível 3 para Salvas (Meta: 1 por turno)
        if (shiftStats.n3men < 1 && numNewN3Men > 0) {
            score += numNewN3Men * 30;
        }

        // 3. Controle de Mesa (Meta: no máximo 1 por turno para evitar acúmulos)
        if (numNewMesa > 0) {
            if (shiftStats.mesa >= 1) {
                score -= 100;
            } else {
                score += 50;
            }
        }

        // 4. Balanço Geral de Ocupação (manter entre 10 e 15 membros comuns por turno)
        if (shiftStats.count < 10) {
            score += numNewMembers * 5;
        } else if (shiftStats.count > 13) {
            score -= numNewMembers * 15;
        }

        return score;
    };

    const assignUnitToDateShift = (unit: SchedulingUnit, date: string, shift: 'manha' | 'noite') => {
        const stats = poolStats.get(date)!;
        const shiftStats = stats[shift];

        const numNewMen = unit.members.filter(m => m.sexo === 'HOMEM').length;
        const numNewWomen = unit.members.filter(m => m.sexo === 'MULHER').length;
        const numNewMesa = unit.members.filter(m => m.aptidoes?.includes('Prioridade Mesa')).length;
        const numNewN3Men = unit.members.filter(m => m.sexo === 'HOMEM' && m.nivel_experiencia === 3).length;

        // Atualizar estatísticas locais
        shiftStats.count += unit.members.length;
        shiftStats.men += numNewMen;
        shiftStats.women += numNewWomen;
        shiftStats.mesa += numNewMesa;
        shiftStats.n3men += numNewN3Men;

        const dia = diasMap.get(date)!;
        const cultoAlvo = shift === 'manha' ? dia.manha : dia.noite;
        if (cultoAlvo) {
            unit.members.forEach(m => m.pool_cultos_ids!.add(cultoAlvo.id));
            unit.assignedShifts[date] = shift;
        }
    };

    // Ordenar Unidades: mais restritas primeiro
    const getUnitPriority = (u: SchedulingUnit): number => {
        const hasMesa = u.members.some(m => m.aptidoes?.includes('Prioridade Mesa'));
        if (hasMesa) return 1;
        if (u.sharedFreq === 1) return 2;
        if (u.sharedFreq === 2) return 3;
        return 4;
    };

    const getUnitLevel = (u: SchedulingUnit) => Math.min(...u.members.map(m => m.nivel_experiencia || 1));
    const sortSmart = (a: SchedulingUnit, b: SchedulingUnit) => getUnitLevel(a) - getUnitLevel(b);

    const sortedUnits = [...units].sort((a, b) => {
        const prioA = getUnitPriority(a);
        const prioB = getUnitPriority(b);
        if (prioA !== prioB) return prioA - prioB;
        return sortSmart(a, b);
    });

    console.log(`   👥 Unidades ordenadas para alocação inteligente.`);

    // Loop de Alocação
    for (const u of sortedUnits) {
        const numRequiredSundays = u.sharedFreq;
        const sundayScores: { date: string, shift: 'manha' | 'noite', score: number }[] = [];

        for (const date of datasOrdenadas) {
            if (u.preferredShift === 'qualquer') {
                const scoreManha = calculateShiftScore(u, date, 'manha');
                const scoreNoite = calculateShiftScore(u, date, 'noite');
                if (scoreManha > -900) sundayScores.push({ date, shift: 'manha', score: scoreManha });
                if (scoreNoite > -900) sundayScores.push({ date, shift: 'noite', score: scoreNoite });
            } else {
                const score = calculateShiftScore(u, date, u.preferredShift);
                if (score > -900) sundayScores.push({ date, shift: u.preferredShift, score });
            }
        }

        sundayScores.sort((a, b) => b.score - a.score);

        const chosenDays = new Set<string>();
        let allocatedCount = 0;

        for (const option of sundayScores) {
            if (allocatedCount >= numRequiredSundays) break;
            if (chosenDays.has(option.date)) continue;

            assignUnitToDateShift(u, option.date, option.shift);
            chosenDays.add(option.date);
            allocatedCount++;
        }
    }

    // Distribuir Surplus (Dias extras individuais)
    const surplusCandidates: { member: MembroComHistorico, count: number }[] = [];
    units.forEach(u => {
        if (u.surplusMember && u.surplusFreq && u.surplusFreq > 0) {
            surplusCandidates.push({ member: u.surplusMember, count: u.surplusFreq });
        }
    });

    for (const cand of surplusCandidates) {
        for (let i = 0; i < cand.count; i++) {
            const tempUnit: SchedulingUnit = {
                members: [cand.member],
                type: 'solteiro',
                sharedFreq: 1,
                preferredShift: cand.member.melhor_periodo_domingo?.toLowerCase().includes('manhã') ? 'manha' : (cand.member.melhor_periodo_domingo?.toLowerCase().includes('noite') ? 'noite' : 'qualquer'),
                assignedShifts: {}
            };

            const sundayScores: { date: string, shift: 'manha' | 'noite', score: number }[] = [];
            for (const date of datasOrdenadas) {
                const alreadyOnDate = cand.member.pool_cultos_ids!.has(diasMap.get(date)?.manha?.id || '') || 
                                      cand.member.pool_cultos_ids!.has(diasMap.get(date)?.noite?.id || '');
                if (alreadyOnDate) continue;

                if (tempUnit.preferredShift === 'qualquer') {
                    const scoreManha = calculateShiftScore(tempUnit, date, 'manha');
                    const scoreNoite = calculateShiftScore(tempUnit, date, 'noite');
                    if (scoreManha > -900) sundayScores.push({ date, shift: 'manha', score: scoreManha });
                    if (scoreNoite > -900) sundayScores.push({ date, shift: 'noite', score: scoreNoite });
                } else {
                    const score = calculateShiftScore(tempUnit, date, tempUnit.preferredShift);
                    if (score > -900) sundayScores.push({ date, shift: tempUnit.preferredShift, score });
                }
            }

            sundayScores.sort((a, b) => b.score - a.score);
            if (sundayScores.length > 0) {
                assignUnitToDateShift(tempUnit, sundayScores[0].date, sundayScores[0].shift);
            }
        }
    }

    // Log final de ocupação
    console.log(`   📊 Ocupação final dos domingos:`);
    datasOrdenadas.forEach(d => {
        const stats = poolStats.get(d)!;
        console.log(`      ${d}: Manhã=${stats.manha.count} (H:${stats.manha.men}, M:${stats.manha.women}, Mesa:${stats.manha.mesa}) | Noite=${stats.noite.count} (H:${stats.noite.men}, M:${stats.noite.women}, Mesa:${stats.noite.mesa})`);
    });
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

export function sincronizarMembrosMesa(
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

/**
 * Ajusta o tamanho dos pools de cada culto para garantir que fique entre minLimit e maxLimit.
 */
interface AdjustUnit {
    members: MembroComHistorico[];
    type: 'casal' | 'solteiro';
}

function getAdjustUnits(membros: MembroComHistorico[]): AdjustUnit[] {
    const units: AdjustUnit[] = [];
    const processados = new Set<string>();

    for (const mPrincipal of membros) {
        if (processados.has(mPrincipal.id)) continue;

        let membersList = [mPrincipal];
        let type: 'casal' | 'solteiro' = 'solteiro';

        if (mPrincipal.nome_conjuge) {
            const nomeConjugeClean = mPrincipal.nome_conjuge.trim().toLowerCase();
            const conjuge = membros.find(m => {
                if (m.id === mPrincipal.id) return false;
                const match1 = m.nome_completo.toLowerCase().includes(nomeConjugeClean);
                const mNomeConjugeClean = m.nome_conjuge ? m.nome_conjuge.trim().toLowerCase() : '';
                const match2 = mNomeConjugeClean && mPrincipal.nome_completo.toLowerCase().includes(mNomeConjugeClean);
                return match1 && match2;
            });
            if (conjuge) {
                membersList.push(conjuge);
                type = 'casal';
                processados.add(conjuge.id);
            }
        }
        processados.add(mPrincipal.id);

        units.push({
            members: membersList,
            type
        });
    }
    return units;
}

/**
 * Ajusta o tamanho dos pools de cada culto para garantir que fique entre minLimit e maxLimit.
 * Opera em unidades de agendamento (casais/solteiros) para evitar separar casais.
 */
export function ajustarTamanhoPools(
    membros: MembroComHistorico[],
    cultos: Culto[],
    minLimit: number,
    maxLimit: number
): void {
    console.log(`   ⚖️ Ajustando tamanho dos pools por Unidade para Min: ${minLimit}, Max: ${maxLimit}...`);

    const units = getAdjustUnits(membros);

    for (const culto of cultos) {
        // Obter tamanho atual do pool (membros comuns)
        let getPoolCount = () => membros.filter(m => m.pool_cultos_ids!.has(culto.id) && m.nivel_experiencia !== 5).length;

        let currentCount = getPoolCount();

        if (currentCount > maxLimit) {
            // Filtrar unidades que estão neste pool e podem ser removidas (sem N5, sem Mesa)
            const candidatosRemocao = units.filter(u => {
                const noPool = u.members.every(m => m.pool_cultos_ids!.has(culto.id));
                if (!noPool) return false;

                const hasN5 = u.members.some(m => m.nivel_experiencia === 5);
                const hasMesa = u.members.some(m => m.aptidoes?.includes('Prioridade Mesa'));
                return !hasN5 && !hasMesa;
            });

            // Ordenar por unidades que servem mais no mês
            candidatosRemocao.sort((a, b) => {
                const sizeA = Math.max(...a.members.map(m => m.pool_cultos_ids!.size));
                const sizeB = Math.max(...b.members.map(m => m.pool_cultos_ids!.size));
                return sizeB - sizeA;
            });

            let removidos = 0;
            for (const u of candidatosRemocao) {
                if (getPoolCount() <= maxLimit) break;
                u.members.forEach(m => m.pool_cultos_ids!.delete(culto.id));
                removidos += u.members.length;
            }
            console.log(`      🔴 Culto ${culto.data_culto.split('T')[0]}: Removidos ${removidos} membros comuns. Novo total: ${getPoolCount()}`);
        } else if (currentCount < minLimit) {
            // Filtrar unidades que NÃO estão neste pool e podem ser adicionadas (sem N5)
            const candidatosAdicao = units.filter(u => {
                const hasN5 = u.members.some(m => m.nivel_experiencia === 5);
                if (hasN5) return false;

                const alreadyInPool = u.members.some(m => m.pool_cultos_ids!.has(culto.id));
                if (alreadyInPool) return false;

                // Todos os membros da unidade devem estar disponíveis para este dia
                const dispOk = u.members.every(m => {
                    const dispText = culto.periodo === 'quinta' ? m.disponibilidade_quinta : m.disponibilidade_domingo;
                    const { disponivel } = parseDisponibilidade(dispText);
                    if (!disponivel) return false;
                    if (culto.periodo.startsWith('domingo') && !atendePeriodo(m.melhor_periodo_domingo, culto.periodo)) return false;
                    return true;
                });

                return dispOk;
            });

            // Ordenar por unidades que servem menos no mês
            candidatosAdicao.sort((a, b) => {
                const sizeA = Math.min(...a.members.map(m => m.pool_cultos_ids!.size));
                const sizeB = Math.min(...b.members.map(m => m.pool_cultos_ids!.size));
                return sizeA - sizeB;
            });

            let adicionados = 0;
            for (const u of candidatosAdicao) {
                if (getPoolCount() >= minLimit) break;
                u.members.forEach(m => m.pool_cultos_ids!.add(culto.id));
                adicionados += u.members.length;
            }
            console.log(`      🟢 Culto ${culto.data_culto.split('T')[0]}: Adicionados ${adicionados} membros comuns. Novo total: ${getPoolCount()}`);
        }
    }
}

// ============================================
// ORQUESTRADOR PRINCIPAL
// ============================================

// ID da função "Pool Diário"
const POOL_DIARIO_ID = 'd4b4adb8-07e3-4f66-880c-46737b76874a';

export async function gerarEscalaMensal(
    mes: number,
    ano: number
): Promise<any> {
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



    // FASE 1.7: AJUSTE DO TAMANHO DO POOL (MÍNIMO 20, MÁXIMO 30)
    ajustarTamanhoPools(membrosQuinta, quintas, 20, 30);
    ajustarTamanhoPools(membrosDomingo, domingos, 20, 30);

    // FASE 2: SALVAR POOL (SEMPRE)
    // ============================================
    // Salva a lista de disponíveis antes de alocar.
    // Isso garante que o frontend possa mostrar "Quem estava no banco" mesmo com alocação feita.

    console.log(`\n🛑 SALVANDO POOL (Membros disponíveis antes da alocação)...`);

    for (const culto of cultos) {
        // 1. Identificar membros no pool deste culto (exclui N5)
        const listSet = culto.periodo === 'quinta' ? membrosQuinta : membrosDomingo;
        const membrosNoPool = listSet.filter(m => m.pool_cultos_ids!.has(culto.id) && m.nivel_experiencia !== 5);

        if (membrosNoPool.length === 0) continue;

        // 2. Limpar APENAS o Pool anterior (para evitar duplicatas de pool)
        // OBS: limparAlocacoesAnteriores (na fase 3) NÃO deleta o pool.
        await supabase
            .from('escalas_alocacoes')
            .delete()
            .eq('culto_id', culto.id)
            .eq('funcao_id', POOL_DIARIO_ID);

        // 3. Salvar como "Pool Diário"
        const inserts = membrosNoPool.map(m => ({
            culto_id: culto.id,
            membro_id: m.id,
            funcao_id: POOL_DIARIO_ID
        }));

        const { error: errIns } = await supabase.from('escalas_alocacoes').insert(inserts);

        if (errIns) console.error(`      ❌ Erro ao salvar pool ${culto.data_culto}: ${errIns.message}`);
        else console.log(`      ✅ ${inserts.length} membros no Pool de ${culto.data_culto}.`);
    }

    console.log(`\n✅ Pool Mensal salvo!`);

    // ============================================
    // FASE 3: GERAR ESCALAS DIÁRIAS AUTOMATICAMENTE
    // ============================================
    // Agora que o Pool de cada culto está salvo no banco,
    // chamamos gerarEscalaParaCulto que detecta o Pool e
    // usa APENAS os membros do pool para alocar nas funções.
    console.log(`\n📋 Fase 3: Gerando escalas diárias automáticas com o Pool...`);

    const { gerarEscalaParaCulto } = await import('./escala.js');

    let escalasGeradas = 0;
    let escalasComErro = 0;

    for (const culto of cultos) {
        try {
            const resultado = await gerarEscalaParaCulto(culto.id);
            console.log(`      ✅ ${culto.data_culto} (${culto.periodo}): ${resultado.vagas_preenchidas} preenchidas, ${resultado.vagas_vazias} vazias`);
            escalasGeradas++;
        } catch (err: any) {
            console.error(`      ❌ Erro em ${culto.data_culto}: ${err.message}`);
            escalasComErro++;
        }
    }

    console.log(`\n✅ Geração Mensal Completa! ${escalasGeradas} escalas geradas, ${escalasComErro} erros.`);
    return { success: true, mes, ano, escalas_geradas: escalasGeradas, escalas_com_erro: escalasComErro };
}
