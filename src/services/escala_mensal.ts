
import { supabase } from '../config/supabase.js';
import {
    parseDisponibilidade,
    atendePeriodo,
    atendeGenero
} from './parser.js';
import type { Membro, Funcao, Culto, Alocacao, ResultadoEscala } from '../types/index.js';
import { podeExecutarFuncao, getNivelExigidoParaFuncao } from './rules/StarSystem.js';
import { buscarRegraDetalhada } from './rules/RepetitionRules.js';
import { ordenarFuncoesPorProcessamento } from './rules/ProcessingOrder.js';
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

async function buscarFuncoesAtivas(isSantaCeia: boolean): Promise<Funcao[]> {
    let query = supabase
        .from('funcoes')
        .select('*')
        .eq('ativo', true)
        .order('ordem_exibicao', { ascending: true });

    if (!isSantaCeia) {
        query = query.eq('is_santa_ceia', false);
    }
    const { data } = await query;
    return data || [];
}

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

    return membros.map(membro => {
        const dispTexto = periodo === 'quinta'
            ? membro.disponibilidade_quinta
            : membro.disponibilidade_domingo;
        const { vezesPorMes } = parseDisponibilidade(dispTexto);

        return {
            ...membro,
            escalas_no_mes: 0,
            limite_mes: vezesPorMes,
            pool_cultos_ids: new Set()
        };
    });
}

// ============================================
// FASE 1: DISTRIBUIÇÃO ESTRATÉGICA (PRESENÇA)
// ============================================

function distribuirPresencaQuintas(
    membros: MembroComHistorico[],
    cultos: Culto[]
): void {
    // Ordenar cultos cronologicamente
    const cultosOrdenados = [...cultos].sort((a, b) => a.data_culto.localeCompare(b.data_culto));

    // Preparar contadores para balanceamento (cultoId -> count)
    const ocupacao = new Map<string, number>();
    cultosOrdenados.forEach(c => ocupacao.set(c.id, 0));

    // Separar grupos por frequência
    const grupo3x = membros.filter(m => m.limite_mes >= 3);
    const grupo2x = membros.filter(m => m.limite_mes === 2);
    const grupo1x = membros.filter(m => m.limite_mes === 1);

    // 1. Grupo 3x: Quintas 1, 2 e 3 (Rígido)
    for (const m of grupo3x) {
        for (let i = 0; i < 3 && i < cultosOrdenados.length; i++) {
            const c = cultosOrdenados[i];
            m.pool_cultos_ids!.add(c.id);
            ocupacao.set(c.id, (ocupacao.get(c.id) || 0) + 1);
        }
    }

    // 2. Grupo 2x: Alternância Balanceada (Impar vs Par)
    // Definir sets
    const quintasImpares: Culto[] = []; // 1ª, 3ª, 5ª...
    const quintasPares: Culto[] = [];   // 2ª, 4ª...
    let totalImpar = 0;
    let totalPar = 0;

    cultosOrdenados.forEach((c, idx) => {
        if (idx % 2 === 0) { // Index 0 é a 1ª (impar na contagem humana)
            quintasImpares.push(c);
            totalImpar += ocupacao.get(c.id) || 0;
        } else {
            quintasPares.push(c);
            totalPar += ocupacao.get(c.id) || 0;
        }
    });

    for (const m of grupo2x) {
        // Escolher lado com MENOS pessoas
        let alvos: Culto[] = [];
        if (totalImpar <= totalPar) {
            alvos = quintasImpares;
            totalImpar++; // Incrementa estimativa p/ próximo
        } else {
            alvos = quintasPares;
            totalPar++;
        }

        alvos.forEach(c => {
            m.pool_cultos_ids!.add(c.id);
            ocupacao.set(c.id, (ocupacao.get(c.id) || 0) + 1);
        });
    }

    // 3. Grupo 1x: Tapa-Buraco (Menor Absoluto)
    for (const m of grupo1x) {
        // Achar o culto com menor ocupação
        let menorCulto = cultosOrdenados[0];
        let menorCount = ocupacao.get(menorCulto.id) || 999;

        for (const c of cultosOrdenados) {
            const count = ocupacao.get(c.id) || 0;
            if (count < menorCount) {
                menorCount = count;
                menorCulto = c;
            }
        }

        m.pool_cultos_ids!.add(menorCulto.id);
        ocupacao.set(menorCulto.id, menorCount + 1);
    }
}

