
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xawbaaevhmxkmanmfjpq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
);

async function run() {
    console.log('\n--- RELATÓRIO: FEVEREIRO 2026 ---');

    // 1. Buscar Cultos
    const { data: cultos, error: errC } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('mes', 2)
        .eq('ano', 2026)
        .order('data_culto');

    if (errC || !cultos || cultos.length === 0) {
        console.error('Erro ao buscar cultos ou nenhum encontrado:', errC);
        return;
    }

    const unicos = new Set<string>();
    let totalAssentos = 0;

    // Cabeçalho Simples
    console.log('DIA        | PERIODO        | ALOCADOS');
    console.log('-----------|----------------|---------');

    for (const c of cultos) {
        const { count } = await supabase
            .from('escalas_alocacoes')
            .select('*', { count: 'exact', head: true })
            .eq('culto_id', c.id);

        const { data: alocs } = await supabase
            .from('escalas_alocacoes')
            .select('membro_id')
            .eq('culto_id', c.id);

        if (alocs) {
            alocs.forEach(a => { if (a.membro_id) unicos.add(a.membro_id); });
        }

        const qtd = count || 0;
        totalAssentos += qtd;

        const dia = c.data_culto.split('T')[0].split('-')[2]; // Dia DD
        const periodo = c.periodo.replace('domingo_', 'Dom ').replace('quinta', 'Qui Noite');

        console.log(`${dia.padEnd(10)} | ${periodo.padEnd(14)} | ${qtd}`);
    }

    console.log('----------------------------------');
    console.log(`TOTAL DE ESCALADOS: ${unicos.size} pessoas únicas`);
    console.log(`MEDIA POR CULTO: ${(totalAssentos / cultos.length).toFixed(1)}`);
}

run();
