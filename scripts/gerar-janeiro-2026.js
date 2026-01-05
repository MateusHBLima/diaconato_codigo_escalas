// Limpar duplicados e regenerar escalas de Janeiro 2026

async function main() {
    const { createClient } = await import('@supabase/supabase-js');
    const { writeFileSync } = await import('fs');

    const supabase = createClient(
        'https://xawbaaevhmxkmanmfjpq.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
    );

    console.log('1. Deletando cultos de Janeiro 2026...');

    // Primeiro deletar alocacoes de janeiro 2026
    const { data: cultosJan } = await supabase
        .from('datas_cultos')
        .select('id')
        .eq('mes', 1)
        .eq('ano', 2026);

    for (const c of cultosJan || []) {
        await supabase.from('escalas_alocacoes').delete().eq('culto_id', c.id);
    }

    // Deletar cultos de janeiro
    await supabase.from('datas_cultos').delete().eq('mes', 1).eq('ano', 2026);

    console.log('   Registros antigos deletados');

    console.log('2. Gerando novos cultos...');

    // Gerar cultos via API
    const resp = await fetch('http://localhost:3000/api/gerar-cultos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: 1, ano: 2026 })
    });
    const result = await resp.json();
    console.log(`   Cultos criados: ${result.total_cultos || result.criados}`);

    // Buscar cultos gerados
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('mes', 1)
        .eq('ano', 2026)
        .order('data_culto', { ascending: true });

    console.log(`   Total de cultos: ${cultos?.length || 0}`);

    // Gerar escalas
    console.log('3. Gerando escalas...');
    for (const culto of cultos || []) {
        const data = new Date(culto.data_culto);
        const dia = data.getDate().toString().padStart(2, '0');
        const diaSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][data.getDay()];
        console.log(`   ${dia}/01 ${diaSemana} - ${culto.periodo}`);

        await fetch('http://localhost:3000/api/gerar-escala', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ culto_id: culto.id })
        });
    }

    // Gerar relatorio limpo
    console.log('4. Gerando relatorio...');

    let md = '# ESCALAS JANEIRO 2026\n\n';

    for (const culto of cultos || []) {
        const data = new Date(culto.data_culto);
        const dia = data.getDate().toString().padStart(2, '0');
        const diaSemana = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'][data.getDay()];

        md += `---\n\n`;
        md += `# ${dia}/01/2026 - ${diaSemana}\n`;
        md += `### ${culto.nome_culto}${culto.is_santa_ceia ? ' (Santa Ceia)' : ''}\n\n`;

        // Buscar alocacoes
        const { data: alocacoes } = await supabase
            .from('escalas_alocacoes')
            .select(`
                status,
                motivo_falha,
                membro:membros(nome_completo),
                funcao:funcoes(nome, setor_pai)
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

        // Portas compacto
        const portasOrdem = ['PORTA - A1 Parede', 'PORTA - A2', 'PORTA Nova - A3', 'PORTA Nova - A4'];
        if (portasOrdem.some(p => setores[p])) {
            md += '## PORTAS\n';
            md += '| Porta | Interno | Hall |\n';
            md += '|-------|---------|------|\n';

            for (const porta of portasOrdem) {
                const funcs = setores[porta] || [];
                const interno = funcs.find(f => f.funcao?.nome === 'Interno');
                const hall = funcs.find(f => f.funcao?.nome === 'Hall');
                const nome = porta.replace('PORTA - ', '').replace('PORTA Nova - ', '');
                md += `| ${nome} | ${interno?.membro?.nome_completo || '-'} | ${hall?.membro?.nome_completo || '-'} |\n`;
                delete setores[porta];
            }
            md += '\n';
        }

        // Banheiros
        if (setores['BANHEIROS']) {
            md += '## BANHEIROS\n';
            md += '| Masculino | Feminino |\n';
            md += '|-----------|----------|\n';
            const b = setores['BANHEIROS'];
            const m = b.filter(x => x.funcao?.nome === 'Masculino');
            const f = b.filter(x => x.funcao?.nome === 'Feminino');
            for (let i = 0; i < Math.max(m.length, f.length); i++) {
                md += `| ${m[i]?.membro?.nome_completo || '-'} | ${f[i]?.membro?.nome_completo || '-'} |\n`;
            }
            md += '\n';
            delete setores['BANHEIROS'];
        }

        // Setores coloridos
        for (const setor of ['SETOR AZUL', 'SETOR VERDE', 'SETOR LARANJA']) {
            if (setores[setor]) {
                md += `## ${setor}\n`;
                for (const a of setores[setor]) {
                    if (a.membro?.nome_completo) {
                        md += `- ${a.funcao?.nome}: **${a.membro.nome_completo}**\n`;
                    } else {
                        const motivo = a.motivo_falha ? ` _(${a.motivo_falha})_` : '';
                        md += `- ${a.funcao?.nome}: **❌ VAGA**${motivo}\n`;
                    }
                }
                md += '\n';
                delete setores[setor];
            }
        }

        // Outros
        for (const [setor, items] of Object.entries(setores)) {
            md += `## ${setor}\n`;
            for (const a of items) {
                if (a.membro?.nome_completo) {
                    md += `- ${a.funcao?.nome}: **${a.membro.nome_completo}**\n`;
                } else {
                    const motivo = a.motivo_falha ? ` _(${a.motivo_falha})_` : '';
                    md += `- ${a.funcao?.nome}: **❌ VAGA**${motivo}\n`;
                }
            }
            md += '\n';
        }

        // Resumo
        const ok = alocacoes.filter(a => a.status === 'ALOCADO').length;
        const total = alocacoes.length;
        md += `**Resumo:** ${ok}/${total} (${Math.round(ok / total * 100)}%)\n\n`;
    }

    writeFileSync('ESCALAS-JANEIRO-2026.md', md, 'utf8');
    console.log('\n✅ Arquivo ESCALAS-JANEIRO-2026.md gerado!');
}

main().catch(console.error);
