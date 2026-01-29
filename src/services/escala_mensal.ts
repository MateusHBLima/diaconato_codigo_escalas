
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
    // Controle interno para distribuição de quintas
    quintas_alocadas?: number;
}

// ============================================
// HELPERS PRIVADOS (DUPLICADOS PARA ISOLAMENTO)
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

    const { data, error } = await query;

    if (error) {
        console.error(`Erro ao buscar funções: ${error.message}`);
        return [];
    }

    return data || [];
}

async function limparAlocacoesAnterioresDoMes(mes: number, ano: number): Promise<void> {
    // Primeiro buscar os IDs dos cultos do mês
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('id')
        .eq('mes', mes)
        .eq('ano', ano);

    if (!cultos || cultos.length === 0) return;

    const ids = cultos.map(c => c.id);

    const { error } = await supabase
        .from('escalas_alocacoes')
        .delete()
        .in('culto_id', ids);

    if (error) {
        console.error(`Erro ao limpar alocações do mês: ${error.message}`);
    }
}

async function salvarAlocacoes(alocacoes: Omit<Alocacao, 'id'>[]): Promise<void> {
    // Salvar em lotes de 100 para evitar timeout/erro
    const batchSize = 100;
    for (let i = 0; i < alocacoes.length; i += batchSize) {
        const batch = alocacoes.slice(i, i + batchSize);
        const { error } = await supabase
            .from('escalas_alocacoes')
            .insert(batch);

        if (error) {
            console.error(`Erro ao salvar lote alocações: ${error.message}`);
            throw error;
        }
    }
}

/**
 * Busca membros ativos e inicializa histórico zerado (pois vamos regerar tudo)
 */
async function buscarMembrosAtivos(
    periodo: 'quinta' | 'domingo'
): Promise<MembroComHistorico[]> {
    const { data: membros, error } = await supabase
        .from('membros')
        .select('*')
        .eq('ativo', true);

    if (error || !membros) {
        console.error(`Erro ao buscar membros: ${error?.message}`);
        return [];
    }

    return membros.map(membro => {
        const dispTexto = periodo === 'quinta'
            ? membro.disponibilidade_quinta
            : membro.disponibilidade_domingo;
        const { vezesPorMes } = parseDisponibilidade(dispTexto);

        return {
            ...membro,
            escalas_no_mes: 0, // Resetado pois vamos gerar o mês do zero
            limite_mes: vezesPorMes,
            quintas_alocadas: 0
        };
    });
}

// ============================================
// LÓGICA DE ALOCAÇÃO MENSAL (DUPLICADA COM AJUSTES)
// ============================================

function gerarMotivoFalha(funcao: Funcao, periodoCulto: string): string {
    const motivos: string[] = [];
    if (funcao.especificidade_sexo !== 'Unissex') motivos.push(`exige ${funcao.especificidade_sexo.toLowerCase()}`);
    if (funcao.regras) motivos.push(`exige permissão ${funcao.regras}`);
    if (motivos.length === 0) return `Nenhum membro disponível para ${periodoCulto}`;
    return `Sem candidato: ${motivos.join(', ')}`;
}

/**
 * Versão adaptada para o contexto mensal
 */
