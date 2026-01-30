
import { supabase } from '../config/supabase.js';
import {
    parseDisponibilidade,
    atendePeriodo,
    atendeGenero
} from './parser.js';
import { buscarCultoPorId, marcarEscalaCriada } from './cultos.js';
import type { Membro, Funcao, Culto, Alocacao, ResultadoEscala } from '../types/index.js';
import { podeExecutarFuncao, getNivelExigidoParaFuncao } from './rules/StarSystem.js';
import { buscarRegraDetalhada } from './rules/RepetitionRules.js';
import { ordenarFuncoesPorProcessamento } from './rules/ProcessingOrder.js';

// ============================================
// TIPOS INTERNOS
// ============================================

interface MembroComHistorico extends Membro {
    escalas_no_mes: number;      // Quantas vezes já serviu no mês
    ultima_escala?: string;      // Data da última escala
    limite_mes: number;          // Limite baseado na disponibilidade
}

// ============================================
// FUNÇÕES DE BUSCA (Adaptadas para não buscar membros do banco)
// ============================================

// [REMOVIDO] buscarHistoricoMes - O histórico já vem no Pool
// [REMOVIDO] buscarMembrosComHistorico - O Pool é passado como argumento

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

async function limparAlocacoesAnteriores(cultoId: string): Promise<void> {
    const { error } = await supabase
        .from('escalas_alocacoes')
        .delete()
        .eq('culto_id', cultoId);

    if (error) {
        console.error(`Erro ao limpar alocações: ${error.message}`);
    }
}

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
// LÓGICA DE ALOCAÇÃO (CÓPIA ESTRITA DE escala.ts)
// ============================================

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
// FUNÇÃO PRINCIPAL (ADAPTADA PARA RECEBER POOL)
// ============================================

/**
 * Gera a escala completa para um culto usando um Pool de membros pré-definido.
 * CÓPIA ESTRITA DA LÓGICA DE escala.ts
 */
