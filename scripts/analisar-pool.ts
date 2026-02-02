import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xawbaaevhmxkmanmfjpq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
);

async function analisarPool() {
    // Buscar todos os membros ativos com disponibilidade quinta
    const { data: membros } = await supabase
        .from('membros')
        .select('id, nome_completo, sexo, nivel_experiencia, disponibilidade_quinta')
        .eq('ativo', true)
        .not('disponibilidade_quinta', 'is', null);

    // Filtrar quem pode na quinta
    const disponiveis = membros?.filter(m => {
        const disp = m.disponibilidade_quinta?.toLowerCase() || '';
        return !disp.includes('não') && !disp.includes('nao') && disp !== '';
    }) || [];

    // Separar por frequência
    const parseFreq = (disp: string) => {
        const match = disp.match(/(\d+)x/);
        return match ? parseInt(match[1]) : 0;
    };

    const grupo3x = disponiveis.filter(m => parseFreq(m.disponibilidade_quinta) >= 3);
    const grupo2x = disponiveis.filter(m => parseFreq(m.disponibilidade_quinta) === 2);
    const grupo1x = disponiveis.filter(m => parseFreq(m.disponibilidade_quinta) === 1);

    console.log('='.repeat(60));
    console.log('ANÁLISE DO POOL DE QUINTA-FEIRA');
    console.log('='.repeat(60));

    console.log('\n📊 TOTAIS:');
    console.log(`  Total disponíveis: ${disponiveis.length}`);
    console.log(`  3x/mês: ${grupo3x.length}`);
    console.log(`  2x/mês: ${grupo2x.length}`);
    console.log(`  1x/mês: ${grupo1x.length}`);

    // Análise por gênero
    console.log('\n👥 ANÁLISE POR GÊNERO:');

    const mulheres3x = grupo3x.filter(m => m.sexo === 'MULHER');
    const homens3x = grupo3x.filter(m => m.sexo === 'HOMEM');
    console.log(`  3x: ${mulheres3x.length} mulheres, ${homens3x.length} homens`);

    const mulheres2x = grupo2x.filter(m => m.sexo === 'MULHER');
    const homens2x = grupo2x.filter(m => m.sexo === 'HOMEM');
    console.log(`  2x: ${mulheres2x.length} mulheres, ${homens2x.length} homens`);

    const mulheres1x = grupo1x.filter(m => m.sexo === 'MULHER');
    const homens1x = grupo1x.filter(m => m.sexo === 'HOMEM');
    console.log(`  1x: ${mulheres1x.length} mulheres, ${homens1x.length} homens`);

    const totalMulheres = mulheres3x.length + mulheres2x.length + mulheres1x.length;
    const totalHomens = homens3x.length + homens2x.length + homens1x.length;
    console.log(`  TOTAL: ${totalMulheres} mulheres, ${totalHomens} homens`);

    // Análise por nível
    console.log('\n⭐ MULHERES POR NÍVEL (para Apoio):');
    const mulheresAll = [...mulheres3x, ...mulheres2x, ...mulheres1x];
    for (let nivel = 1; nivel <= 4; nivel++) {
        const count = mulheresAll.filter(m => m.nivel_experiencia === nivel).length;
        console.log(`  Nível ${nivel}: ${count} mulheres`);
    }

    // Buscar quantas vagas de Apoio existem
    const { data: funcoes } = await supabase
        .from('funcoes')
        .select('nome, quantidade_pessoas, especificidade_sexo')
        .ilike('nome', '%apoio%');

    console.log('\n🔧 VAGAS DE APOIO NECESSÁRIAS:');
    let totalVagasApoio = 0;
    funcoes?.forEach(f => {
        console.log(`  ${f.nome}: ${f.quantidade_pessoas} vagas (${f.especificidade_sexo})`);
        if (f.especificidade_sexo === 'Mulher') {
            totalVagasApoio += f.quantidade_pessoas;
        }
    });
    console.log(`  TOTAL vagas Apoio (mulher): ${totalVagasApoio}`);

    // Comparar
    console.log('\n📊 COMPARAÇÃO:');
    console.log(`  Mulheres disponíveis no pool Q1 (3x + 2x): ${mulheres3x.length + Math.min(mulheres2x.length, 13)}`);
    console.log(`  Vagas de Apoio que exigem mulher: ${totalVagasApoio}`);

    if (mulheres3x.length + Math.min(mulheres2x.length, 13) < totalVagasApoio) {
        console.log('  ❌ DÉFICIT DE MULHERES NO POOL!');
    } else {
        console.log('  ✅ Pool tem mulheres suficientes');
    }
}

analisarPool();
