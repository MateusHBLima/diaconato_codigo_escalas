
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xawbaaevhmxkmanmfjpq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
);

async function run() {
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('*')
        .select('*')
        .eq('mes', 1)
        .eq('ano', 2026)
        .or('periodo.eq.domingo_manha,periodo.eq.domingo_noite')
        .order('data_culto');

    if (!cultos) {
        console.log('Nenhum culto encontrado');
        return;
    }

    console.log('--- ESTATÍSTICAS DE DOMINGO ---');
    console.log('Data | Periodo | Alocados | Vazios');

    for (const c of cultos) {
        const { data: aloc } = await supabase
            .from('escalas_alocacoes')
            .select('status')
            .eq('culto_id', c.id);

        const total = aloc?.length || 0;
        const vazios = aloc?.filter(x => x.status === 'SEM_CANDIDATO').length || 0;
        const ocupados = total;
        // Note: In my DB logic, total rows = allocated slots. "SEM_CANDIDATO" usually means rows created but null member? 
        // Actually my logic saves rows with member_id.
        // If "Vazios" logic is different, let's just count total rows.

        console.log(`${c.data_culto.split('T')[0]} | ${c.periodo.padEnd(14)} | ${ocupados} | ${vazios}`);
    }
}

run();