export async function gerarEscalaComPool(
    culto: Culto,
    poolMembros: MembroComHistorico[]
): Promise<ResultadoEscala> {

    console.log(`\n📋 Gerando escala para culto ${culto.id} (Via Pool Custom)`);
    console.log(`   📅 ${culto.nome_culto} - ${culto.periodo}`);
    console.log(`   🍞 Santa Ceia: ${culto.is_santa_ceia ? 'Sim' : 'Não'}`);

    const membros = poolMembros; // Usa o pool passado
    const funcoes = await buscarFuncoesAtivas(culto.is_santa_ceia);

    console.log(`   👥 Membros no Pool: ${membros.length}`);
    console.log(`   🎯 Funções ativas: ${funcoes.length}`);

    // Aplicar ordenação customizada: Portas → Setores → Oferta → Máquinas → Banheiros → etc.
    const funcoesOrdenadas = ordenarFuncoesPorProcessamento(funcoes);
    console.log(`   📊 Usando ordem customizada de processamento`);

    // Log de balanceamento
    const disponiveis = membros.filter(m => m.escalas_no_mes < m.limite_mes).length;
    console.log(`   ⚖️ Com vagas disponíveis: ${disponiveis}`);

    // Limpar alocações anteriores
    // await limparAlocacoesAnteriores(cultoId); // JÁ FEITO NA FASE 0 DO MENSAL

    // Gerar alocações
    const alocacoes: Omit<Alocacao, 'id'>[] = [];
    const membrosUsados = new Set<string>();

    // Rastreador de quem está em quê: NomeFuncao -> Lista de IDs
    const quemEstaOnde = new Map<string, string[]>();

    // ============================================
    // ENCONTRAR RESPONSÁVEIS GERAIS (NÍVEL 5)
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
    const casaisDisponiveis: Array<{ lider: typeof lideresDisponiveis[0], conjuge: typeof lideresDisponiveis[0] }> = [];

    for (const lider of lideresDisponiveis) {
        const nomeConjuge = (lider as any).nome_conjuge;
        const conjugeServeJunto = (lider as any).conjuge_serve_junto; // Pode vir undefined se não tiver na interface base

        if (!nomeConjuge) continue; // Skip se não tem conjuge

        // Buscar cônjuge por nome
        const nomeConjugeLower = nomeConjuge.toLowerCase().trim();
        const conjuge = lideresDisponiveis.find(m => {
            if (m.id === lider.id) return false;
            const nomeLower = m.nome_completo.toLowerCase().trim();
            if (nomeLower === nomeConjugeLower) return true;
            const primeiroNomeConjuge = nomeConjugeLower.split(' ')[0];
            if (nomeLower.includes(primeiroNomeConjuge)) return true;
            const primeiroNomeMembro = nomeLower.split(' ')[0];
            if (nomeConjugeLower.includes(primeiroNomeMembro)) return true;
            return false;
        });

        if (conjuge) {
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
        casaisDisponiveis.sort((a, b) => {
            const totalA = a.lider.escalas_no_mes + a.conjuge.escalas_no_mes;
            const totalB = b.lider.escalas_no_mes + b.conjuge.escalas_no_mes;
            return totalA - totalB;
        });

        const casalEscolhido = casaisDisponiveis[0];
        responsavelGeral1Id = casalEscolhido.lider.id;
        responsavelGeral2Id = casalEscolhido.conjuge.id;
        console.log(`   👑 Casal selecionado (menor uso): ${casalEscolhido.lider.nome_completo} + ${casalEscolhido.conjuge.nome_completo}`);
    }

    if (!responsavelGeral1Id || !responsavelGeral2Id) {
        console.log(`   ⚠️ Nenhum casal Nível 5 disponível para este culto - Responsáveis Gerais ficarão VAZIOS`);
        // REGRA ESTRITA: Não usar fallback de líderes individuais
        responsavelGeral1Id = null;
        responsavelGeral2Id = null;
    }

    let vagasPreenchidas = 0;
    let vagasVazias = 0;

    for (const funcao of funcoesOrdenadas) {

        const ocupantesDestaFuncao: string[] = [];
        let conjuge_pendente_id: string | null = null;

        for (let i = 0; i < funcao.quantidade_pessoas; i++) {

            let membroObrigatorioId: string | null = null;

            if (conjuge_pendente_id) {
                membroObrigatorioId = conjuge_pendente_id;
                conjuge_pendente_id = null;
            }

            if (!membroObrigatorioId && conjuge_pendente_id) {
                membroObrigatorioId = conjuge_pendente_id;
                conjuge_pendente_id = null;
            }

            const regraDetalhada = buscarRegraDetalhada(funcao.nome, funcao.setor_pai);

            if (!membroObrigatorioId && regraDetalhada) {
                const mapping = regraDetalhada.mapeamento.find(m => m.vagaDestino === i);

                if (mapping) {
                    let chaveEncontrada: string | null = null;
                    let ocupanteId: string | null = null;
                    let vagaUsada: number = mapping.vagaFonte;

                    for (const [chave, ocupantes] of quemEstaOnde.entries()) {
                        const [nomeFuncao, setorPai] = chave.split('|');
                        const nomeLower = nomeFuncao.toLowerCase();
                        const pattern = mapping.fontePattern;

                        let patternMatch = false;
                        if (pattern.startsWith('^') && pattern.endsWith('$')) {
                            const exactPattern = pattern.slice(1, -1).toLowerCase();
                            patternMatch = nomeLower === exactPattern;
                        } else {
                            patternMatch = nomeLower.includes(pattern.toLowerCase());
                        }

                        if (!patternMatch) continue;

                        if (mapping.fonteSetor) {
                            if (!setorPai?.toLowerCase().includes(mapping.fonteSetor.toLowerCase())) continue;
                        }

                        for (let tentativa = mapping.vagaFonte; tentativa < ocupantes.length; tentativa++) {
                            if (ocupantes[tentativa] === 'VAZIO') continue;

                            const candidatoId = ocupantes[tentativa];
                            const candidatoMembro = membros.find(m => m.id === candidatoId);

                            if (!candidatoMembro) continue;

                            const nomeFuncaoDestinoLower = funcao.nome.toLowerCase();
                            const setorDestinoLower = funcao.setor_pai?.toLowerCase() || '';

                            if (candidatoMembro.aptidoes?.includes('NECESSIDADE SENTADO')) {
                                const ehSetorAzulOuLaranja = setorDestinoLower.includes('azul') || setorDestinoLower.includes('laranja');
                                const ehApoioPermitido = nomeFuncaoDestinoLower.includes('apoio') &&
                                    !nomeFuncaoDestinoLower.includes('responsável') && ehSetorAzulOuLaranja;
                                const ehCorrentePermitida = nomeFuncaoDestinoLower.includes('corrente') && ehSetorAzulOuLaranja;

                                if (!ehApoioPermitido && !ehCorrentePermitida) {
                                    console.log(`   ⚠️ Vaga ${tentativa} bloqueada: ${candidatoMembro.nome_completo} tem NECESSIDADE SENTADO`);
                                    continue;
                                }
                            }

                            chaveEncontrada = chave;
                            ocupanteId = candidatoId;
                            vagaUsada = tentativa;
                            break;
                        }

                        if (ocupanteId) break;
                    }

                    if (ocupanteId) {
                        membroObrigatorioId = ocupanteId;
                        console.log(`   🔄 ${regraDetalhada.descricao} - vaga ${i} ← ${chaveEncontrada}[${vagaUsada}]`);
                    } else {
                        console.log(`   ⚠️ Repetição falhou: ${funcao.nome} vaga ${i} - fonte "${mapping.fontePattern}" (${mapping.fonteSetor || 'qualquer'}) não encontrada ou bloqueada`);
                    }
                } else {
                    console.log(`   ⭐ ${funcao.nome} vaga ${i}: Sem mapeamento (pessoa nova)`);
                }
            }

            if (!membroObrigatorioId && funcao.setor_pai?.toLowerCase().includes('oferta')) {
                if (i === 0 && responsavelGeral1Id) {
                    membroObrigatorioId = responsavelGeral1Id;
                    console.log(`   🎁 Oferta vaga 0: Responsável Geral 1`);
                } else if (i === 1 && responsavelGeral2Id) {
                    membroObrigatorioId = responsavelGeral2Id;
                    console.log(`   🎁 Oferta vaga 1: Responsável Geral 2`);
                } else if (i === 2) {
                    const chaveRespVerde = 'Responsável e apoio|SETOR VERDE';
                    const ocupantesVerde = quemEstaOnde.get(chaveRespVerde);
                    if (ocupantesVerde && ocupantesVerde.length > 0 && ocupantesVerde[0] !== 'VAZIO') {
                        membroObrigatorioId = ocupantesVerde[0];
                        console.log(`   🎁 Oferta vaga 2: Responsável Ala Verde`);
                    }
                }
            }

            const candidato = encontrarCandidato(membros, funcao, culto, membrosUsados, membroObrigatorioId, i);

            if (candidato) {
                if (!membroObrigatorioId) {
                    membrosUsados.add(candidato.id);
                    candidato.escalas_no_mes++;
                }

                vagasPreenchidas++;
                ocupantesDestaFuncao.push(candidato.id);

                alocacoes.push({
                    culto_id: culto.id,
                    funcao_id: funcao.id,
                    membro_id: candidato.id,
                    status: 'ALOCADO',
                    motivo_falha: null
                });
            } else {
                vagasVazias++;
                ocupantesDestaFuncao.push('VAZIO');

                alocacoes.push({
                    culto_id: culto.id,
                    funcao_id: funcao.id,
                    membro_id: null,
                    status: 'SEM_CANDIDATO',
                    motivo_falha: gerarMotivoFalha(funcao, culto.periodo)
                });
            }
        }

        const chaveComposta = `${funcao.nome}|${funcao.setor_pai}`;
        const existente = quemEstaOnde.get(chaveComposta) || [];
        quemEstaOnde.set(chaveComposta, [...existente, ...ocupantesDestaFuncao]);
    }

    // Salvar no banco (ALOCADOS APENAS)
    // OBS: O código original salvava alocações aqui.
    // Como estamos no mensal, vamos retornar as alocações para serem salvas em lote pelo pai?
    // O original salvava: await salvarAlocacoes(alocacoes);
    // Vamos manter salvar direto para simplificar o refactor.
    // Mas precisamos ter cuidado para não salvar duplicado se o pai também salvar.
    // O pai (escala_mensal) atual tem um "alocacoesTotais" e salva no final.
    // MELHOR RETORNAR e deixar o pai salvar.

    // SALVAR RESPONSÁVEIS GERAIS
    if (responsavelGeral1Id || responsavelGeral2Id) {
        // Precisamos atualizar o objeto culto na memória ou salvar no banco?
        // O mensal percorre os cultos.
        // Vamos salvar no banco pois é o comportamento original
        const { error } = await supabase
            .from('datas_cultos')
            .update({
                responsavel_geral_1_id: responsavelGeral1Id,
                responsavel_geral_2_id: responsavelGeral2Id
            })
            .eq('id', culto.id);
        if (error) console.error(`   ⚠️ Erro ao salvar responsáveis gerais: ${error.message}`);
    }

    return {
        culto_id: culto.id,
        alocacoes: alocacoes as Alocacao[], // Retornar para o pai gerenciar ou salvar?
        // O código original salvava. Para minimizar impacto, vamos RETORNAR e o pai salva.
        // Se eu salvar aqui, tenho que garantir que o pai não salve de novo.
        vagas_preenchidas: vagasPreenchidas,
        vagas_vazias: vagasVazias
    };
}
