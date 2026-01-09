import { supabase } from '../config/supabase.js';
import {
    parseDisponibilidade,
    atendePeriodo,
    atendeGenero,
    atendePermissao
} from './parser.js';
import { buscarCultoPorId, marcarEscalaCriada } from './cultos.js';
import type { Membro, Funcao, Culto, Alocacao, ResultadoEscala } from '../types/index.js';
import { podeExecutarFuncao } from './rules/StarSystem.js';
import { temRegraRepeticao, vagaDeveRepetir, chaveMatchFonte, ehFuncaoRepeticao } from './rules/RepetitionRules.js';

// ============================================
// TIPOS INTERNOS
// ============================================

interface MembroComHistorico extends Membro {
    escalas_no_mes: number;      // Quantas vezes já serviu no mês
    ultima_escala?: string;      // Data da última escala
    limite_mes: number;          // Limite baseado na disponibilidade
}

// ============================================
// FUNÇÕES DE HISTÓRICO
// ============================================

/**
 * Busca quantas vezes cada membro já serviu no mês atual
 */
async function buscarHistoricoMes(
    mes: number,
    ano: number,
    periodo: 'quinta' | 'domingo_manha' | 'domingo_noite'
): Promise<Map<string, { contagem: number; ultimaEscala: string | null }>> {

    // Determinar tipo de culto para o histórico
    const tiposCulto = periodo === 'quinta'
        ? ['quinta']
        : ['domingo_manha', 'domingo_noite'];

    const { data, error } = await supabase
        .from('escalas_alocacoes')
        .select(`
            membro_id,
            culto:datas_cultos!inner(data_culto, periodo, mes, ano)
        `)
        .eq('status', 'ALOCADO')
        .not('membro_id', 'is', null);

    if (error) {
        console.error('Erro ao buscar histórico:', error.message);
        return new Map();
    }

    const historico = new Map<string, { contagem: number; ultimaEscala: string | null }>();

    for (const alocacao of data || []) {
        const culto = alocacao.culto as any;

        // Filtrar por mês/ano e tipo de culto
        if (culto.mes !== mes || culto.ano !== ano) continue;
        if (!tiposCulto.includes(culto.periodo)) continue;

        const membroId = alocacao.membro_id;
        if (!membroId) continue;

        const atual = historico.get(membroId) || { contagem: 0, ultimaEscala: null };
        atual.contagem++;

        // Atualizar última escala se for mais recente
        if (!atual.ultimaEscala || culto.data_culto > atual.ultimaEscala) {
            atual.ultimaEscala = culto.data_culto;
        }

        historico.set(membroId, atual);
    }

    return historico;
}

/**
 * Busca todos os membros ativos COM histórico de escalas
 */
async function buscarMembrosComHistorico(
    mes: number,
    ano: number,
    periodo: 'quinta' | 'domingo_manha' | 'domingo_noite'
): Promise<MembroComHistorico[]> {

    // Buscar membros
    const { data: membros, error } = await supabase
        .from('membros')
        .select('*')
        .eq('ativo', true);

    if (error || !membros) {
        console.error(`Erro ao buscar membros: ${error?.message}`);
        return [];
    }

    // Buscar histórico
    const historico = await buscarHistoricoMes(mes, ano, periodo);

    // Combinar membros com histórico
    return membros.map(membro => {
        const hist = historico.get(membro.id) || { contagem: 0, ultimaEscala: null };

        // Calcular limite baseado na disponibilidade
        const dispTexto = periodo === 'quinta'
            ? membro.disponibilidade_quinta
            : membro.disponibilidade_domingo;
        const { vezesPorMes } = parseDisponibilidade(dispTexto);

        return {
            ...membro,
            escalas_no_mes: hist.contagem,
            ultima_escala: hist.ultimaEscala || undefined,
            limite_mes: vezesPorMes
        } as MembroComHistorico;
    });
}

// ============================================
// FUNÇÕES DE BUSCA
// ============================================

/**
 * Busca funções ativas, filtrando por Santa Ceia se necessário
 */
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

/**
 * Limpa alocações anteriores de um culto
 */
async function limparAlocacoesAnteriores(cultoId: string): Promise<void> {
    const { error } = await supabase
        .from('escalas_alocacoes')
        .delete()
        .eq('culto_id', cultoId);

    if (error) {
        console.error(`Erro ao limpar alocações: ${error.message}`);
    }
}

