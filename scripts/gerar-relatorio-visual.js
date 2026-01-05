// Script para gerar relatorio completo e visual das escalas

async function main() {
    const { createClient } = await import('@supabase/supabase-js');
    const { writeFileSync } = await import('fs');

    const supabase = createClient(
        'https://xawbaaevhmxkmanmfjpq.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
    );

    // Gerar escalas para todas as quintas de novembro 2025
    const mesAno = '11/2025';

    // Buscar quintas
    const { data: quintas } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('periodo', 'quinta')
        .eq('mes', 11)
        .eq('ano', 2025)
        .order('data_culto', { ascending: true });

    console.log(`Gerando escalas para ${quintas?.length || 0} quintas de ${mesAno}...`);

    // Regenerar escalas via API
    for (const quinta of quintas || []) {
        console.log(`  Regenerando: ${quinta.data_culto.split('T')[0]}`);
        await fetch('http://localhost:3000/api/gerar-escala', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ culto_id: quinta.id })
        });
    }

    // Agora gerar o relatorio visual
    let md = `# ESCALAS DE QUINTA-FEIRA\n`;
    md += `## Novembro 2025 - Culto da Vitoria\n\n`;
    md += `---\n\n`;

    for (const culto of quintas || []) {
        const data = new Date(culto.data_culto);
        const dia = data.getDate().toString().padStart(2, '0');
        const mesStr = (data.getMonth() + 1).toString().padStart(2, '0');

        md += `# ${dia}/${mesStr} - QUINTA-FEIRA\n\n`;

        // Buscar alocacoes
        const { data: alocacoes } = await supabase
            .from('escalas_alocacoes')
            .select(`
        status,
        membro:membros(nome_completo, numero),
        funcao:funcoes(nome, setor_pai, ordem_exibicao)
      `)
            .eq('culto_id', culto.id);

        if (!alocacoes || alocacoes.length === 0) {
            md += `> Escala nao gerada\n\n---\n\n`;
            continue;
        }

        // Agrupar por setor
        const setores = {};
        for (const a of alocacoes) {
            const setor = a.funcao?.setor_pai || 'OUTROS';
            if (!setores[setor]) setores[setor] = [];
            setores[setor].push(a);
        }

        // Ordem dos setores
        const ordemSetores = [
            'PORTA - A1 Parede',
            'PORTA - A2',
            'PORTA Nova - A3',
            'PORTA Nova - A4',
            'BANHEIROS',
            'SETOR AZUL',
            'SETOR VERDE',
            'SETOR LARANJA',
            'ALTAR',
            'OFERTA',
            'SALVAS',
            'MAQUINAS (16 ao total)',
            'FINALIZAM AS MAQUINAS'
        ];

        // Primeiro as portas em formato compacto
        md += `## PORTAS\n\n`;
        md += `| Porta | Interno | Hall |\n`;
        md += `|-------|---------|------|\n`;

        const portasOrdem = ['PORTA - A1 Parede', 'PORTA - A2', 'PORTA Nova - A3', 'PORTA Nova - A4'];
        for (const porta of portasOrdem) {
            const funcs = setores[porta] || [];
            const interno = funcs.find(f => f.funcao?.nome === 'Interno');
            const hall = funcs.find(f => f.funcao?.nome === 'Hall');
            const nomePonto = porta.replace('PORTA - ', '').replace('PORTA Nova - ', '');
            md += `| **${nomePonto}** | ${interno?.membro?.nome_completo || '❌ VAGA'} | ${hall?.membro?.nome_completo || '❌ VAGA'} |\n`;
            delete setores[porta];
        }
        md += `\n`;

        // Banheiros
        if (setores['BANHEIROS']) {
            md += `## BANHEIROS\n\n`;
            md += `| Masculino | Feminino |\n`;
            md += `|-----------|----------|\n`;

            const banhs = setores['BANHEIROS'];
            const masc = banhs.filter(b => b.funcao?.nome === 'Masculino');
            const fem = banhs.filter(b => b.funcao?.nome === 'Feminino');

            const maxRows = Math.max(masc.length, fem.length);
            for (let i = 0; i < maxRows; i++) {
                const m = masc[i]?.membro?.nome_completo || '❌ VAGA';
                const f = fem[i]?.membro?.nome_completo || '❌ VAGA';
                md += `| ${m} | ${f} |\n`;
            }
            md += `\n`;
            delete setores['BANHEIROS'];
        }

        // Setores coloridos
        for (const setor of ['SETOR AZUL', 'SETOR VERDE', 'SETOR LARANJA']) {
            if (setores[setor]) {
                const emoji = setor.includes('AZUL') ? '🔵' : setor.includes('VERDE') ? '🟢' : '🟠';
                md += `## ${emoji} ${setor}\n\n`;
                md += `| Funcao | Voluntario |\n`;
                md += `|--------|------------|\n`;

                for (const a of setores[setor]) {
                    const funcao = a.funcao?.nome || 'N/A';
                    const membro = a.membro?.nome_completo || '❌ VAGA';
                    md += `| ${funcao} | ${membro} |\n`;
                }
                md += `\n`;
                delete setores[setor];
            }
        }

        // Altar
        if (setores['ALTAR']) {
            md += `## ⛪ ALTAR\n\n`;
            md += `| Funcao | Voluntario |\n`;
            md += `|--------|------------|\n`;
            for (const a of setores['ALTAR']) {
                md += `| ${a.funcao?.nome} | ${a.membro?.nome_completo || '❌ VAGA'} |\n`;
            }
            md += `\n`;
            delete setores['ALTAR'];
        }

        // Outros setores restantes
        for (const [setor, items] of Object.entries(setores)) {
            md += `## ${setor}\n\n`;
            md += `| Funcao | Voluntario |\n`;
            md += `|--------|------------|\n`;
            for (const a of items) {
                md += `| ${a.funcao?.nome} | ${a.membro?.nome_completo || '❌ VAGA'} |\n`;
            }
            md += `\n`;
        }

        // Resumo
        const preenchidas = alocacoes.filter(a => a.status === 'ALOCADO').length;
        const vazias = alocacoes.filter(a => a.status !== 'ALOCADO').length;
        const total = alocacoes.length;
        const pct = Math.round((preenchidas / total) * 100);

        md += `### 📊 RESUMO: ${preenchidas}/${total} (${pct}%)\n\n`;
        md += `---\n\n`;
    }

    writeFileSync('ESCALAS-NOVEMBRO-2025.md', md, 'utf8');
    console.log('\n✅ Relatorio salvo em ESCALAS-NOVEMBRO-2025.md');
}

main().catch(console.error);
