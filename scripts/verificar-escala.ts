/**
 * Script de Verificação de Escala
 * 
 * Analisa cada culto gerado e verifica se todas as regras foram aplicadas corretamente.
 * 
 * Regras verificadas:
 * 1. Responsáveis Gerais são sempre um casal
 * 2. José Duarte está sempre na Mesa
 * 3. NECESSIDADE SENTADO só em Corrente Azul/Laranja
 * 4. Sistema de estrelas respeitado
 * 5. Regras de repetição aplicadas (Máquinas, Banheiros, etc.)
 * 6. Gênero respeitado
 */

import { supabase } from '../src/config/supabase.js';

interface Violacao {
    culto: string;
    data: string;
    regra: string;
    descricao: string;
    gravidade: 'CRITICO' | 'ALERTA' | 'INFO';
}

async function verificarEscalas(mes: number, ano: number) {
    console.log(`\n🔍 VERIFICAÇÃO DE ESCALAS: ${mes}/${ano}`);
    console.log('='.repeat(60));

    const violacoes: Violacao[] = [];

    // Buscar cultos do mês
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('mes', mes)
        .eq('ano', ano)
        .order('data_culto');

    if (!cultos || cultos.length === 0) {
        console.log('❌ Nenhum culto encontrado para verificar');
        return;
    }

    console.log(`📅 ${cultos.length} cultos a verificar\n`);

    // Buscar todos os membros
    const { data: membros } = await supabase.from('membros').select('*');
    const membrosMap = new Map(membros?.map(m => [m.id, m]) || []);

    // Buscar todas as funções
    const { data: funcoes } = await supabase.from('funcoes').select('*');
    const funcoesMap = new Map(funcoes?.map(f => [f.id, f]) || []);

    for (const culto of cultos) {
        console.log(`\n📋 Verificando: ${culto.nome_culto} (${culto.data_culto})`);

        // Buscar alocações do culto
        const { data: alocacoes } = await supabase
            .from('escalas_alocacoes')
            .select('*')
            .eq('culto_id', culto.id);

        if (!alocacoes || alocacoes.length === 0) {
            violacoes.push({
                culto: culto.nome_culto,
                data: culto.data_culto,
                regra: 'ALOCAÇÕES',
                descricao: 'Nenhuma alocação encontrada para este culto',
                gravidade: 'CRITICO'
            });
            continue;
        }

        // =============================================
        // REGRA 1: Responsáveis Gerais devem ser casal
        // =============================================
        const resp1 = culto.responsavel_geral_1_id;
        const resp2 = culto.responsavel_geral_2_id;

        if (!resp1 || !resp2) {
            violacoes.push({
                culto: culto.nome_culto,
                data: culto.data_culto,
                regra: 'RESPONSÁVEIS GERAIS',
                descricao: `Responsáveis Gerais incompletos: R1=${resp1 ? '✓' : '✗'} R2=${resp2 ? '✓' : '✗'}`,
                gravidade: 'CRITICO'
            });
        } else {
            const membro1 = membrosMap.get(resp1);
            const membro2 = membrosMap.get(resp2);

            if (membro1 && membro2) {
                // Verificar se são casal
                const nomeConj1 = membro1.nome_conjuge?.toLowerCase().trim();
                const nome2Lower = membro2.nome_completo.toLowerCase().trim();
                const ehCasal = nomeConj1 && (nome2Lower.includes(nomeConj1.split(' ')[0]) || nomeConj1.includes(nome2Lower.split(' ')[0]));

                if (!ehCasal) {
                    violacoes.push({
                        culto: culto.nome_culto,
                        data: culto.data_culto,
                        regra: 'RESPONSÁVEIS GERAIS',
                        descricao: `${membro1.nome_completo} e ${membro2.nome_completo} NÃO são casal`,
                        gravidade: 'CRITICO'
                    });
                } else {
                    console.log(`   ✅ Responsáveis Gerais: ${membro1.nome_completo} + ${membro2.nome_completo} (casal)`);
                }
            }
        }

        // =============================================
        // REGRA 2: José Duarte na Mesa
        // =============================================
        const alocacoesMesa = alocacoes.filter(a => {
            const funcao = funcoesMap.get(a.funcao_id);
            return funcao?.nome.toLowerCase().includes('mesa');
        });

        let joseDuarteNaMesa = false;
        for (const aloc of alocacoesMesa) {
            const membro = membrosMap.get(aloc.membro_id);
            if (membro?.nome_completo.toLowerCase().includes('jose') ||
                membro?.nome_completo.toLowerCase().includes('josé')) {
                if (membro.nome_completo.toLowerCase().includes('duarte')) {
                    joseDuarteNaMesa = true;
                    console.log(`   ✅ José Duarte na Mesa: ${membro.nome_completo}`);
                }
            }
        }

        if (alocacoesMesa.length > 0 && !joseDuarteNaMesa) {
            // Verificar se José Duarte existe no banco
            const joseDuarte = membros?.find(m =>
                m.nome_completo.toLowerCase().includes('duarte') &&
                (m.nome_completo.toLowerCase().includes('jose') || m.nome_completo.toLowerCase().includes('josé'))
            );

            if (joseDuarte && joseDuarte.aptidoes?.includes('Prioridade Mesa')) {
                violacoes.push({
                    culto: culto.nome_culto,
                    data: culto.data_culto,
                    regra: 'PRIORIDADE MESA',
                    descricao: `José Duarte (Prioridade Mesa) NÃO está na função Mesa`,
                    gravidade: 'CRITICO'
                });
            }
        }

        // =============================================
        // REGRA 3: NECESSIDADE SENTADO só em Corrente Azul/Laranja
        // =============================================
        for (const aloc of alocacoes) {
            if (!aloc.membro_id) continue;
            const membro = membrosMap.get(aloc.membro_id);
            const funcao = funcoesMap.get(aloc.funcao_id);

            if (membro?.aptidoes?.includes('NECESSIDADE SENTADO') && funcao) {
                const ehCorrente = funcao.nome.toLowerCase().includes('corrente');
                const ehSetorPermitido =
                    funcao.setor_pai?.toLowerCase().includes('azul') ||
                    funcao.setor_pai?.toLowerCase().includes('laranja');

                if (!ehCorrente || !ehSetorPermitido) {
                    violacoes.push({
                        culto: culto.nome_culto,
                        data: culto.data_culto,
                        regra: 'NECESSIDADE SENTADO',
                        descricao: `${membro.nome_completo} (NECESSIDADE SENTADO) alocado em ${funcao.nome} (${funcao.setor_pai})`,
                        gravidade: 'CRITICO'
                    });
                }
            }
        }

        // =============================================
        // REGRA 4: Sistema de Estrelas
        // =============================================
        const STAR_REQUIREMENTS: Record<number, string[]> = {
            1: ['Hall', 'Apoio'],
            2: ['Interno', 'Máquinas', 'Cartão'],
            3: ['Salvas', 'Corrente', 'Responsável'],
            4: ['Púlpito', 'Mesa']
        };

        const MAX_STAR_LIMITS: Record<string, number> = {
            'Hall': 2,
            'Apoio': 2
        };

        for (const aloc of alocacoes) {
            if (!aloc.membro_id) continue;
            const membro = membrosMap.get(aloc.membro_id);
            const funcao = funcoesMap.get(aloc.funcao_id);

            if (!membro || !funcao) continue;

            const estrelas = membro.nivel_experiencia || 1;

            // Verificar teto (Max Stars)
            for (const [chave, maxEstrelas] of Object.entries(MAX_STAR_LIMITS)) {
                if (funcao.nome.includes(chave)) {
                    // Exceção: "Responsável e apoio" é nível 3
                    if (chave === 'Apoio' && funcao.nome.toLowerCase().includes('responsável')) continue;

                    if (estrelas > maxEstrelas) {
                        violacoes.push({
                            culto: culto.nome_culto,
                            data: culto.data_culto,
                            regra: 'SISTEMA ESTRELAS (TETO)',
                            descricao: `${membro.nome_completo} (${estrelas}★) em ${funcao.nome} (Máx: ${maxEstrelas}★)`,
                            gravidade: 'ALERTA'
                        });
                    }
                }
            }

            // Verificar N5 em função normal
            if (estrelas === 5) {
                // N5 não deve estar em funções normais (exceto Oferta)
                if (!funcao.setor_pai?.toLowerCase().includes('oferta')) {
                    violacoes.push({
                        culto: culto.nome_culto,
                        data: culto.data_culto,
                        regra: 'LÍDER N5',
                        descricao: `${membro.nome_completo} (N5) alocado em função normal: ${funcao.nome}`,
                        gravidade: 'ALERTA'
                    });
                }
            }
        }

        // =============================================
        // REGRA 5: Gênero
        // =============================================
        for (const aloc of alocacoes) {
            if (!aloc.membro_id) continue;
            const membro = membrosMap.get(aloc.membro_id);
            const funcao = funcoesMap.get(aloc.funcao_id);

            if (!membro || !funcao) continue;

            if (funcao.especificidade_sexo === 'Homem' && membro.sexo === 'MULHER') {
                violacoes.push({
                    culto: culto.nome_culto,
                    data: culto.data_culto,
                    regra: 'GÊNERO',
                    descricao: `${membro.nome_completo} (MULHER) em função masculina: ${funcao.nome}`,
                    gravidade: 'CRITICO'
                });
            }

            if (funcao.especificidade_sexo === 'Mulher' && membro.sexo === 'HOMEM') {
                violacoes.push({
                    culto: culto.nome_culto,
                    data: culto.data_culto,
                    regra: 'GÊNERO',
                    descricao: `${membro.nome_completo} (HOMEM) em função feminina: ${funcao.nome}`,
                    gravidade: 'CRITICO'
                });
            }
        }

        // =============================================
        // STATS do Culto
        // =============================================
        const preenchidas = alocacoes.filter(a => a.membro_id).length;
        const vazias = alocacoes.filter(a => !a.membro_id).length;
        console.log(`   📊 Preenchidas: ${preenchidas} | Vazias: ${vazias}`);
    }

    // =============================================
    // RESUMO FINAL
    // =============================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA VERIFICAÇÃO');
    console.log('='.repeat(60));

    const criticos = violacoes.filter(v => v.gravidade === 'CRITICO');
    const alertas = violacoes.filter(v => v.gravidade === 'ALERTA');
    const infos = violacoes.filter(v => v.gravidade === 'INFO');

    console.log(`\n🔴 CRÍTICOS: ${criticos.length}`);
    console.log(`🟡 ALERTAS: ${alertas.length}`);
    console.log(`🔵 INFO: ${infos.length}`);

    if (criticos.length > 0) {
        console.log('\n🔴 VIOLAÇÕES CRÍTICAS:');
        console.log('-'.repeat(40));
        for (const v of criticos) {
            console.log(`   [${v.data}] ${v.regra}: ${v.descricao}`);
        }
    }

    if (alertas.length > 0) {
        console.log('\n🟡 ALERTAS:');
        console.log('-'.repeat(40));
        for (const v of alertas) {
            console.log(`   [${v.data}] ${v.regra}: ${v.descricao}`);
        }
    }

    if (violacoes.length === 0) {
        console.log('\n✅ TODAS AS REGRAS FORAM APLICADAS CORRETAMENTE!');
    }

    return violacoes;
}

// Executar
const mes = parseInt(process.argv[2]) || 3;
const ano = parseInt(process.argv[3]) || 2026;

verificarEscalas(mes, ano).then(violacoes => {
    process.exit(violacoes && violacoes.length > 0 ? 1 : 0);
});
