// Script para regenerar todas as escalas de Janeiro e validar
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';
const log = (msg) => { console.log(msg); output += msg + '\n'; };

async function regenerarEValidar() {
    log('🔄 REGENERANDO TODAS AS ESCALAS DE JANEIRO 2026');
    log('='.repeat(60) + '\n');

    // 1. Buscar todos os cultos de Janeiro 2026
    const { data: cultos, error } = await supabase
        .from('datas_cultos')
        .select('id, nome_culto, data_culto, periodo')
        .eq('mes', 1)
        .eq('ano', 2026)
        .order('data_culto');

    if (error) {
        log(`❌ Erro: ${error.message}`);
        return;
    }

    log(`📅 Encontrados ${cultos.length} cultos em Janeiro 2026\n`);

    // 2. Resetar todos os cultos
    log('🗑️ Resetando todos os cultos...');
    for (const culto of cultos) {
        await supabase.from('escalas_alocacoes').delete().eq('culto_id', culto.id);
        await supabase.from('datas_cultos').update({
            timestamp_criacao_escala: null,
            responsavel_geral_1_id: null,
            responsavel_geral_2_id: null
        }).eq('id', culto.id);
    }
    log('✅ Cultos resetados\n');

    // 3. Regenerar cada escala
    log('🚀 Regenerando escalas...\n');
    const { gerarEscalaParaCulto } = await import('../dist/services/escala.js');

    let totalPreenchidas = 0;
    let totalVazias = 0;

    for (const culto of cultos) {
        log(`📋 ${culto.data_culto} - ${culto.nome_culto}`);
        try {
            const resultado = await gerarEscalaParaCulto(culto.id);
            log(`   ✅ Preenchidas: ${resultado.vagas_preenchidas} | Vazias: ${resultado.vagas_vazias}`);
            totalPreenchidas += resultado.vagas_preenchidas;
            totalVazias += resultado.vagas_vazias;
        } catch (err) {
            log(`   ❌ Erro: ${err.message}`);
        }
    }

    log('\n' + '='.repeat(60));
    log(`📊 RESUMO: ${totalPreenchidas} preenchidas | ${totalVazias} vazias\n`);

    // 4. Validar José Duarte na Mesa
    log('='.repeat(60));
    log('🔍 VALIDAÇÃO: José Duarte na função Mesa\n');

    const { data: alocacoesMesa } = await supabase
        .from('escalas_alocacoes')
        .select(`
            funcao:funcoes!inner(nome),
            membro:membros(nome_completo),
            culto:datas_cultos!inner(data_culto, nome_culto),
            status
        `)
        .ilike('funcao.nome', '%mesa%água%')
        .eq('culto.mes', 1)
        .eq('culto.ano', 2026);

    for (const a of alocacoesMesa || []) {
        const status = a.membro ? `✅ ${a.membro.nome_completo}` : `❌ VAGA (${a.status})`;
        log(`  ${a.culto.data_culto}: ${status}`);
    }

    // 5. Validar pessoas com NECESSIDADE SENTADO
    log('\n' + '='.repeat(60));
    log('🔍 VALIDAÇÃO: Pessoas com NECESSIDADE SENTADO\n');

    // Buscar membros com essa aptidão
    const { data: membrosSentados } = await supabase
        .from('membros')
        .select('id, nome_completo')
        .contains('aptidoes', ['NECESSIDADE SENTADO']);

    if (membrosSentados && membrosSentados.length > 0) {
        for (const m of membrosSentados) {
            log(`  ${m.nome_completo}:`);

            // Buscar alocações dessa pessoa
            const { data: alocacoes } = await supabase
                .from('escalas_alocacoes')
                .select(`
                    funcao:funcoes(nome),
                    culto:datas_cultos!inner(data_culto)
                `)
                .eq('membro_id', m.id)
                .eq('culto.mes', 1)
                .eq('culto.ano', 2026);

            if (alocacoes && alocacoes.length > 0) {
                for (const a of alocacoes) {
                    const funcaoNome = a.funcao?.nome?.toLowerCase() || '';
                    const ehPermitida = funcaoNome.includes('apoio') ||
                        (funcaoNome.includes('corrente') && (funcaoNome.includes('azul') || funcaoNome.includes('laranja')));
                    const icone = ehPermitida ? '✅' : '❌';
                    log(`    ${a.culto.data_culto}: ${icone} ${a.funcao?.nome}`);
                }
            } else {
                log('    (Nenhuma alocação encontrada)');
            }
        }
    } else {
        log('  Nenhum membro com aptidão NECESSIDADE SENTADO encontrado');
    }

    writeFileSync('validacao-escalas.txt', output);
    log('\n📁 Resultado salvo em validacao-escalas.txt');
}

regenerarEValidar();