function encontrarCandidatoMensal(
    membros: MembroComHistorico[],
    funcao: Funcao,
    culto: Culto,
    membrosUsadosNoCulto: Set<string>, // Apenas neste culto
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
        const membro = membros.find(m => m.id === membroObrigatorioId);
        if (!membro) return null;
        if (!membroPodeExecutar(membro)) return null;
        return membro;
    }

    const ehFuncaoRepetivel = funcao.regras === 'REPETIR_PESSOA';

    const filtrarCandidatos = (ignorarLimite: boolean) => {
        const ehFuncaoMesa = nomeFuncaoLower.includes('mesa');

        return membros.filter(membro => {
            // 1. Aptidões Especiais
            if (ehFuncaoMesa) {
                if (!membro.aptidoes?.includes('Prioridade Mesa')) return false;
            } else if (membro.aptidoes?.includes('NECESSIDADE SENTADO')) {
                if (!membroPodeExecutar(membro)) return false;
            } else {
                // Sistema de Estrelas normal
                if (!podeExecutarFuncao(membro, funcao.nome, funcao.especificidade_sexo, funcao.setor_pai, numeroVaga)) return false;
            }

            // 2. Regras Gerais
            if (ehFuncaoRepetivel) {
                // permite reusar
            } else {
                if (membrosUsadosNoCulto.has(membro.id)) return false;
            }

            // 3. Limite Mensal
            if (!ignorarLimite) {
                if (membro.escalas_no_mes >= membro.limite_mes) return false;
            }

            // 4. Gênero e Disponibilidade Básica
            if (!atendeGenero(membro.sexo, funcao.especificidade_sexo)) return false;

            const disp = culto.periodo === 'quinta'
                ? membro.disponibilidade_quinta
                : membro.disponibilidade_domingo;
            const { disponivel } = parseDisponibilidade(disp);
            if (!disponivel) return false;

            // 5. Preferência de Período (RÍGIDA)
            if (!atendePeriodo(membro.melhor_periodo_domingo, culto.periodo)) return false;

            return true;
        });
    };

    const ordenarCandidatos = (lista: MembroComHistorico[]) => {
        const nivelExigido = getNivelExigidoParaFuncao(funcao.nome);
        return lista.sort((a, b) => {
            // Prioridade Nível
            const diffA = Math.abs((a.nivel_experiencia || 1) - nivelExigido);
            const diffB = Math.abs((b.nivel_experiencia || 1) - nivelExigido);
            if (diffA !== diffB) return diffA - diffB;

            // Prioridade Distribuição: Quem serviu menos no mês
            if (a.escalas_no_mes !== b.escalas_no_mes) return a.escalas_no_mes - b.escalas_no_mes;

            return 0;
        });
    };

    let candidatos = filtrarCandidatos(false);
    if (candidatos.length > 0) {
        ordenarCandidatos(candidatos);
        return candidatos[0];
    }

    // Fallback: ignora limite mensal se necessário (mas nunca aptidão/gênero/período)
    candidatos = filtrarCandidatos(true);
    if (candidatos.length > 0) {
        ordenarCandidatos(candidatos);
        return candidatos[0];
    }

    return null;
}

// ============================================
// GERADOR DE ESCALA MENSAL (SERVIÇO PRINCIPAL)
// ============================================

