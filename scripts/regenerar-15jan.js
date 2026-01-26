import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';
const log = (msg) => { console.log(msg); output += msg + '\n'; };

async function regenerarEscala15Janeiro() {
    log('🔄 REGENERANDO ESCALA - 15/01/2026\n');
    log('='.repeat(60));

    // 1. Buscar culto do dia 15/01/2026
    const { data: cultos, error: erroCulto } = await supabase
        .from('datas_cultos')
        .select('id, nome_culto, data_culto, periodo')
        .gte('data_culto', '2026-01-15')
        .lt('data_culto', '2026-01-16')
        .limit(1);

    if (erroCulto || !cultos || cultos.length === 0) {
        log('❌ Culto não encontrado para 15/01/2026');
        log(`Erro: ${JSON.stringify(erroCulto)}`);
        return;
    }

    const culto = cultos[0];
    log(`📅 Culto: ${culto.nome_culto}`);
    log(`📆 Data: ${culto.data_culto}`);
    log(`🕐 Período: ${culto.periodo}`);
    log(`🆔 ID: ${culto.id}`);

    // 2. Deletar alocações existentes
    log('\n🗑️ Deletando alocações antigas...');
    const { error: erroDel } = await supabase
        .from('escalas_alocacoes')
        .delete()
        .eq('culto_id', culto.id);

    if (erroDel) {
        log(`❌ Erro ao deletar: ${erroDel.message}`);
        return;
    }
    log('✅ Alocações deletadas');

    // 3. Resetar timestamp do culto
    log('\n🔓 Resetando timestamp do culto...');
    const { error: erroReset } = await supabase
        .from('datas_cultos')
        .update({
            timestamp_criacao_escala: null,
            responsavel_geral_1_id: null,
            responsavel_geral_2_id: null
        })
        .eq('id', culto.id);

    if (erroReset) {
        log(`❌ Erro ao resetar: ${erroReset.message}`);
        return;
    }
    log('✅ Culto resetado');

    // 4. Chamar módulo compilado para regenerar
    log('\n🚀 Gerando nova escala com correções...');

    try {
        const { gerarEscalaParaCulto } = await import('../dist/services/escala.js');
        const resultado = await gerarEscalaParaCulto(culto.id);

        log('\n✅ ESCALA REGENERADA!');
        log(`   Vagas preenchidas: ${resultado.vagas_preenchidas}`);
        log(`   Vagas vazias: ${resultado.vagas_vazias}`);

        // 5. Buscar detalhes da escala gerada
        log('\n' + '='.repeat(60));
        log('📋 DETALHES DA ESCALA GERADA:\n');

        const { data: alocacoes, error: erroAloc } = await supabase
            .from('escalas_alocacoes')
            .select(`
                status,
                motivo_falha,
                funcao:funcoes(nome, setor_pai, especificidade_sexo),
                membro:membros(nome_completo, nivel_experiencia, aptidoes, sexo)
            `)
            .eq('culto_id', culto.id)
            .order('funcao_id');

        if (!erroAloc && alocacoes) {
            // Agrupar por setor
            const porSetor = {};
            for (const aloc of alocacoes) {
                const setor = aloc.funcao?.setor_pai || 'OUTROS';
                if (!porSetor[setor]) porSetor[setor] = [];
                porSetor[setor].push(aloc);
            }

            for (const [setor, alocs] of Object.entries(porSetor)) {
                log(`\n📍 ${setor}:`);
                for (const aloc of alocs) {
                    const funcNome = aloc.funcao?.nome || '?';
                    if (aloc.status === 'ALOCADO' && aloc.membro) {
                        const nome = aloc.membro.nome_completo;
                        const estrelas = '⭐'.repeat(aloc.membro.nivel_experiencia || 1);
                        const aptidoes = aloc.membro.aptidoes?.join(', ') || '';
                        const aptStr = aptidoes ? ` [${aptidoes}]` : '';
                        log(`   ✅ ${funcNome}: ${nome} ${estrelas}${aptStr}`);
                    } else {
                        log(`   ❌ ${funcNome}: VAZIO - ${aloc.motivo_falha || 'sem motivo'}`);
                    }
                }
            }
        }

        // 6. Verificar correções específicas
        log('\n' + '='.repeat(60));
        log('🔍 VALIDAÇÃO DAS CORREÇÕES:\n');

        // Verificar NECESSIDADE SENTADO
        const necessidadeSentado = alocacoes?.filter(a =>
            a.membro?.aptidoes?.includes('NECESSIDADE SENTADO')
        ) || [];

        if (necessidadeSentado.length > 0) {
            log('👤 Membros com NECESSIDADE SENTADO:');
            for (const aloc of necessidadeSentado) {
                const setor = aloc.funcao?.setor_pai || '';
                const ehSetorPermitido = setor.toLowerCase().includes('azul') || setor.toLowerCase().includes('laranja');
                const status = ehSetorPermitido ? '✅' : '❌';
                log(`   ${status} ${aloc.membro?.nome_completo} → ${aloc.funcao?.nome} (${setor})`);
            }
        } else {
            log('ℹ️ Nenhum membro com NECESSIDADE SENTADO escalado');
        }

        // Verificar Púlpito
        log('\n🎤 Púlpito:');
        const pulpito = alocacoes?.find(a => a.funcao?.nome?.includes('Púlpito'));
        const correnteVerdeAzul = alocacoes?.find(a =>
            a.funcao?.nome?.toLowerCase().includes('corrente entre verde e azul')
        );

        if (pulpito && correnteVerdeAzul) {
            const mesmaPessoa = pulpito.membro?.nome_completo === correnteVerdeAzul.membro?.nome_completo;
            if (mesmaPessoa) {
                log(`   ✅ Púlpito repetiu Corrente Verde/Azul: ${pulpito.membro?.nome_completo}`);
            } else {
                log(`   ❌ Púlpito: ${pulpito.membro?.nome_completo || 'VAZIO'}`);
                log(`   ❌ Corrente Verde/Azul: ${correnteVerdeAzul.membro?.nome_completo || 'VAZIO'}`);
            }
        } else {
            log(`   Púlpito: ${pulpito?.membro?.nome_completo || pulpito?.motivo_falha || 'N/A'}`);
        }

        // Verificar Hall
        log('\n🚪 Hall (nível de estrelas):');
        const hallAlocs = alocacoes?.filter(a => a.funcao?.nome?.includes('Hall')) || [];
        for (const aloc of hallAlocs) {
            if (aloc.membro) {
                const estrelas = aloc.membro.nivel_experiencia || 1;
                const status = estrelas <= 2 ? '✅' : '⚠️';
                log(`   ${status} ${aloc.funcao?.nome}: ${aloc.membro.nome_completo} (${estrelas}⭐)`);
            }
        }

    } catch (importError) {
        log(`\n❌ Erro ao gerar: ${importError.message}`);
        log(importError.stack);
    }

    writeFileSync('escala-15jan-resultado.txt', output);
    console.log('\n📁 Log salvo em escala-15jan-resultado.txt');
}

regenerarEscala15Janeiro();