function distribuirPresencaDomingos(
    membros: MembroComHistorico[], // Lista completa
    cultosDomingo: Culto[]
): void {
    // 1. Agrupar cultos por Data Lógica de Domingo (para frequencia 3x/2x)
    // Map: '2026-01-05' -> [CultoManha, CultoNoite]
    const diasMap = new Map<string, Culto[]>();
    cultosDomingo.forEach(c => {
        const dataBase = c.data_culto.split('T')[0]; // YYYY-MM-DD
        if (!diasMap.has(dataBase)) diasMap.set(dataBase, []);
        diasMap.get(dataBase)!.push(c);
    });

    // Sort das datas para lógica 1ª, 2ª, 3ª semana
    const datasOrdenadas = Array.from(diasMap.keys()).sort();

    // 2. Identificar Casais e Solteiros
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

        // Definir par (ou single)
        const dupla = conjuge ? [mPrincipal, conjuge] : [mPrincipal];
        dupla.forEach(d => processados.add(d.id));

        // Calcular Limite da Dupla (o menor limite vence? Ou cada um tem seu limite?)
        // Regra geral diz "3x, 2x, 1x". Se um é 3x e outro 1x, complexo.
        // Assumindo limite do principal para simplificar a distribuição do casal.
        // Ou melhor: usar Math.min para garantir que vão juntos.
        const limite = Math.min(...dupla.map(d => d.limite_mes));

        // === PASSO A: Definir SEMANAS de presença (Frequência) ===
        const semanasAlvoIndices: number[] = []; // Indices 0, 1, 2...

        if (limite >= 3) {
            // 3 primeiras semanas
            semanasAlvoIndices.push(0, 1, 2);
        } else if (limite === 2) {
            // Alternado (Sim/Não). Balanceamento simples global (Count total de pessoas escaladas no dia)
            // Como otimização simples: Randomizar inicio ou usar ID par/impar para distribuir load
            // Usando par/impar do mês para determinismo
            // Se (mes + index) % 2 === 0...

            // Vamos balancear simples:
            // "Impares" (Semana 1, 3) vs "Pares" (Semana 2, 4)
            // Arbitrariamente: IDs terminados em par -> Pares.
            const isPar = mPrincipal.id.charCodeAt(mPrincipal.id.length - 1) % 2 === 0;
            if (isPar) {
                semanasAlvoIndices.push(1, 3); // Semanas 2 e 4
            } else {
                semanasAlvoIndices.push(0, 2); // Semanas 1 e 3
            }
        } else {
            // 1x -> Semana com menos gente? Vamos fixar na semana 3 ou 4 para preencher fim de mes
            semanasAlvoIndices.push(3); // Ultima semana (se houver) ou 1a
        }

        // === PASSO B: Definir PERÍODO (Manhã vs Noite) ===
        // Regra: Qualquer + Noite = Noite. Qualquer + Manha = Manha.
        // Regra Solteiro: Qualquer -> Noite.

        let periodoFinal: 'manha' | 'noite' = 'noite'; // Default

        const prefs = dupla.map(d => d.melhor_periodo_domingo?.toLowerCase() || 'qualquer');
        const temManha = prefs.some(p => p.includes('manhã'));
        const temNoite = prefs.some(p => p.includes('noite'));
        const soQualquer = prefs.every(p => p.includes('qualquer'));

        if (soQualquer) {
            periodoFinal = 'noite'; // Regra Solteiro/Casal Qualquer -> Noite
        } else if (temManha && !temNoite) {
            periodoFinal = 'manha';
        } else if (temNoite) {
            periodoFinal = 'noite'; // Noite vence (conforme "Any + Night = Night")
        }

        // === PASSO C: Aplicar aos cultos ===
        semanasAlvoIndices.forEach(idx => {
            if (idx >= datasOrdenadas.length) return;
            const dataAlvo = datasOrdenadas[idx];
            const cultosDoDia = diasMap.get(dataAlvo) || [];

            // Achar o culto alvo
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
// FASE 2: ALOCAÇÃO TÁTICA (DIÁRIA)
// ============================================

function gerarMotivoFalha(funcao: Funcao, periodoCulto: string): string {
    const motivos: string[] = [];
    if (funcao.especificidade_sexo !== 'Unissex') motivos.push(`exige ${funcao.especificidade_sexo.toLowerCase()}`);
    if (funcao.regras) motivos.push(`exige permissão ${funcao.regras}`);
    if (motivos.length === 0) return `Nenhum membro disponível para ${periodoCulto}`;
    return `Sem candidato: ${motivos.join(', ')}`;
}

function encontrarCandidatoRestrito(
    poolMembros: MembroComHistorico[], // JÁ FILTRADO PELA FASE 1
    funcao: Funcao,
    culto: Culto,
    membrosUsadosNoCulto: Set<string>,
    membroObrigatorioId?: string | null,
    numeroVaga: number = 0
): MembroComHistorico | null {

    const nomeFuncaoLower = funcao.nome.toLowerCase();

    // Verificação de permissão 'NECESSIDADE SENTADO'
    const membroPodeExecutar = (membro: MembroComHistorico): boolean => {
        if (membro.aptidoes?.includes('NECESSIDADE SENTADO')) {
            const ehCorrente = nomeFuncaoLower.includes('corrente');
            const setorPaiLower = funcao.setor_pai?.toLowerCase() || '';
            const ehSetorAzulOuLaranja = setorPaiLower.includes('azul') || setorPaiLower.includes('laranja');
            if (ehCorrente && ehSetorAzulOuLaranja) return true;
            return false;
        }
        return true;
    };

    if (membroObrigatorioId) {
        const membro = poolMembros.find(m => m.id === membroObrigatorioId);
        if (!membro) return null; // Membro não está no pool do dia? Falha crítica de repetição
        if (!membroPodeExecutar(membro)) return null;
        return membro;
    }

    const candidatos = poolMembros.filter(membro => {
        // 1. Filtro Básico (Já está no culto? etc)
        if (membrosUsadosNoCulto.has(membro.id) && funcao.regras !== 'REPETIR_PESSOA') return false;

        // 2. Aptidões
        if (nomeFuncaoLower.includes('mesa') && !membro.aptidoes?.includes('Prioridade Mesa')) return false;
        if (membro.aptidoes?.includes('NECESSIDADE SENTADO') && !membroPodeExecutar(membro)) return false;

        // 3. Sistema de Estrelas
        if (!podeExecutarFuncao(membro, funcao.nome, funcao.especificidade_sexo, funcao.setor_pai, numeroVaga)) return false;

        // 4. Gênero
        if (!atendeGenero(membro.sexo, funcao.especificidade_sexo)) return false;

        return true;
    });

    if (candidatos.length === 0) return null;

    // Classificação
    const nivelExigido = getNivelExigidoParaFuncao(funcao.nome);
    candidatos.sort((a, b) => {
        // 1. Nível
        const diffA = Math.abs((a.nivel_experiencia || 1) - nivelExigido);
        const diffB = Math.abs((b.nivel_experiencia || 1) - nivelExigido);
        if (diffA !== diffB) return diffA - diffB;

        // 2. Quem serviu menos no mês (Load balance)
        if (a.escalas_no_mes !== b.escalas_no_mes) return a.escalas_no_mes - b.escalas_no_mes;

        // 3. Quem serviu há mais tempo (Rodízio/Descanso) - NOVO PEDIDO
        const dataA = a.ultima_escala || '0000-00-00';
        const dataB = b.ultima_escala || '0000-00-00';
        return dataA.localeCompare(dataB); // Mais antigo vem primeiro
    });

    return candidatos[0];
}

async function alocarResponsaveisGerais(
    cultos: Culto[]
): Promise<Map<string, { r1: string, r2: string }>> {
    // Buscar Líderes Nível 5
    const { data: lideres } = await supabase.from('membros').select('*').eq('nivel_experiencia', 5).eq('ativo', true);
    if (!lideres || lideres.length === 0) return new Map();

    const mapaAlocacao = new Map<string, { r1: string, r2: string }>();

    // Identificar casais de líderes
    const casais: Array<{ l1: Membro, l2: Membro }> = [];
    const processados = new Set<string>();

    // Ordenar para rodízio determinístico
    lideres.sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));

    for (const l of lideres) {
        if (processados.has(l.id)) continue;
        const conjuge = lideres.find(c => c.id !== l.id && c.nome_completo.includes(l.nome_conjuge || 'XYZW'));

        if (conjuge) {
            casais.push({ l1: l, l2: conjuge });
            processados.add(l.id);
            processados.add(conjuge.id);
        } else {
            // Líder solteiro? Tratar como casal fake pra rotação ou ignorar?
            // Regra do legado: "Sempre um casal". Vamos ignorar solteiros por ora ou pareá-los
        }
    }

    // Rodízio simples
    let index = 0;
    for (const c of cultos) {
        if (casais.length === 0) break;
        const casal = casais[index % casais.length];

        // Salvar no DB direto (datas_cultos)
        await supabase.from('datas_cultos').update({
            responsavel_geral_1_id: casal.l1.id,
            responsavel_geral_2_id: casal.l2.id
        }).eq('id', c.id);

        mapaAlocacao.set(c.id, { r1: casal.l1.id, r2: casal.l2.id });
        index++;
    }

    return mapaAlocacao;
}

// ============================================
// ORQUESTRADOR PRINCIPAL
// ============================================

export async function gerarEscalaMensal(mes: number, ano: number) {
    console.log(`\n🚀 INICIANDO GERAÇÃO (FASE 1+2): ${mes}/${ano}`);

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

    // FASE 2: ALOCAÇÃO TÁTICA
    console.log(`\n🧩 Fase 2: Alocação Tática`);

    // A. Responsáveis Gerais (Rotação)
    const lideresMap = await alocarResponsaveisGerais(cultos);

    const alocacoesTotais: Omit<Alocacao, 'id'>[] = [];
    const resultadosPorCulto: ResultadoEscala[] = [];

    // Processar TODOS os cultos
    for (const culto of cultos) {
        console.log(`   > Processando ${culto.nome_culto} (${culto.data_culto})`);

        // 1. Definir Pool do Dia
        const listSet = culto.periodo === 'quinta' ? membrosQuinta : membrosDomingo;
        const poolDoDia = listSet.filter(m => m.pool_cultos_ids!.has(culto.id));

        // Remover Responsáveis Gerais do Pool (já estão alocados)
        const lideres = lideresMap.get(culto.id);
        const poolFiltrado = poolDoDia.filter(m => m.id !== lideres?.r1 && m.id !== lideres?.r2);

        // 2. Carregar Funções
        const funcoes = await buscarFuncoesAtivas(culto.is_santa_ceia);
        const funcoesOrdenadas = ordenarFuncoesPorProcessamento(funcoes);

        const alocacoesCulto: Omit<Alocacao, 'id'>[] = [];
        const membrosUsadosNesteCulto = new Set<string>();
        const quemEstaOnde = new Map<string, string[]>();

        let vagasP = 0, vagasV = 0;

        for (const funcao of funcoesOrdenadas) {
            const ocupantesFuncao: string[] = [];
            for (let i = 0; i < funcao.quantidade_pessoas; i++) {

                // Lógica de Repetição (Simplificada do legado)
                let membroObrigatorioId: string | null = null;
                const regraDetalhada = buscarRegraDetalhada(funcao.nome, funcao.setor_pai);
                if (regraDetalhada) {
                    const mapping = regraDetalhada.mapeamento.find(m => m.vagaDestino === i);
                    if (mapping) {
                        // Buscar fonte no mapa local
                        for (const [chave, ocupantes] of quemEstaOnde.entries()) {
                            if (chave.toLowerCase().includes(mapping.fontePattern.toLowerCase())) {
                                const cand = ocupantes[mapping.vagaFonte];
                                if (cand && cand !== 'VAZIO') {
                                    membroObrigatorioId = cand;
                                    break;
                                }
                            }
                        }
                    }
                }

                // Lógica Oferta (Líderes)
                if (!membroObrigatorioId && funcao.setor_pai?.toLowerCase().includes('oferta')) {
                    if (i === 0 && lideres?.r1) membroObrigatorioId = lideres.r1;
                    else if (i === 1 && lideres?.r2) membroObrigatorioId = lideres.r2;
                }

                // BUSCAR CANDIDATO (Somente no Pool Filtrado!)
                const candidato = encontrarCandidatoRestrito(
                    poolFiltrado,
                    funcao,
                    culto,
                    membrosUsadosNesteCulto,
                    membroObrigatorioId,
                    i
                );

                if (candidato) {
                    if (!membroObrigatorioId) {
                        membrosUsadosNesteCulto.add(candidato.id);
                        // Atualizar stats NO OBJETO ORIGINAL DA LISTA COMPLETA 
                        // (para o sort de rodízio funcionar nos próximos dias)
                        candidato.escalas_no_mes++;
                        candidato.ultima_escala = culto.data_culto;
                    }
                    alocacoesCulto.push({
                        culto_id: culto.id,
                        funcao_id: funcao.id,
                        membro_id: candidato.id,
                        status: 'ALOCADO',
                        motivo_falha: null
                    });
                    ocupantesFuncao.push(candidato.id);
                    vagasP++;
                } else {
                    alocacoesCulto.push({
                        culto_id: culto.id,
                        funcao_id: funcao.id,
                        membro_id: null,
                        status: 'SEM_CANDIDATO',
                        motivo_falha: gerarMotivoFalha(funcao, culto.periodo)
                    });
                    ocupantesFuncao.push('VAZIO');
                    vagasV++;
                }
            }
            quemEstaOnde.set(`${funcao.nome}|${funcao.setor_pai}`, ocupantesFuncao);
        }
        alocacoesTotais.push(...alocacoesCulto);
        resultadosPorCulto.push({
            culto_id: culto.id,
            alocacoes: alocacoesCulto as any,
            vagas_preenchidas: vagasP,
            vagas_vazias: vagasV
        });
    }

    // SALVAR
    console.log(`\n💾 Salvando ${alocacoesTotais.length} alocações...`);
    await salvarAlocacoes(alocacoesTotais);

    return {
        success: true,
        mes,
        ano,
        resultados: resultadosPorCulto
    };
}
