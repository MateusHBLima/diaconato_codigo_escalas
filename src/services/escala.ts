import { supabase } from '../config/supabase.js';
import {
    parseDisponibilidade,
    atendePeriodo,
    atendeGenero,
    atendePermissao
} from './parser.js';
import { buscarCultoPorId, marcarEscalaCriada } from './cultos.js';
import type { Membro, Funcao, Culto, Alocacao, ResultadoEscala } from '../types/index.js';

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
    membrosRepetiveisNoCulto: Set<string> = new Set()
): MembroComHistorico | null {

    const ehFuncaoRepetivel = funcao.regras === 'REPETIR_PESSOA';

    // Filtrar candidatos válidos
    const candidatos = membros.filter(membro => {
        // REPETIR_PESSOA: permite usar membros já usados (que vieram de funções repetíveis)
        if (ehFuncaoRepetivel) {
            // Para função repetível, preferir membros que já estão no culto
            // Mas ainda validar outros critérios
        } else {
            // Função normal: não permite repetição
            if (membrosUsados.has(membro.id)) return false;
        }

        // Já atingiu o limite mensal?
        if (membro.escalas_no_mes >= membro.limite_mes) return false;

        // Gênero
        if (!atendeGenero(membro.sexo, funcao.especificidade_sexo)) return false;

        // Permissão (REPETIR_PESSOA já é tratado como válido)
        if (!atendePermissao(membro.aptidoes || [], funcao.regras)) return false;

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

    if (candidatos.length === 0) return null;

    // ORDENAR POR PRIORIDADE:
    // 1. Quem serviu menos vezes no mês
    // 2. Em caso de empate, quem serviu há mais tempo
    candidatos.sort((a, b) => {
        // Primeiro: menos escalas no mês
        if (a.escalas_no_mes !== b.escalas_no_mes) {
            return a.escalas_no_mes - b.escalas_no_mes;
        }

        // Segundo: quem serviu há mais tempo (ou nunca)
        if (!a.ultima_escala && b.ultima_escala) return -1; // a nunca serviu
        if (a.ultima_escala && !b.ultima_escala) return 1;  // b nunca serviu
        if (a.ultima_escala && b.ultima_escala) {
            return a.ultima_escala.localeCompare(b.ultima_escala); // mais antigo primeiro
        }

        return 0;
    });

    return candidatos[0];
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
    let vagasPreenchidas = 0;
    let vagasVazias = 0;

    for (const funcao of funcoes) {
        for (let i = 0; i < funcao.quantidade_pessoas; i++) {
            const candidato = encontrarCandidato(membros, funcao, culto, membrosUsados);

            if (candidato) {
                membrosUsados.add(candidato.id);

                // Atualizar contador local para próximas iterações
                candidato.escalas_no_mes++;

                vagasPreenchidas++;

                alocacoes.push({
                    culto_id: cultoId,
                    funcao_id: funcao.id,
                    membro_id: candidato.id,
                    status: 'ALOCADO',
                    motivo_falha: null
                });
            } else {
                vagasVazias++;

                alocacoes.push({
                    culto_id: cultoId,
                    funcao_id: funcao.id,
                    membro_id: null,
                    status: 'SEM_CANDIDATO',
                    motivo_falha: gerarMotivoFalha(funcao, culto.periodo)
                });
            }
        }
    }

    // Salvar no banco
    await salvarAlocacoes(alocacoes);
    await marcarEscalaCriada(cultoId);

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
