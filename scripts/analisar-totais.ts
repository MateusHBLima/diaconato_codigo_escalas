
import { createClient } from '@supabase/supabase-js';
import { parseDisponibilidade } from '../src/services/parser';

const supabase = createClient(
    'https://xawbaaevhmxkmanmfjpq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
);

async function run() {
    const { data: membros } = await supabase.from('membros').select('*').eq('ativo', true);
    if (!membros) return;

    console.log(`\n📊 ANÁLISE DE TOTAIS DE MEMBROS (${membros.length} ativos)`);

    // QUINTA
    const quintas = membros.map(m => ({
        ...m,
        status: parseDisponibilidade(m.disponibilidade_quinta)
    })).filter(m => m.status.disponivel);

    const q3 = quintas.filter(m => m.status.vezesPorMes >= 3).length;
    const q2 = quintas.filter(m => m.status.vezesPorMes === 2).length;
    const q1 = quintas.filter(m => m.status.vezesPorMes === 1).length;

    console.log(`\n📅 QUINTAS: ${quintas.length} disponíveis`);
    console.log(`   - 3x ou +: ${q3}`);
    console.log(`   - 2x:      ${q2}`);
    console.log(`   - 1x:      ${q1}`);
    console.log(`   - Total Slots Potenciais (aprox): ${q3 * 3 + q2 * 2 + q1 * 1}`);

    // DOMINGO
    const domingos = membros.map(m => ({
        ...m,
        status: parseDisponibilidade(m.disponibilidade_domingo)
    })).filter(m => m.status.disponivel);

    const d3 = domingos.filter(m => m.status.vezesPorMes >= 3).length;
    const d2 = domingos.filter(m => m.status.vezesPorMes === 2).length;
    const d1 = domingos.filter(m => m.status.vezesPorMes === 1).length;

    console.log(`\n📅 DOMINGOS: ${domingos.length} disponíveis`);
    console.log(`   - 3x ou +: ${d3}`);
    console.log(`   - 2x:      ${d2}`);
    console.log(`   - 1x:      ${d1}`);
    console.log(`   - Total Slots Potenciais (aprox): ${d3 * 3 + d2 * 2 + d1 * 1}`);
}

run();