/**
 * Salva alocações no banco de dados
 */
async function salvarAlocacoes(alocacoes: Omit<Alocacao, 'id'>[]): Promise<void> {
    const { error } = await supabase
        .from('escalas_alocacoes')
        .insert(alocacoes);

    if (error) {
        console.error(`Erro ao salvar alocações: ${error.message}`);
        throw error;
    }
}

// ============================================
// LÓGICA DE ALOCAÇÃO
// ============================================

/**
 * Gera motivo de falha baseado na função
 */
function gerarMotivoFalha(funcao: Funcao, periodoCulto: string): string {
    const motivos: string[] = [];

    if (funcao.especificidade_sexo !== 'Unissex') {
        motivos.push(`exige ${funcao.especificidade_sexo.toLowerCase()}`);
    }

    if (funcao.regras) {
        motivos.push(`exige permissão ${funcao.regras}`);
    }

    if (motivos.length === 0) {
        return `Nenhum membro disponível para ${periodoCulto}`;
    }

    return `Sem candidato: ${motivos.join(', ')}`;
}

/**
 * Encontra o melhor candidato respeitando:
 * 1. Limite de vezes por mês (baseado na disponibilidade)
 * 2. Prioridade para quem serviu menos
 * 3. Evita quem serviu no culto anterior
 * 4. REPETIR_PESSOA: busca primeiro de quem já está escalado no culto
 */
function encontrarCandidato(
    membros: MembroComHistorico[],
    funcao: Funcao,
    culto: Culto,
    membrosUsados: Set<string>,
    membroObrigatorioId?: string | null
): MembroComHistorico | null {

    if (membroObrigatorioId) {
        return membros.find(m => m.id === membroObrigatorioId) || null;
    }

    const ehFuncaoRepetivel = funcao.regras === 'REPETIR_PESSOA';

    // Função auxiliar para filtrar candidatos
    const filtrarCandidatos = (ignorarLimite: boolean) => {
        return membros.filter(membro => {
            // VERIFICAR ESTRELAS
            if (!podeExecutarFuncao(membro, funcao.nome, funcao.especificidade_sexo)) {
                return false;
            }

            // REPETIR_PESSOA
            if (ehFuncaoRepetivel) {
                // Para função repetível, preferir na ordenação, mas permitir na filtragem
            } else {
                if (membrosUsados.has(membro.id)) return false;
            }

            // LIMITE MENSAL (Só checa se não estiver ignorando)
            if (!ignorarLimite) {
                if (membro.escalas_no_mes >= membro.limite_mes) return false;
            }

            // Gênero
            if (!atendeGenero(membro.sexo, funcao.especificidade_sexo)) return false;

            // APTIDÕES ESPECIAIS (Apenas estas são verificadas, restante usa Sistema de Estrelas)
            // 1. NECESSIDADE SENTADO - Se membro precisa ficar sentado, só pode ir para funções compatíveis
            if (membro.aptidoes?.includes('NECESSIDADE SENTADO')) {
                const nomeLower = funcao.nome.toLowerCase();

                // Funções que SEMPRE exigem ficar em pé (barrar completamente)
                const funcoesEmPe = ['porta', 'hall', 'interno', 'salvas'];
                if (funcoesEmPe.some(f => nomeLower.includes(f))) {
                    return false;
                }

                // Correntes: Só pode nas alas AZUL e LARANJA (não pode na VERDE)
                if (nomeLower.includes('corrente')) {
                    const ehAzulOuLaranja = nomeLower.includes('azul') || nomeLower.includes('laranja');
                    const ehVerde = nomeLower.includes('verde');

                    if (ehVerde || !ehAzulOuLaranja) {
                        return false; // Barra corrente verde ou correntes sem setor definido
                    }
                    // Se for azul ou laranja, permite continuar
                }
            }

            // 2. Prioridade Mesa - Será tratada na ordenação, não no filtro

            // Disponibilidade básica
            const disp = culto.periodo === 'quinta'
                ? membro.disponibilidade_quinta
                : membro.disponibilidade_domingo;

            const { disponivel } = parseDisponibilidade(disp);
            if (!disponivel) return false;

            // Período (manhã/noite)
            if (!atendePeriodo(membro.melhor_periodo_domingo, culto.periodo)) return false;

            return true;
        });
    };

    // Função de ordenação
    const ordenarCandidatos = (lista: MembroComHistorico[], nomeFuncao: string) => {
        return lista.sort((a, b) => {
            // 0. PRIORIDADE MESA: Se função é Mesa, quem tem aptidão vem primeiro
            if (nomeFuncao.toLowerCase().includes('mesa')) {
                const aPrioridadeMesa = a.aptidoes?.includes('Prioridade mesa') ? 1 : 0;
                const bPrioridadeMesa = b.aptidoes?.includes('Prioridade mesa') ? 1 : 0;
                if (aPrioridadeMesa !== bPrioridadeMesa) {
                    return bPrioridadeMesa - aPrioridadeMesa; // Quem tem prioridade vem primeiro
                }
            }

            // 1. Quem serviu menos vezes no mês
            if (a.escalas_no_mes !== b.escalas_no_mes) {
                return a.escalas_no_mes - b.escalas_no_mes;
            }
            // 2. Quem serviu há mais tempo
            if (!a.ultima_escala && b.ultima_escala) return -1;
            if (a.ultima_escala && !b.ultima_escala) return 1;
            if (a.ultima_escala && b.ultima_escala) {
                return a.ultima_escala.localeCompare(b.ultima_escala);
            }
            return 0;
        });
    };

    // 1. TENTATIVA PADRÃO (Respeitando limites)
    let candidatos = filtrarCandidatos(false);

    if (candidatos.length > 0) {
        ordenarCandidatos(candidatos, funcao.nome);
        return candidatos[0];
    }

    // 2. TENTATIVA FALLBACK (Ignorando limites para preencher a vaga)
    candidatos = filtrarCandidatos(true);

    if (candidatos.length > 0) {
        ordenarCandidatos(candidatos, funcao.nome);
        // Retorna o que serviu menos, mesmo tendo estourado o limite
        return candidatos[0];
    }

    return null;
}

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

