
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';
const log = (msg) => { console.log(msg); output += msg + '\n'; };

async function regenerarEscala() {
    log('🔄 REGENERANDO ESCALA COM NOVAS REGRAS\n');
    log('='.repeat(60));

    // 1. Buscar culto do dia 04/01/2026
    const { data: cultos, error: erroCulto } = await supabase
        .from('datas_cultos')
        .select('id, nome_culto, data_culto')
        .gte('data_culto', '2026-01-04')
        .lt('data_culto', '2026-01-05')
        .limit(1);

    if (erroCulto || !cultos || cultos.length === 0) {
        log('❌ Culto não encontrado');
        return;
    }

    const culto = cultos[0];
    log(`📅 Culto: ${culto.nome_culto}`);
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

    // 4. Chamar API para regenerar
    log('\n🚀 Chamando API para regenerar escala...');

    try {
        // Importar o módulo compilado
        const { gerarEscalaParaCulto } = await import('../dist/services/escala.js');

        const resultado = await gerarEscalaParaCulto(culto.id);

        log('\n✅ ESCALA REGENERADA!');
        log(`   Vagas preenchidas: ${resultado.vagas_preenchidas}`);
        log(`   Vagas vazias: ${resultado.vagas_vazias}`);

    } catch (importError) {
        log(`\n⚠️ Não foi possível importar módulo local: ${importError.message}`);
        log('   Tentando via API HTTP...');

        // Tentar via HTTP (se tiver servidor rodando)
        try {
            const response = await fetch(`http://localhost:3000/api/escala/gerar/${culto.id}`, {
                method: 'POST'
            });

            if (response.ok) {
                const data = await response.json();
                log('\n✅ ESCALA REGENERADA VIA API!');
                log(`   Resultado: ${JSON.stringify(data)}`);
            } else {
                log(`❌ API retornou erro: ${response.status}`);
            }
        } catch (fetchError) {
            log(`❌ API não disponível: ${fetchError.message}`);
            log('\n💡 Por favor, regenere a escala manualmente pelo frontend ou execute:');
            log('   npm run dev (em outro terminal)');
            log(`   curl -X POST http://localhost:3000/api/escala/gerar/${culto.id}`);
        }
    }

    writeFileSync('regenerar-resultado.txt', output);
    console.log('\n📁 Log salvo em regenerar-resultado.txt');
}

regenerarEscala();
