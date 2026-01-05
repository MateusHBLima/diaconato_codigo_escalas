// Script para testar o balanceamento gerando escalas de múltiplas quintas

async function main() {
    const { createClient } = await import('@supabase/supabase-js');
    const { writeFileSync } = await import('fs');

    const supabase = createClient(
        'https://xawbaaevhmxkmanmfjpq.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
    );

    // Buscar todas as quintas do mês 11/2025
    const { data: quintas } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('periodo', 'quinta')
        .order('data_culto', { ascending: true })
        .limit(4);

    console.log('Quintas encontradas:', quintas.length);

    const resultados = [];

    for (const quinta of quintas) {
        console.log('\n--- Gerando escala para', quinta.data_culto, '---');

        // Chamar API
        const res = await fetch('http://localhost:3000/api/gerar-escala', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ culto_id: quinta.id })
        });

        const resultado = await res.json();

        // Buscar alocações com nomes
        const { data: alocacoes } = await supabase
            .from('escalas_alocacoes')
            .select(`
        membro:membros(nome_completo),
        funcao:funcoes(nome)
      `)
            .eq('culto_id', quinta.id)
            .eq('status', 'ALOCADO');

        resultados.push({
            data: quinta.data_culto.split('T')[0],
            preenchidas: resultado.vagas_preenchidas,
            membros: alocacoes.map(a => a.membro?.nome_completo)
        });
    }

    // Verificar quem aparece em múltiplas quintas
    const contagem = {};
    for (const r of resultados) {
        for (const nome of r.membros) {
            if (nome) {
                contagem[nome] = (contagem[nome] || 0) + 1;
            }
        }
    }

    // Ordenar por frequência
    const ordenado = Object.entries(contagem)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    console.log('\n=== TOP 20 MAIS ESCALADOS ===');
    for (const [nome, vezes] of ordenado) {
        console.log(`${vezes}x - ${nome}`);
    }

    // Salvar resultado
    writeFileSync('teste-balanceamento.json', JSON.stringify({
        resultados,
        top20: ordenado
    }, null, 2));

    console.log('\nResultado salvo em teste-balanceamento.json');
}

main().catch(console.error);
