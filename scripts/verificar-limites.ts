import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xawbaaevhmxkmanmfjpq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
);

async function verificarLimites() {
    // Buscar quintas de janeiro
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('id')
        .eq('mes', 1)
        .eq('ano', 2026)
        .like('periodo', 'quinta');

    const cultoIds = cultos?.map(c => c.id) || [];

    // Buscar alocações
    const { data: alocacoes } = await supabase
        .from('escalas_alocacoes')
        .select('membro_id, membro:membros(nome_completo, disponibilidade_quinta)')
        .in('culto_id', cultoIds)
        .eq('status', 'ALOCADO');

    // Contar por membro
    const contagem = new Map<string, { nome: string; disp: string; count: number }>();
    alocacoes?.forEach((a: any) => {
        const key = a.membro_id;
        if (!contagem.has(key)) {
            contagem.set(key, { nome: a.membro?.nome_completo, disp: a.membro?.disponibilidade_quinta, count: 0 });
        }
        contagem.get(key)!.count++;
    });

    // Verificar violações
    console.log('VERIFICAÇÃO DE LIMITES - QUINTAS JANEIRO 2026');
    console.log('='.repeat(60));

    let violacoes = 0;
    const violacoesList: string[] = [];

    for (const [id, info] of contagem) {
        const match = info.disp?.match(/(\d+)x/);
        const limite = match ? parseInt(match[1]) : 999;

        if (info.count > limite) {
            violacoesList.push(`❌ ${info.nome}: ${info.count}x (limite: ${limite}x)`);
            violacoes++;
        }
    }

    if (violacoes === 0) {
        console.log('✅ Nenhuma violação de limite encontrada!');
    } else {
        violacoesList.forEach(v => console.log(v));
    }

    console.log('');
    console.log('Total membros escalados:', contagem.size);
    console.log('Violações:', violacoes);

    // Mostrar distribuição
    console.log('');
    console.log('DISTRIBUIÇÃO POR FREQUÊNCIA:');
    const freq = new Map<number, number>();
    for (const [id, info] of contagem) {
        if (!freq.has(info.count)) freq.set(info.count, 0);
        freq.set(info.count, freq.get(info.count)! + 1);
    }

    Array.from(freq.keys()).sort((a, b) => a - b).forEach(k => {
        console.log(`  ${k}x no mês: ${freq.get(k)} membros`);
    });
}

verificarLimites();
