// Investigar porque banheiros ficam vazios

async function main() {
    const { createClient } = await import('@supabase/supabase-js');

    const supabase = createClient(
        'https://xawbaaevhmxkmanmfjpq.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
    );

    // Buscar funcoes de banheiro
    const { data: funcoes } = await supabase
        .from('funcoes')
        .select('*')
        .eq('setor_pai', 'BANHEIROS');

    console.log('=== FUNCOES DE BANHEIRO ===');
    for (const f of funcoes || []) {
        console.log(`Nome: ${f.nome}`);
        console.log(`  Genero: ${f.especificidade_sexo}`);
        console.log(`  Regras: ${f.regras || 'nenhuma'}`);
        console.log(`  Ativo: ${f.ativo}`);
        console.log('');
    }

    // Verificar quantos homens e mulheres ativos existem
    const { data: membros } = await supabase
        .from('membros')
        .select('sexo')
        .eq('ativo', true);

    const homens = membros.filter(m => m.sexo === 'HOMEM').length;
    const mulheres = membros.filter(m => m.sexo === 'MULHER').length;

    console.log('=== MEMBROS ATIVOS ===');
    console.log(`Homens: ${homens}`);
    console.log(`Mulheres: ${mulheres}`);
}

main();
