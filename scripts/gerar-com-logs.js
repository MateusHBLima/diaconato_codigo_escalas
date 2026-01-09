
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Capturar todos os logs
const logs = [];
const originalLog = console.log;
console.log = (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    logs.push(msg);
    originalLog.apply(console, args);
};

// Import dinamicamente para pegar os logs
async function run() {
    try {
        // Buscar um culto para gerar
        const { data: cultos } = await supabase
            .from('datas_cultos')
            .select('id, nome_culto, data_culto')
            .gte('data_culto', '2026-01-04')
            .lt('data_culto', '2026-01-05')
            .order('data_culto')
            .limit(1);

        if (!cultos || cultos.length === 0) {
            console.log('Nenhum culto encontrado para 04/01/2026');
            return;
        }

        const cultoId = cultos[0].id;
        console.log(`\n🏛️ Gerando escala para: ${cultos[0].nome_culto}`);
        console.log(`📅 Data: ${cultos[0].data_culto}`);
        console.log('='.repeat(60));

        // Importar e executar a geração
        const { gerarEscalaParaCulto } = await import('../src/services/escala.js');
        const resultado = await gerarEscalaParaCulto(cultoId);

        console.log('\n' + '='.repeat(60));
        console.log('✅ RESULTADO:');
        console.log(`   Vagas preenchidas: ${resultado.vagas_preenchidas}`);
        console.log(`   Vagas vazias: ${resultado.vagas_vazias}`);

    } catch (error) {
        console.log('ERRO:', error);
    } finally {
        // Salvar logs
        writeFileSync('debug-logs.txt', logs.join('\n'));
        console.log('\n📁 Logs salvos em debug-logs.txt');
    }
}

run();