/**
 * Gera a escala completa para um culto COM BALANCEAMENTO
 */
export async function gerarEscalaParaCulto(cultoId: string): Promise<ResultadoEscala> {
    console.log(`\n📋 Gerando escala para culto ${cultoId}`);

    // Buscar culto
    const culto = await buscarCultoPorId(cultoId);
    if (!culto) {
        throw new Error(`Culto não encontrado: ${cultoId}`);
    }

    console.log(`   📅 ${culto.nome_culto} - ${culto.periodo}`);
    console.log(`   🍞 Santa Ceia: ${culto.is_santa_ceia ? 'Sim' : 'Não'}`);

    // Buscar membros COM HISTÓRICO
    const membros = await buscarMembrosComHistorico(culto.mes, culto.ano, culto.periodo);
    const funcoes = await buscarFuncoesAtivas(culto.is_santa_ceia);

    console.log(`   👥 Membros ativos: ${membros.length}`);
    console.log(`   🎯 Funções ativas: ${funcoes.length}`);

    // Log de balanceamento
    const disponiveis = membros.filter(m => m.escalas_no_mes < m.limite_mes).length;
    console.log(`   ⚖️ Com vagas disponíveis: ${disponiveis}`);

    // Limpar alocações anteriores
    await limparAlocacoesAnteriores(cultoId);

    // Gerar alocações
    const alocacoes: Omit<Alocacao, 'id'>[] = [];
    const membrosUsados = new Set<string>();

    // Rastreador de quem está em quê: NomeFuncao -> Lista de IDs
    const quemEstaOnde = new Map<string, string[]>();

    // ============================================
    // ENCONTRAR RESPONSÁVEIS GERAIS (NÍVEL 5)
    // São salvos diretamente em datas_cultos, não alocados via função
    // ============================================
    let responsavelGeral1Id: string | null = null;
    let responsavelGeral2Id: string | null = null;

    // Buscar membros Nível 5 disponíveis para este período
    const lideresDisponiveis = membros.filter(m => {
        if (m.nivel_experiencia !== 5) return false;

        // Verificar disponibilidade
        const disp = culto.periodo === 'quinta'
            ? m.disponibilidade_quinta
            : m.disponibilidade_domingo;
        const { disponivel } = parseDisponibilidade(disp);
        if (!disponivel) return false;

        // Verificar período
        if (!atendePeriodo(m.melhor_periodo_domingo, culto.periodo)) return false;

        return true;
    });

    console.log(`   👑 Líderes Nível 5 disponíveis: ${lideresDisponiveis.length}`);

    if (lideresDisponiveis.length > 0) {
        // Primeiro líder
        const lider1 = lideresDisponiveis[0];
        responsavelGeral1Id = lider1.id;
        console.log(`   👑 Responsável Geral 1: ${lider1.nome_completo}`);

        // Buscar cônjuge
        const nomeConjuge = (lider1 as any).nome_conjuge;
        const conjugeServeJunto = (lider1 as any).conjuge_serve_junto;

        if (nomeConjuge && conjugeServeJunto) {
            const conjuge = membros.find(m =>
                m.nome_completo.toLowerCase().includes(nomeConjuge.toLowerCase()) ||
                nomeConjuge.toLowerCase().includes(m.nome_completo.toLowerCase().split(' ')[0])
            );

            if (conjuge && conjuge.nivel_experiencia === 5) {
                responsavelGeral2Id = conjuge.id;
                console.log(`   👑 Responsável Geral 2 (cônjuge): ${conjuge.nome_completo}`);
            }
        }

        // Se não achou cônjuge, pegar segundo líder disponível
        if (!responsavelGeral2Id && lideresDisponiveis.length > 1) {
            const lider2 = lideresDisponiveis[1];
            responsavelGeral2Id = lider2.id;
            console.log(`   👑 Responsável Geral 2: ${lider2.nome_completo}`);
        }
    }

    let vagasPreenchidas = 0;
    let vagasVazias = 0;

    for (const funcao of funcoes) {

        const ocupantesDestaFuncao: string[] = [];

        // LÓGICA ESPECIAL PARA CASAIS RESPONSÁVEIS
        // Se a função é "Responsável e apoio" (requer múltiplas pessoas), escalar o casal junto
        let conjuge_pendente_id: string | null = null;

        for (let i = 0; i < funcao.quantidade_pessoas; i++) {

            // LOGICA DE REPETIÇÃO (BANHEIROS)
            let membroObrigatorioId: string | null = null;

            // Se tem cônjuge pendente da iteração anterior (para casais responsáveis)
            if (conjuge_pendente_id) {
                membroObrigatorioId = conjuge_pendente_id;
                conjuge_pendente_id = null; // Consumido
            }

            // Se tem cônjuge pendente da iteração anterior (fallback se não tiver resp definido)
            if (!membroObrigatorioId && conjuge_pendente_id) {
                membroObrigatorioId = conjuge_pendente_id;
                conjuge_pendente_id = null; // Consumido
            }

            // ============================================
            // LÓGICA GENÉRICA DE REPETIÇÃO (RepetitionRules)
            // ============================================
            const regraRepeticao = temRegraRepeticao(funcao.nome);

            if (!membroObrigatorioId && regraRepeticao) {
                // Verificar se ESTA VAGA específica deve repetir ou buscar pessoa nova
                const deveRepetir = vagaDeveRepetir(regraRepeticao, i);

                if (deveRepetir) {
                    // Buscar ocupantes das funções fonte usando chaveMatchFonte
                    const chavesFonte = Array.from(quemEstaOnde.keys()).filter(k =>
                        chaveMatchFonte(k, regraRepeticao)
                    );

                    console.log(`   🔍 DEBUG: Buscando fontes para "${funcao.nome}" - ${chavesFonte.length} chaves: ${chavesFonte.join(', ')}`);

                    if (chavesFonte.length > 0) {
                        // Coletar todos os ocupantes das fontes (na ordem)
                        const todosOcupantes: string[] = [];
                        chavesFonte.forEach(chave => {
                            const ocupantes = quemEstaOnde.get(chave) || [];
                            ocupantes.forEach(o => {
                                if (o !== 'VAZIO' && !todosOcupantes.includes(o)) {
                                    todosOcupantes.push(o);
                                }
                            });
                        });

                        console.log(`   🔍 DEBUG: ${todosOcupantes.length} ocupantes coletados`);

                        // Usar indicesFonte para pegar o ocupante certo
                        // i = índice da vaga destino (0,1,2...)
                        // indicesFonte = quais índices das fontes usar
                        const indiceDaFonte = regraRepeticao.indicesFonte[i];
                        if (indiceDaFonte !== undefined && todosOcupantes.length > indiceDaFonte) {
                            membroObrigatorioId = todosOcupantes[indiceDaFonte];
                            console.log(`   🔄 ${regraRepeticao.descricao} (vaga ${i} → fonte[${indiceDaFonte}])`);
                        } else {
                            console.log(`   ⚠️ DEBUG: indicesFonte[${i}]=${indiceDaFonte}, só ${todosOcupantes.length} disponíveis`);
                        }
                    } else {
                        console.log(`   ⚠️ DEBUG: Nenhuma função fonte encontrada!`);
                    }
                } else {
                    // Esta vaga NÃO repete - será preenchida com pessoa nova
                    console.log(`   ⭐ ${funcao.nome} vaga ${i}: Pessoa NOVA`);
                }
            }

            // LÓGICA OFERTA: Usa os Responsáveis Gerais (Nível 5) detectados no início
            if (!membroObrigatorioId && funcao.nome.toLowerCase().includes('oferta')) {
                // Usar os Responsáveis Gerais que foram detectados no início
                if (i === 0 && responsavelGeral1Id) {
                    membroObrigatorioId = responsavelGeral1Id;
                    console.log(`   🎁 Oferta vaga 0: Responsável Geral 1`);
                } else if (i === 1 && responsavelGeral2Id) {
                    membroObrigatorioId = responsavelGeral2Id;
                    console.log(`   🎁 Oferta vaga 1: Responsável Geral 2`);
                } else if (i >= 2) {
                    // Vaga 2+ busca outros Nível 5 disponíveis
                    const outroLider = membros.find(m =>
                        m.nivel_experiencia === 5 &&
                        !membrosUsados.has(m.id) &&
                        m.id !== responsavelGeral1Id &&
                        m.id !== responsavelGeral2Id
                    );
                    if (outroLider) {
                        membroObrigatorioId = outroLider.id;
                        console.log(`   🎁 Oferta vaga ${i}: Outro líder Nível 5 (${outroLider.nome_completo})`);
                    }
                }
            }

            const candidato = encontrarCandidato(membros, funcao, culto, membrosUsados, membroObrigatorioId);

            // NOTA: Responsáveis Gerais (Nível 5) são detectados no início da função,
            // não através da alocação de funções. A captura abaixo foi removida.

            if (candidato) {

                // Se NÃO for repetição forçada, marca como usado e conta escala
                if (!membroObrigatorioId) {
                    membrosUsados.add(candidato.id);
                    candidato.escalas_no_mes++;
                }

                vagasPreenchidas++;
                ocupantesDestaFuncao.push(candidato.id);

                alocacoes.push({
                    culto_id: cultoId,
                    funcao_id: funcao.id,
                    membro_id: candidato.id,
                    status: 'ALOCADO',
                    motivo_falha: null
                });
            } else {
                vagasVazias++;
                ocupantesDestaFuncao.push('VAZIO');

                alocacoes.push({
                    culto_id: cultoId,
                    funcao_id: funcao.id,
                    membro_id: null,
                    status: 'SEM_CANDIDATO',
                    motivo_falha: gerarMotivoFalha(funcao, culto.periodo)
                });
            }
        }

        quemEstaOnde.set(funcao.nome, ocupantesDestaFuncao);
    }

    // Salvar no banco
    await salvarAlocacoes(alocacoes);
    await marcarEscalaCriada(cultoId);

    // SALVAR RESPONSÁVEIS GERAIS no banco para o frontend exibir
    if (responsavelGeral1Id || responsavelGeral2Id) {
        const { error } = await supabase
            .from('datas_cultos')
            .update({
                responsavel_geral_1_id: responsavelGeral1Id,
                responsavel_geral_2_id: responsavelGeral2Id
            })
            .eq('id', cultoId);

        if (error) {
            console.error(`   ⚠️ Erro ao salvar responsáveis gerais: ${error.message}`);
        } else {
            console.log(`   👑 Responsáveis gerais salvos no banco`);
        }
    }

    console.log(`   ✅ Preenchidas: ${vagasPreenchidas}`);
    console.log(`   ❌ Vazias: ${vagasVazias}`);

    return {
        culto_id: cultoId,
        alocacoes: alocacoes as Alocacao[],
        vagas_preenchidas: vagasPreenchidas,
        vagas_vazias: vagasVazias
    };
}

/**
 * Busca alocações de um culto
 */
export async function buscarAlocacoesDoCulto(cultoId: string): Promise<Alocacao[]> {
    const { data, error } = await supabase
        .from('escalas_alocacoes')
        .select('*')
        .eq('culto_id', cultoId);

    if (error) {
        console.error(`Erro ao buscar alocações: ${error.message}`);
        return [];
    }

    return data || [];
}
