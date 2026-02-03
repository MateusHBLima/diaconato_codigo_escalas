
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
    // Ordenar por nível (1->4) para priorizar "operários" (Level 1-3) nas funções básicas
    const grupo2x = [...membrosSemN5.filter(m => m.limite_mes === 2)]
        .sort((a, b) => (a.nivel_experiencia || 1) - (b.nivel_experiencia || 1) || (a.nome_completo || '').localeCompare(b.nome_completo || ''));
    const grupo1x = [...membrosSemN5.filter(m => m.limite_mes === 1)]
        .sort((a, b) => (a.nivel_experiencia || 1) - (b.nivel_experiencia || 1) || (a.nome_completo || '').localeCompare(b.nome_completo || ''));

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
    // GRUPO N5: Líderes vão em TODAS as quintas disponíveis
    // ============================================
    for (const m of membrosN5) {
        if (Q1) { m.pool_cultos_ids!.add(Q1.id); ocupacao.set(Q1.id, (ocupacao.get(Q1.id) || 0) + 1); }
        if (Q2) { m.pool_cultos_ids!.add(Q2.id); ocupacao.set(Q2.id, (ocupacao.get(Q2.id) || 0) + 1); }
        if (Q3) { m.pool_cultos_ids!.add(Q3.id); ocupacao.set(Q3.id, (ocupacao.get(Q3.id) || 0) + 1); }
        if (Q4) { m.pool_cultos_ids!.add(Q4.id); ocupacao.set(Q4.id, (ocupacao.get(Q4.id) || 0) + 1); }
        if (Q5) { m.pool_cultos_ids!.add(Q5.id); ocupacao.set(Q5.id, (ocupacao.get(Q5.id) || 0) + 1); }
    }
    console.log(`   ✅ N5: ${membrosN5.length} membros alocados em TODAS as quintas`);

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

    // ============================================
    // GRUPO B: Primeiros 2x vão em Q1 + Q3 (espelho)
    // CORREÇÃO: "Smart Selection" - Priorizar quem preenche lacunas (Homem p/ Hall, Mulher p/ Apoio)
    // ============================================

    // Separar 2x por gênero
    const mulheres2x = grupo2x.filter(m => m.sexo === 'MULHER');
    const homens2x = grupo2x.filter(m => m.sexo === 'HOMEM');

    console.log(`   👥 2x disponíveis: ${mulheres2x.length} mulheres, ${homens2x.length} homens`);

    // Calcular composição ideal do grupo 2x para Q1
    // Sabendo que 3x já preenche parte, vamos garantir equilibrio no complemento
    // Ideal: pegar metade dos 2x disponíveis, mas garantindo mínimos

    // Calibrar Q1 (Balanceamento)
    // Se usarmos TODOS os 2x em Q1, Q2 morre.
    // Vamos definir um ALVO seguro para Q1 (ex: 45 pessoas ou Deficit do 3x + buffer)

    // Total de 3x em Q1
    const count3x = grupo3x.length;
    // N5 já está lá
    const countN5 = membrosN5.length;

    // Meta Ideal Q1 = 45 (Hall Cheio + Apoio + Escala Completa)
    const TARGET_Q1 = 45;
    const currentQ1 = count3x + countN5;
    const deficitQ1 = Math.max(0, TARGET_Q1 - currentQ1);

    console.log(`   ⚖️ Balanceamento Q1: 3x+N5=${currentQ1}, Meta=${TARGET_Q1}, Deficit=${deficitQ1}`);

    // Pegar apenas o necessário dos 2x para cobrir o deficit
    // Manter proporção Homem/Mulher
    const metaMulheres = Math.min(mulheres2x.length, Math.ceil(deficitQ1 / 2) + 2); // +2 Buffer
    const metaHomens = Math.min(homens2x.length, Math.ceil(deficitQ1 / 2) + 2);     // +2 Buffer

    // ... (rest of filtering logic) ...

    const grupo2x_Q1Q3: typeof grupo2x = [];

    // Pegar mulheres (Prioridade: Nível baixo primeiro - já ordenado)
    for (let i = 0; i < metaMulheres; i++) grupo2x_Q1Q3.push(mulheres2x.shift()!);
    // Pegar homens
    for (let i = 0; i < metaHomens; i++) grupo2x_Q1Q3.push(homens2x.shift()!);

    // Completar até atingir deficit se sobrar gente e faltar numero
    const sobras = [...mulheres2x, ...homens2x];
    while (grupo2x_Q1Q3.length < deficitQ1 && sobras.length > 0) {
        grupo2x_Q1Q3.push(sobras.shift()!);
    }

    const grupo2x_intercalado = sobras; // O restante VAI PARA Q2/Q4

    console.log(`   ✅ 2x Distribuídos: ${grupo2x_Q1Q3.length} para Q1/Q3, ${grupo2x_intercalado.length} para Q2/Q4`);

    // Loop de alocação (Q1/Q3)
    for (const m of grupo2x_Q1Q3) {
        if (Q1) { m.pool_cultos_ids!.add(Q1.id); ocupacao.set(Q1.id, (ocupacao.get(Q1.id) || 0) + 1); }
        if (Q3) { m.pool_cultos_ids!.add(Q3.id); ocupacao.set(Q3.id, (ocupacao.get(Q3.id) || 0) + 1); }
    }

    // ============================================
    // GRUPO C: Próximos 2x vão em Q2 + Q4 (espelho)
    // ============================================
    // Se Q2/Q4 estiver muito vazio, 1x vai completar depois.
    const grupo2x_Q2Q4 = grupo2x_intercalado; // PEGA TUDO QUE SOBROU DOS 2x

    for (const m of grupo2x_Q2Q4) {
        if (Q2) { m.pool_cultos_ids!.add(Q2.id); ocupacao.set(Q2.id, (ocupacao.get(Q2.id) || 0) + 1); }
        if (Q4) { m.pool_cultos_ids!.add(Q4.id); ocupacao.set(Q4.id, (ocupacao.get(Q4.id) || 0) + 1); }
    }
    console.log(`   ✅ 2x (Q2=Q4): ${grupo2x_Q2Q4.length} membros alocados`);

    // ... (rest of logic 2x restante - not needed really if we took all) ...

    // ============================================
    // GRUPO E: 1x vão para QUALQUER quinta abaixo do mínimo
    // PRIORIZAR Q2/Q4/Q5 se estiverem vazios
    // ============================================
    for (const m of grupo1x) {
        // Encontrar a quinta com MENOR ocupação
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

    // Função para contar ocupação por Culto ID (Defined Early)
    const getOccupancy = (cultoId: string) => {
        let count = 0;
        membros.forEach(m => {
            if (m.pool_cultos_ids!.has(cultoId)) count++;
        });
        return count;
    };

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
            const conjuge = membros.find(m =>
                m.id !== mPrincipal.id &&
                m.nome_completo.toLowerCase().includes(nomeConjugeClean)
            );
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
        // else mantem 'qualquer'

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

    // Ordenar Unidades: 2x e 1x precisam de Smart Selection (Nível baixo primeiro)
    // Para casais, usamos o MENOR nível da dupla
    const getUnitLevel = (u: SchedulingUnit) => Math.min(...u.members.map(m => m.nivel_experiencia || 1));
    const sortSmart = (a: SchedulingUnit, b: SchedulingUnit) => getUnitLevel(a) - getUnitLevel(b);

    // Separar por Shared Frequency
    const units3x = units.filter(u => u.sharedFreq >= 3);
    const units2x = units.filter(u => u.sharedFreq === 2).sort(sortSmart);
    const units1x = units.filter(u => u.sharedFreq === 1).sort(sortSmart);

    console.log(`   👥 Unidades: 3x=${units3x.length}, 2x=${units2x.length}, 1x=${units1x.length}`);

    // Helper: Atribuir Unidade a um Dia Específico
    const assignToDay = (unit: SchedulingUnit, dataBase: string, forceShift?: 'manha' | 'noite') => {
        if (!dataBase) return;
        const dia = diasMap.get(dataBase);
        if (!dia) return;

        // Decidir turno
        let turno: 'manha' | 'noite' = 'noite'; // default

        // Se forçado, obedece
        if (forceShift) {
            turno = forceShift;
        }
        // Se tem preferência explicita (não 'qualquer'), obedece
        else if (unit.preferredShift !== 'qualquer') {
            turno = unit.preferredShift;
        }
        // Se 'qualquer', faz balanceamento de carga
        else {
            const countManha = dia.manha ? getOccupancy(dia.manha.id) : Infinity;
            const countNoite = dia.noite ? getOccupancy(dia.noite.id) : Infinity;

            if (countManha <= countNoite && dia.manha) {
                turno = 'manha';
            } else {
                turno = 'noite';
            }
        }

        const cultoAlvo = turno === 'manha' ? dia.manha : dia.noite;
        if (cultoAlvo) {
            unit.members.forEach(m => m.pool_cultos_ids!.add(cultoAlvo.id));
            unit.assignedShifts[dataBase] = turno;
        }
    };

    // ============================================
    // PASSO A: 3x (D1, D2, D3)
    // ============================================
    // DICA: Sort por "Sobrenome" ou algo aleatório para não enviesar o balanceamento
    // (Se ordenamos por ID, os primeiros sempre pegam Manhã se estiver vazio)
    // Vamos manter como está por enquanto.

    for (const u of units3x) {
        assignToDay(u, D1_Data);
        assignToDay(u, D2_Data);
        assignToDay(u, D3_Data);
    }
    console.log(`   ✅ 3x: ${units3x.length} unidades distribuídas`);

    // ============================================
    // PASSO B: 2x Grupo A (D1 + D3) - Espelho
    // ============================================
    // Pegar 50% das unidades 2x
    const metade = Math.ceil(units2x.length / 2);
    const group2xA = units2x.splice(0, metade);

    for (const u of group2xA) {
        // D1
        assignToDay(u, D1_Data);
        // Ler turno que foi decidido em D1
        const shiftD1 = u.assignedShifts[D1_Data];
        // Forçar mesmo turno em D3
        assignToDay(u, D3_Data, shiftD1);
    }
    console.log(`   ✅ 2x (Espelho A D1=D3): ${group2xA.length} unidades`);

    // ============================================
    // PASSO C: 2x Grupo B (D2 + D4, ou sobras)
    // ============================================
    const group2xB = units2x; // O restante
    for (const u of group2xB) {
        if (D2_Data && D4_Data) {
            assignToDay(u, D2_Data);
            const shiftD2 = u.assignedShifts[D2_Data];
            assignToDay(u, D4_Data, shiftD2);
        } else if (D2_Data) {
            assignToDay(u, D2_Data);
        }
    }
    console.log(`   ✅ 2x (Espelho B D2=D4): ${group2xB.length} unidades`);


    // ============================================
    // PASSO D: SURPLUS (Dias extras individuais)
    // ============================================
    // Logica: Tentar preencher buracos lógicos ou próximo espelho
    // Simplificando: Se grupo A (D1, D3) e tem surplus, joga no D2. Se B (D2, D4), joga no D1 ou D5.
    // Vamos usar uma abordagem de "Tapa Buraco Global" para o surplus
    const surplusCandidates: { member: MembroComHistorico, count: number }[] = [];
    units.forEach(u => {
        if (u.surplusMember && u.surplusFreq && u.surplusFreq > 0) {
            surplusCandidates.push({ member: u.surplusMember, count: u.surplusFreq });
        }
    });

    // Função para contar ocupação por Culto ID (Defined Early - REMOVED from here)

    // Distribuir Surplus
    for (const cand of surplusCandidates) {
        for (let i = 0; i < cand.count; i++) {
            // Achar culto com menor ocupação que o membro AINDA NÃO esteja
            let bestCulto: Culto | null = null;
            let minOcc = Infinity;

            cultosDomingo.forEach(c => {
                if (cand.member.pool_cultos_ids!.has(c.id)) return; // Já está lá
                const occ = getOccupancy(c.id);
                if (occ < minOcc) {
                    minOcc = occ;
                    bestCulto = c;
                }
            });

            if (bestCulto) {
                cand.member.pool_cultos_ids!.add((bestCulto as Culto).id);
            }
        }
    }

    // ============================================
    // PASSO E: 1x (Global Balance)
    // ============================================
    for (const u of units1x) {
        // Achar DATA/TURNO com menor ocupação média
        // Simplificação: Iterar todos os cultos e jogar no menor
        let bestCulto: Culto | null = null;
        let minOcc = Infinity;

        cultosDomingo.forEach(c => {
            const occ = getOccupancy(c.id);
            if (occ < minOcc) {
                minOcc = occ;
                bestCulto = c;
            }
        });

        if (bestCulto) {
            u.members.forEach(m => m.pool_cultos_ids!.add((bestCulto as Culto).id));
        }
    }

    console.log(`   ✅ Domingos distribuídos com lógica de Espelho + Turnos`);
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
