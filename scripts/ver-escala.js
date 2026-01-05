async function main() {
    const { createClient } = await import('@supabase/supabase-js');
    const { writeFileSync } = await import('fs');

    const supabase = createClient(
        'https://xawbaaevhmxkmanmfjpq.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
    );

    // Buscar qualquer quinta
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('periodo', 'quinta')
        .limit(1);

    const culto = cultos[0];

    // Gerar escala via API
    await fetch('http://localhost:3000/api/gerar-escala', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ culto_id: culto.id })
    });

    // Buscar alocacoes com nomes
    const { data: alocacoes } = await supabase
        .from('escalas_alocacoes')
        .select(`
      status,
      motivo_falha,
      membro:membros(nome_completo),
      funcao:funcoes(nome, setor_pai)
    `)
        .eq('culto_id', culto.id);

    const resultado = {
        culto: {
            nome: culto.nome_culto,
            data: culto.data_culto,
            periodo: culto.periodo
        },
        resumo: {
            preenchidas: alocacoes.filter(a => a.status === 'ALOCADO').length,
            vazias: alocacoes.filter(a => a.status !== 'ALOCADO').length
        },
        escala: alocacoes.map(a => ({
            setor: a.funcao?.setor_pai,
            funcao: a.funcao?.nome,
            membro: a.membro?.nome_completo || null,
            status: a.status
        }))
    };

    writeFileSync('escala-quinta.json', JSON.stringify(resultado, null, 2));
    console.log('Salvo em escala-quinta.json');
}

main();
