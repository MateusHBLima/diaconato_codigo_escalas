
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xawbaaevhmxkmanmfjpq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
);

async function run() {
    console.log('--- RELATÓRIO FEVEREIRO 2026 ---');

    // 1. Buscar Cultos de Fevereiro
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('mes', 2)
        .eq('ano', 2026)
        .order('data_culto');

    if (!cultos || cultos.length === 0) {
        console.log('Nenhum culto encontrado para Fevereiro/2026.');
        return;
    }

    const unicosNoMes = new Set<string>();
    let totalAssentos = 0;

    console.log(`\nData       | Dia    | Período        | Alocados | Vazios`);
    console.log(`-----------|--------|----------------|----------|-------`);

    for (const cult of cultos) {
        // Contar alocações no culto
        const { data: alocacoes } = await supabase
            .from('escalas_alocacoes')
            .select('*')
            .eq('culto_id', cult.id);

        const total = alocacoes?.length || 0;
        const vazios = alocacoes?.filter(a => a.status === 'SEM_CANDIDATO' || !a.member_id).length || 0;
        const ocupados = total; // Assumindo que table contem slots. Se status for usado, ajustar.

        // No meu sistema status SEM_CANDIDATO contam como slots vazios mas existem na tabela?
        // Vamos checar member_id

        const reais = alocacoes?.filter(a => a.member_id).length || 0;

        if (alocacoes) {
            // DEBUG: Mostrar primeira alocação se houver erro
            if (cult === cultos[0]) {
                console.log('DEBUG: Exemplo alocação:', alocacoes && alocacoes.length > 0 ? alocacoes[0] : 'Vazio');
            }

            alocacoes.forEach(a => {
                if (a.member_id) unicosNoMes.add(a.member_id);
            });
        }

        totalAssentos += reais;

        // Formatar Célula
        const dataStr = cult.data_culto.split('T')[0];
        const diaSemana = new Date(cult.data_culto).getDay(); // 0=Dom, 4=Qui
        const diaNome = diaSemana === 0 ? 'Dom' : 'Qui';

        console.log(`${dataStr} | ${diaNome}    | ${cult.periodo.padEnd(14)} | ${reais}       | ${vazios}`);
    }

    console.log(`\n--- TOTAIS ---`);
    console.log(`Total de Assentos Preenchidos: ${totalAssentos}`);
    console.log(`Total de Membros Únicos Usados: ${unicosNoMes.size}`);
}

run();
