import { supabase } from '../config/supabase.js';
import {
    parseDisponibilidade,
    atendePeriodo,
    atendeGenero,
    atendePermissao
} from './parser.js';
import { buscarCultoPorId, marcarEscalaCriada } from './cultos.js';
import type { Membro, Funcao, Culto, Alocacao, ResultadoEscala } from '../types/index.js';
import { podeExecutarFuncao, getNivelExigidoParaFuncao } from './rules/StarSystem.js';
import { buscarRegraDetalhada, DETAILED_RULES, type PositionRule } from './rules/RepetitionRules.js';
import { ordenarFuncoesPorProcessamento } from './rules/ProcessingOrder.js';

// ============================================
// CONSTANTES
// ============================================

// ID da função "Pool Diário" — usado para identificar entradas de pool no banco
const POOL_DIARIO_ID = 'd4b4adb8-07e3-4f66-880c-46737b76874a';

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
 * Limpa alocações anteriores de um culto (PRESERVA o Pool Diário)
 */
async function limparAlocacoesAnteriores(cultoId: string): Promise<void> {
    const { error } = await supabase
        .from('escalas_alocacoes')
        .delete()
        .eq('culto_id', cultoId)
        .neq('funcao_id', POOL_DIARIO_ID); // Preserva entradas do Pool

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
    membroObrigatorioId?: string | null,
    numeroVaga: number = 0
): MembroComHistorico | null {

    const nomeFuncaoLower = funcao.nome.toLowerCase();

    // Função auxiliar para verificar se membro pode executar função (aptidões especiais)
    const membroPodeExecutar = (membro: MembroComHistorico, setorPai?: string): boolean => {
        // NECESSIDADE SENTADO - Só pode em funções específicas dos setores Azul e Laranja
        if (membro.aptidoes?.includes('NECESSIDADE SENTADO')) {
            // Regra: Só pode Corrente da Ala Azul ou Laranja
            // Não pode Apoio (pois fica em pé)
            const ehCorrente = nomeFuncaoLower.includes('corrente');
            const setorPaiLower = funcao.setor_pai?.toLowerCase() || '';
            const ehSetorAzulOuLaranja = setorPaiLower.includes('azul') || setorPaiLower.includes('laranja');

            if (ehCorrente && ehSetorAzulOuLaranja) {
                return true; // Permitido
            }
            return false; // Qualquer outra coisa é proibida
        }
        return true;
    };

    if (membroObrigatorioId) {
        const membro = membros.find(m => m.id === membroObrigatorioId);
        if (!membro) return null;

        // Verificar se o membro pode executar esta função
        if (!membroPodeExecutar(membro, funcao.setor_pai)) {
            console.log(`   ⚠️ Repetição bloqueada: ${membro.nome_completo} tem NECESSIDADE SENTADO, não pode ir para ${funcao.nome} (${funcao.setor_pai})`);
            return null; // Não forçar alocação incompatível
        }
        return membro;
    }

    const ehFuncaoRepetivel = funcao.regras === 'REPETIR_PESSOA';

    // Função auxiliar para filtrar candidatos
    const filtrarCandidatos = (ignorarLimite: boolean) => {
        const nomeFuncaoLower = funcao.nome.toLowerCase();
        const ehFuncaoMesa = nomeFuncaoLower.includes('mesa');

        return membros.filter(membro => {
            // ============================================
            // APTIDÕES ESPECIAIS QUE IGNORAM ESTRELAS
            // ============================================

            // 1. PRIORIDADE MESA - EXIGE aptidão e IGNORA estrelas
            if (ehFuncaoMesa) {
                const temPrioridadeMesa = membro.aptidoes?.includes('Prioridade Mesa');
                if (!temPrioridadeMesa) {
                    return false; // Função Mesa EXIGE ter a aptidão
                }
                // Se tem a aptidão, IGNORA verificação de estrelas para Mesa
            }

            // 2. NECESSIDADE SENTADO - Só pode em funções dos setores Azul e Laranja, IGNORA estrelas
            else if (membro.aptidoes?.includes('NECESSIDADE SENTADO')) {
                // Funções PERMITIDAS para quem precisa ficar sentado:
                // - Apenas Corrente da Ala Azul ou Laranja
                // - Apoio NÃO é permitido
                const ehCorrente = nomeFuncaoLower.includes('corrente');
                const setorPaiLower = funcao.setor_pai?.toLowerCase() || '';
                const ehSetorAzulOuLaranja = setorPaiLower.includes('azul') || setorPaiLower.includes('laranja');

                if (ehCorrente && ehSetorAzulOuLaranja) {
                    // Permitido - IGNORA verificação de estrelas
                } else {
                    return false; // Função não permitida
                }
            }

            // 3. DEMAIS CASOS - Usa sistema de estrelas normalmente
            else {
                if (!podeExecutarFuncao(membro, funcao.nome, funcao.especificidade_sexo, funcao.setor_pai, numeroVaga)) {
                    return false;
                }
            }

            // ============================================
            // REGRAS GERAIS (aplicam para todos)
            // ============================================

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

    // Função de ordenação - prioriza nível adequado + quem serviu menos
    const ordenarCandidatos = (lista: MembroComHistorico[]) => {
        // Determinar nível mínimo exigido para esta função
        const nivelExigido = getNivelExigidoParaFuncao(funcao.nome);

        return lista.sort((a, b) => {
            // 0. Priorizar membros com nível mais adequado (mais próximo do exigido)
            // Isso evita escalar membros 4 estrelas em funções de 1 estrela
            const estrelasA = a.nivel_experiencia || 1;
            const estrelasB = b.nivel_experiencia || 1;
            const diffA = estrelasA - nivelExigido; // 0 = exato, positivo = acima do necessário
            const diffB = estrelasB - nivelExigido;

            // Preferir quem está mais próximo do nível exigido (reservar experientes)
            if (diffA !== diffB) {
                return diffA - diffB;
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
        ordenarCandidatos(candidatos);
        return candidatos[0];
    }

    // 2. TENTATIVA FALLBACK (Ignorando limites para preencher a vaga)
    candidatos = filtrarCandidatos(true);

    if (candidatos.length > 0) {
        ordenarCandidatos(candidatos);
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

    // ============================================
    // BUSCAR MEMBROS: Priorizar Pool salvo no banco
    // ============================================
    let todosMembros = await buscarMembrosComHistorico(culto.mes, culto.ano, culto.periodo);

    // Verificar se existe Pool salvo para este culto
    const { data: poolEntries } = await supabase
        .from('escalas_alocacoes')
        .select('membro_id')
        .eq('culto_id', cultoId)
        .eq('funcao_id', POOL_DIARIO_ID);

    let membros: MembroComHistorico[];

    if (poolEntries && poolEntries.length > 0) {
        // Pool existe → usar APENAS membros do pool
        const poolMemberIds = new Set(poolEntries.map(e => e.membro_id).filter(Boolean));
        membros = todosMembros.filter(m => poolMemberIds.has(m.id));
        console.log(`   🌊 Pool encontrado: ${poolEntries.length} entradas → ${membros.length} membros válidos`);
    } else {
        // Sem pool → fallback para todos os membros ativos
        membros = todosMembros;
        console.log(`   ⚠️ Sem pool salvo, usando todos os membros ativos: ${membros.length}`);
    }

    const funcoes = await buscarFuncoesAtivas(culto.is_santa_ceia);

    console.log(`   👥 Membros para alocação: ${membros.length}`);
    console.log(`   🎯 Funções ativas: ${funcoes.length}`);

    // Aplicar ordenação customizada: Portas → Setores → Oferta → Máquinas → Banheiros → etc.
    const funcoesOrdenadas = ordenarFuncoesPorProcessamento(funcoes);
    console.log(`   📊 Usando ordem customizada de processamento`);

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
    // ============================================
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

    // Responsáveis Gerais devem ser SEMPRE um casal
    // Primeiro, coletar TODOS os casais disponíveis
    const casaisDisponiveis: Array<{ lider: typeof lideresDisponiveis[0], conjuge: typeof lideresDisponiveis[0] }> = [];

    for (const lider of lideresDisponiveis) {
        const nomeConjuge = (lider as any).nome_conjuge;
        const conjugeServeJunto = (lider as any).conjuge_serve_junto;

        if (!nomeConjuge || !conjugeServeJunto) continue;

        // Buscar cônjuge por nome (normalizado)
        const nomeConjugeLower = nomeConjuge.toLowerCase().trim();
        const conjuge = lideresDisponiveis.find(m => {
            if (m.id === lider.id) return false; // Não é o próprio

            const nomeLower = m.nome_completo.toLowerCase().trim();

            // Match exato
            if (nomeLower === nomeConjugeLower) return true;

            // Match parcial: primeiro nome do cônjuge cadastrado
            const primeiroNomeConjuge = nomeConjugeLower.split(' ')[0];
            if (nomeLower.includes(primeiroNomeConjuge)) return true;

            // Match parcial: nome do membro contém no nome do cônjuge
            const primeiroNomeMembro = nomeLower.split(' ')[0];
            if (nomeConjugeLower.includes(primeiroNomeMembro)) return true;

            return false;
        });

        if (conjuge) {
            // Verificar se já não adicionamos esse casal (evitar duplicata inversa)
            const jaAdicionado = casaisDisponiveis.some(c =>
                (c.lider.id === lider.id && c.conjuge.id === conjuge.id) ||
                (c.lider.id === conjuge.id && c.conjuge.id === lider.id)
            );
            if (!jaAdicionado) {
                casaisDisponiveis.push({ lider, conjuge });
            }
        }
    }

    console.log(`   👑 Casais Nível 5 disponíveis: ${casaisDisponiveis.length}`);

    if (casaisDisponiveis.length > 0) {
        // Ordenar casais por quem serviu MENOS vezes (balanceamento)
        // Soma das escalas dos dois
        casaisDisponiveis.sort((a, b) => {
            const escalasA = a.lider.escalas_no_mes + a.conjuge.escalas_no_mes;
            const escalasB = b.lider.escalas_no_mes + b.conjuge.escalas_no_mes;
            return escalasA - escalasB;
        });

        const casalEscolhido = casaisDisponiveis[0];
        console.log(`   ✅ Responsáveis Gerais escolhidos: ${casalEscolhido.lider.nome_completo} & ${casalEscolhido.conjuge.nome_completo}`);

        responsavelGeral1Id = casalEscolhido.lider.id;
        responsavelGeral2Id = casalEscolhido.conjuge.id;

        // Marcar como usados
        membrosUsados.add(responsavelGeral1Id!);
        membrosUsados.add(responsavelGeral2Id!);

        // Incrementar contadores
        casalEscolhido.lider.escalas_no_mes++;
        casalEscolhido.conjuge.escalas_no_mes++;
    } else {
        console.log(`   ⚠️ Nenhum casal Nível 5 disponível para Responsáveis Gerais!`);
    }

    // Se não encontrou casal, logar aviso
    if (!responsavelGeral1Id || !responsavelGeral2Id) {
        console.log(`   ⚠️ Nenhum casal Nível 5 disponível para este culto`);
        // Fallback: usar os dois primeiros disponíveis (não ideal)
        if (lideresDisponiveis.length >= 2) {
            responsavelGeral1Id = lideresDisponiveis[0].id;
            responsavelGeral2Id = lideresDisponiveis[1].id;
            console.log(`   👑 Fallback: ${lideresDisponiveis[0].nome_completo} + ${lideresDisponiveis[1].nome_completo}`);
        }
    }

    let vagasPreenchidas = 0;
    let vagasVazias = 0;

    for (const funcao of funcoesOrdenadas) {

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
            // LÓGICA DE REPETIÇÃO POR POSIÇÃO (DETAILED_RULES)
            // ============================================
            const regraDetalhada = buscarRegraDetalhada(funcao.nome, funcao.setor_pai);

            if (!membroObrigatorioId && regraDetalhada) {
                // Buscar o mapeamento para esta vaga específica
                const mapping = regraDetalhada.mapeamento.find(m => m.vagaDestino === i);

                if (mapping) {
                    // Construir a chave de busca: "NomeFuncao|SetorPai" ou "NomeFuncao"
                    let chaveEncontrada: string | null = null;
                    let ocupanteId: string | null = null;
                    let vagaUsada: number = mapping.vagaFonte;

                    // Buscar nas chaves do quemEstaOnde
                    for (const [chave, ocupantes] of quemEstaOnde.entries()) {
                        // A chave é "NomeFuncao|SetorPai"
                        const [nomeFuncao, setorPai] = chave.split('|');
                        const nomeLower = nomeFuncao.toLowerCase();
                        const pattern = mapping.fontePattern;

                        // Verificar se o nome da função bate com o padrão
                        let patternMatch = false;
                        if (pattern.startsWith('^') && pattern.endsWith('$')) {
                            // Regex de match exato: ^Apoio$ só dá match em "Apoio", não em "Responsável e apoio"
                            const exactPattern = pattern.slice(1, -1).toLowerCase();
                            patternMatch = nomeLower === exactPattern;
                        } else {
                            // Match parcial (includes)
                            patternMatch = nomeLower.includes(pattern.toLowerCase());
                        }

                        if (!patternMatch) continue;

                        // Se tem setor específico, verificar se o setor bate
                        if (mapping.fonteSetor) {
                            if (!setorPai?.toLowerCase().includes(mapping.fonteSetor.toLowerCase())) continue;
                        }

                        // Encontrou a fonte! Tentar vagas sequencialmente até achar uma válida
                        for (let tentativa = mapping.vagaFonte; tentativa < ocupantes.length; tentativa++) {
                            if (ocupantes[tentativa] === 'VAZIO') continue;

                            const candidatoId = ocupantes[tentativa];
                            const candidatoMembro = membros.find(m => m.id === candidatoId);

                            if (!candidatoMembro) continue;

                            // Verificar se este membro pode executar a função destino
                            const nomeFuncaoDestinoLower = funcao.nome.toLowerCase();
                            const setorDestinoLower = funcao.setor_pai?.toLowerCase() || '';

                            // Verificar NECESSIDADE SENTADO
                            if (candidatoMembro.aptidoes?.includes('NECESSIDADE SENTADO')) {
                                const ehSetorAzulOuLaranja = setorDestinoLower.includes('azul') || setorDestinoLower.includes('laranja');
                                const ehApoioPermitido = nomeFuncaoDestinoLower.includes('apoio') &&
                                    !nomeFuncaoDestinoLower.includes('responsável') && ehSetorAzulOuLaranja;
                                const ehCorrentePermitida = nomeFuncaoDestinoLower.includes('corrente') && ehSetorAzulOuLaranja;

                                if (!ehApoioPermitido && !ehCorrentePermitida) {
                                    console.log(`   ⚠️ Vaga ${tentativa} bloqueada: ${candidatoMembro.nome_completo} tem NECESSIDADE SENTADO`);
                                    continue; // Tentar próxima vaga
                                }
                            }

                            // Membro válido encontrado!
                            chaveEncontrada = chave;
                            ocupanteId = candidatoId;
                            vagaUsada = tentativa;
                            break;
                        }

                        if (ocupanteId) break; // Encontrou, sair do loop de chaves
                    }

                    if (ocupanteId) {
                        membroObrigatorioId = ocupanteId;
                        console.log(`   🔄 ${regraDetalhada.descricao} - vaga ${i} ← ${chaveEncontrada}[${vagaUsada}]`);
                    } else {
                        console.log(`   ⚠️ Repetição falhou: ${funcao.nome} vaga ${i} - fonte "${mapping.fontePattern}" (${mapping.fonteSetor || 'qualquer'}) não encontrada ou bloqueada`);
                    }
                } else {
                    // Esta vaga não tem mapeamento - será preenchida com pessoa nova
                    console.log(`   ⭐ ${funcao.nome} vaga ${i}: Sem mapeamento (pessoa nova)`);
                }
            }

            // LÓGICA OFERTA: Usa os Responsáveis Gerais (Nível 5) detectados no início
            // NOTA: As funções de Oferta se chamam "Apoio" mas estão no setor_pai "OFERTA"
            if (!membroObrigatorioId && funcao.setor_pai?.toLowerCase().includes('oferta')) {
                // Usar os Responsáveis Gerais que foram detectados no início
                if (i === 0 && responsavelGeral1Id) {
                    membroObrigatorioId = responsavelGeral1Id;
                    console.log(`   🎁 Oferta vaga 0: Responsável Geral 1`);
                } else if (i === 1 && responsavelGeral2Id) {
                    membroObrigatorioId = responsavelGeral2Id;
                    console.log(`   🎁 Oferta vaga 1: Responsável Geral 2`);
                } else if (i === 2) {
                    // Vaga 2: Responsável de Ala Verde (mais experiente)
                    const chaveRespVerde = 'Responsável e apoio|SETOR VERDE';
                    const ocupantesVerde = quemEstaOnde.get(chaveRespVerde);
                    if (ocupantesVerde && ocupantesVerde.length > 0 && ocupantesVerde[0] !== 'VAZIO') {
                        membroObrigatorioId = ocupantesVerde[0];
                        console.log(`   🎁 Oferta vaga 2: Responsável Ala Verde`);
                    }
                }
            }

            const candidato = encontrarCandidato(membros, funcao, culto, membrosUsados, membroObrigatorioId, i);

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

        // ACUMULAR em quemEstaOnde com chave composta "NomeFuncao|SetorPai"
        // Isso permite identificar "Interno|PORTA - A1" vs "Interno|PORTA - A2"
        const chaveComposta = `${funcao.nome}|${funcao.setor_pai}`;
        const existente = quemEstaOnde.get(chaveComposta) || [];
        quemEstaOnde.set(chaveComposta, [...existente, ...ocupantesDestaFuncao]);
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