export async function gerarEscalaMensal(mes: number, ano: number) {
    console.log(`\n🚀 INICIANDO GERAÇÃO MENSAL HOLÍSTICA: ${mes}/${ano}`);

    // 1. Garantir datas de culto
    await gerarCultosDoMes(mes, ano); // Apenas gera objeto
    await salvarCultos(await gerarCultosDoMes(mes, ano)); // Salva/Garante no DB
    const cultos = await buscarCultosDoMes(mes, ano);

    // 2. Limpar tudo desse mês
    console.log(`\n🧹 Limpando alocações anteriores de ${mes}/${ano}...`);
    await limparAlocacoesAnterioresDoMes(mes, ano);

    // 3. Separar cultos
    const quintas = cultos.filter(c => c.periodo === 'quinta');
    const domingos = cultos.filter(c => c.periodo.startsWith('domingo'));

    const alocacoesTotais: Omit<Alocacao, 'id'>[] = [];
    const resultadosPorCulto: ResultadoEscala[] = [];

    // ========================================
    // FASE 1: QUINTAS-FEIRAS (Estratégia 3x/2x/1x)
    // ========================================
    if (quintas.length > 0) {
        console.log(`\n📅 Processando ${quintas.length} Quintas-feiras...`);
        const membrosQuinta = await buscarMembrosAtivos('quinta');
        const funcoesQuinta = await buscarFuncoesAtivas(false); // Quinta nunca é Santa Ceia
        const funcoesOrdenadas = ordenarFuncoesPorProcessamento(funcoesQuinta);

        // Estratégia de Pré-alocação (quem vai trabalhar em qual quinta)
        // Mas como a função "encontrarCandidato" já prioriza quem serviu menos,
        // vamos processar as quintas em ordem cronológica.
        // O segredo do 3x/2x está em quem é ELIGÍVEL.

        // Vamos criar uma "máscara de disponibilidade" para cada membro nas quintas
        const mapaQuintasMembro = new Map<string, Set<string>>(); // membroId -> Set<cultoId> permitidos

        for (const m of membrosQuinta) {
            const permitidos = new Set<string>();
            const limite = m.limite_mes;

            // Se limite >= total de quintas, pode todas
            if (limite >= quintas.length) {
                quintas.forEach(q => permitidos.add(q.id));
            }
            // Se limite 3 (e temos 4 ou 5 quintas) -> 3 primeiras
            else if (limite === 3) {
                quintas.slice(0, 3).forEach(q => permitidos.add(q.id));
            }
            // Se limite 2 -> Alternado (0, 2, 4...)
            else if (limite === 2) {
                quintas.forEach((q, idx) => {
                    if (idx % 2 === 0) permitidos.add(q.id); // 1ª, 3ª, 5ª quinta
                });
            }
            // Se limite 1 -> Preferência pela última, ou onde tiver vaga (deixamos livre, mas com limite 1)
            else if (limite === 1) {
                // Estratégia: Permitir todas, mas o "encontrarCandidato" vai barrar após a primeira alocação
                // Para forçar ser na última, poderíamos restringir, mas pode faltar gente.
                // Melhor deixar livre e o limite atuar.
                quintas.forEach(q => permitidos.add(q.id));
            }

            mapaQuintasMembro.set(m.id, permitidos);
        }

        // Processar cada Quinta
        for (const culto of quintas) {
            console.log(`   > Quinta ${culto.data_culto}`);
            const alocacoesCulto: Omit<Alocacao, 'id'>[] = [];
            const membrosUsadosNesteCulto = new Set<string>();
            let vagasP = 0;
            let vagasV = 0;

            for (const funcao of funcoesOrdenadas) {
                for (let i = 0; i < funcao.quantidade_pessoas; i++) {
                    // Filtrar membros que tem permissão para esta quinta específica (conforme regra 3x/2x)
                    const membrosElegiveisParaData = membrosQuinta.filter(m => {
                        const permitidos = mapaQuintasMembro.get(m.id);
                        return permitidos?.has(culto.id);
                    });

                    // Tenta encontrar na lista filtrada
                    let candidato = encontrarCandidatoMensal(
                        membrosElegiveisParaData,
                        funcao,
                        culto,
                        membrosUsadosNesteCulto,
                        null,
                        i
                    );

                    if (candidato) {
                        membrosUsadosNesteCulto.add(candidato.id);
                        // Atualiza contadores no objeto original da lista completa
                        const membroReal = membrosQuinta.find(m => m.id === candidato!.id);
                        if (membroReal) {
                            membroReal.escalas_no_mes++;
                            membroReal.ultima_escala = culto.data_culto;
                        }

                        alocacoesCulto.push({
                            culto_id: culto.id,
                            funcao_id: funcao.id,
                            membro_id: candidato.id,
                            status: 'ALOCADO',
                            motivo_falha: null
                        });
                        vagasP++;
                    } else {
                        alocacoesCulto.push({
                            culto_id: culto.id,
                            funcao_id: funcao.id,
                            membro_id: null,
                            status: 'SEM_CANDIDATO',
                            motivo_falha: gerarMotivoFalha(funcao, culto.periodo)
                        });
                        vagasV++;
                    }
                }
            }
            alocacoesTotais.push(...alocacoesCulto);
            resultadosPorCulto.push({
                culto_id: culto.id,
                alocacoes: alocacoesCulto as any,
                vagas_preenchidas: vagasP,
                vagas_vazias: vagasV
            });
        }
    }

    // ========================================
    // FASE 2: DOMINGOS (Regras de Cônjuges)
    // ========================================
    if (domingos.length > 0) {
        console.log(`\n📅 Processando ${domingos.length} cultos de Domingo...`);
        const membrosDomingo = await buscarMembrosAtivos('domingo');
        // Separar funções por SC ou Normal
        // Assumindo que num mês pode ter SC e cultos normais mixed? Normalmente SC é so 1º
        // Vamos buscar as funções para cada culto individualmente para ser seguro

        // Agrupar domingos por dia (Manhã e Noite processados juntos para otimizar casais?)
        // Não, a regra 4.1 diz "Decidir período".
        // Vamos processar cronologicamente, Manhã e depois Noite.

        for (const culto of domingos) {
            console.log(`   > Domingo ${culto.data_culto} (${culto.periodo})`);

            const funcoes = await buscarFuncoesAtivas(culto.is_santa_ceia);
            const funcoesOrdenadas = ordenarFuncoesPorProcessamento(funcoes);

            const alocacoesCulto: Omit<Alocacao, 'id'>[] = [];
            const membrosUsadosNesteCulto = new Set<string>();
            let vagasP = 0;
            let vagasV = 0;
            const quemEstaOnde = new Map<string, string[]>(); // Para repetições internas

            // Pré-Identificar Líderes/Casais (regra duplicada do original)
            // Aqui simplificado: se encontrarCandidatoMensal for chamado corretamente com a lista atualizada,
            // ele deve respeitar quem já serviu.

            // REGRA CÔNJUGES:
            // "Se um dos cônjuges tem preferência Qualquer e o outro Fixa, ambos vão no Fixo"
            // Isso deve ser resolvido no "atendePeriodo" ou na hora de validar o candidato.
            // O "atendePeriodo" já deve olhar a preferência do membro.
            // O desafio é alinhar o casal no MESMO culto.

            // Implementação Simplificada e Robusta (conforme pedido para não refatorar a logica de casal complexa):
            // O "encontrarCandidato" original não força casal junto, exceto na alocação de "Responsável Geral".
            // A regra 4.1 é sobre "Onde eles SERVEM", não necessariamente na mesma função.
            // Se formos rígidos, deveríamos pré-alocar casais.
            // Dado o risco, vamos seguir a alocação padrão, mas reforçando a preferência.

            for (const funcao of funcoesOrdenadas) {
                const ocupantesFuncao: string[] = [];

                for (let i = 0; i < funcao.quantidade_pessoas; i++) {
                    // Lógica de Repetição Detalhada (Duplicada simplificada)
                    // Se precisar de repetição (ex: banheiro), tentar pegar de quemEstaOnde
                    const regraDetalhada = buscarRegraDetalhada(funcao.nome, funcao.setor_pai);
                    let membroObrigatorioId: string | null = null;

                    if (regraDetalhada) {
                        const mapping = regraDetalhada.mapeamento.find(m => m.vagaDestino === i);
                        if (mapping) {
                            // Tenta achar fonte
                            for (const [chave, ocupantes] of quemEstaOnde.entries()) {
                                if (chave.toLowerCase().includes(mapping.fontePattern.toLowerCase())) {
                                    // Achou fonte, pega o ocupante da vagaFonte
                                    const candidatoId = ocupantes[mapping.vagaFonte];
                                    if (candidatoId && candidatoId !== 'VAZIO') {
                                        // Verificar se já não foi usado NESTE culto (exceto se for a propria repetição)
                                        // Mas repetição É usar de novo.
                                        membroObrigatorioId = candidatoId;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    let candidato = encontrarCandidatoMensal(
                        membrosDomingo,
                        funcao,
                        culto,
                        membrosUsadosNesteCulto,
                        membroObrigatorioId,
                        i
                    );

                    if (candidato) {
                        if (!membroObrigatorioId) {
                            membrosUsadosNesteCulto.add(candidato.id);
                            const mReal = membrosDomingo.find(m => m.id === candidato!.id);
                            if (mReal) {
                                mReal.escalas_no_mes++;
                                mReal.ultima_escala = culto.data_culto;
                            }
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
    }

    // 4. Salvar TUDO
    console.log(`\n💾 Salvando ${alocacoesTotais.length} alocações...`);
    await salvarAlocacoes(alocacoesTotais);

    return {
        success: true,
        mes,
        ano,
        total_alocacoes: alocacoesTotais.length,
        resultados: resultadosPorCulto
    };
}
