// Script para gerar relatorio completo das escalas em Markdown

async function main() {
    const { createClient } = await import('@supabase/supabase-js');
    const { writeFileSync } = await import('fs');

    const supabase = createClient(
        'https://xawbaaevhmxkmanmfjpq.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
    );

    // Buscar todas as quintas
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('periodo', 'quinta')
        .order('data_culto', { ascending: true });

    let md = '# Escalas de Quinta-Feira - Culto da Vitoria\n\n';
    md += '---\n\n';

    for (const culto of cultos) {
        const data = new Date(culto.data_culto);
        const dataStr = data.toLocaleDateString('pt-BR');

        md += `## ${dataStr} - ${culto.nome_culto}\n\n`;

        // Buscar alocacoes
        const { data: alocacoes } = await supabase
            .from('escalas_alocacoes')
            .select(`
        status,
        membro:membros(nome_completo),
        funcao:funcoes(nome, setor_pai, ordem_exibicao)
      `)
            .eq('culto_id', culto.id);

        if (!alocacoes || alocacoes.length === 0) {
            md += '> Escala nao gerada\n\n';
            continue;
        }

        // Agrupar por setor
        const setores = {};
        for (const a of alocacoes) {
            const setor = a.funcao?.setor_pai || 'OUTROS';
            if (!setores[setor]) setores[setor] = [];
            setores[setor].push(a);
        }

        for (const [setor, items] of Object.entries(setores)) {
            md += `### ${setor}\n\n`;
            md += '| Funcao | Voluntario | Status |\n';
            md += '|--------|------------|--------|\n';

            for (const a of items) {
                const funcao = a.funcao?.nome || 'N/A';
                const membro = a.membro?.nome_completo || '**VAGA**';
                const status = a.status === 'ALOCADO' ? 'OK' : 'VAGA';
                md += `| ${funcao} | ${membro} | ${status} |\n`;
            }
            md += '\n';
        }

        // Resumo
        const preenchidas = alocacoes.filter(a => a.status === 'ALOCADO').length;
        const vazias = alocacoes.filter(a => a.status !== 'ALOCADO').length;
        md += `**Resumo:** ${preenchidas} preenchidas | ${vazias} vagas\n\n`;
        md += '---\n\n';
    }

    writeFileSync('escalas-quintas.md', md, 'utf8');
    console.log('Relatorio salvo em escalas-quintas.md');
}

main().catch(console.error);
