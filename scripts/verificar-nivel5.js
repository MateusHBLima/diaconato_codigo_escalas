
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';
const log = (msg) => { console.log(msg); output += msg + '\n'; };

async function verificarNivel5() {
    log('🔍 VERIFICANDO MEMBROS NÍVEL 5\n');

    const { data: nivel5 } = await supabase
        .from('membros')
        .select('id, nome_completo, nivel_experiencia, nome_conjuge, conjuge_serve_junto, disponibilidade_domingo')
        .eq('nivel_experiencia', 5);

    log(`Total: ${nivel5?.length || 0}\n`);
    nivel5?.forEach(m => {
        log(`- ${m.nome_completo}`);
        log(`  ID: ${m.id}`);
        log(`  Cônjuge: ${m.nome_conjuge || 'N/A'}`);
        log(`  Serve junto: ${m.conjuge_serve_junto}`);
        log(`  Disponibilidade domingo: ${m.disponibilidade_domingo}`);
        log('');
    });

    // Buscar o culto para ver os responsáveis salvos
    log('\n📅 RESPONSÁVEIS NO CULTO 04/01:');
    const { data: culto } = await supabase
        .from('datas_cultos')
        .select('responsavel_geral_1_id, responsavel_geral_2_id')
        .gte('data_culto', '2026-01-04')
        .lt('data_culto', '2026-01-05')
        .single();

    if (culto) {
        log(`Resp 1 ID: ${culto.responsavel_geral_1_id}`);
        log(`Resp 2 ID: ${culto.responsavel_geral_2_id}`);

        // Buscar nomes
        if (culto.responsavel_geral_1_id) {
            const { data: r1 } = await supabase.from('membros').select('nome_completo').eq('id', culto.responsavel_geral_1_id).single();
            log(`Resp 1 Nome: ${r1?.nome_completo}`);
        }
        if (culto.responsavel_geral_2_id) {
            const { data: r2 } = await supabase.from('membros').select('nome_completo').eq('id', culto.responsavel_geral_2_id).single();
            log(`Resp 2 Nome: ${r2?.nome_completo}`);
        }
    }

    writeFileSync('nivel5-resultado.txt', output);
    console.log('\n📁 Salvo em nivel5-resultado.txt');
}

verificarNivel5();
