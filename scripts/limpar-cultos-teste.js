
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Erro: SUPABASE_URL e SUPABASE_KEY são obrigatórios no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function limparMes(mes, ano) {
    console.log(`\n🧹 Limpando dados de ${mes}/${ano}...`);

    // 1. Buscar IDs dos cultos desse mês
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('id, data_culto')
        .eq('mes', mes)
        .eq('ano', ano);

    if (!cultos || cultos.length === 0) {
        console.log('   Nenhum culto encontrado.');
        return;
    }

    const ids = cultos.map(c => c.id);
    console.log(`   Encontrados ${cultos.length} cultos.`);

    // 2. Deletar Alocações (Dependentes)
    const { error: erroAloc } = await supabase
        .from('escalas_alocacoes')
        .delete()
        .in('culto_id', ids);

    if (erroAloc) {
        console.error('   ❌ Erro ao limpar alocações:', erroAloc.message);
        return;
    }
    console.log('   ✅ Alocações removidas.');

    // 3. Deletar Cultos
    const { error: erroCulto } = await supabase
        .from('datas_cultos')
        .delete()
        .in('id', ids);

    if (erroCulto) {
        console.error('   ❌ Erro ao limpar cultos:', erroCulto.message);
        return;
    }
    console.log('   ✅ Cultos removidos.');
}

async function main() {
    console.log('🛑 INICIANDO LIMPEZA DE DADOS DE TESTE 🛑');

    // Limpar Janeiro/2026 e Março/2026 (onde ocorreram os testes)
    await limparMes(1, 2026);
    await limparMes(3, 2026);

    console.log('\n✨ Limpeza concluída! Agora você pode gerar novamente sem duplicatas.');
}

main();
