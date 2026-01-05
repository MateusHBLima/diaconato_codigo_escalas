
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    console.log('🔍 Buscando função de Máquinas...');

    // Tentar encontrar pelo nome que vimos no relatório
    const { data: funcoes, error } = await supabase
        .from('funcoes')
        .select('*')
        .ilike('nome', '%bateria%')
        .ilike('nome', '%quina%');

    if (error) {
        console.error('Erro na busca:', error);
        return;
    }

    if (!funcoes || funcoes.length === 0) {
        console.log('❌ Nenhuma função encontrada com "bateria" e "quina" no nome.');
        // Tentar buscar apenas por "quina"
        const { data: funcoes2 } = await supabase
            .from('funcoes')
            .select('*')
            .ilike('nome', '%quina%');
        console.log('Tentativa 2 (só quina):', funcoes2?.map(f => f.nome));
        return;
    }

    console.log(`✅ Encontrado(s) ${funcoes.length} função:`);
    funcoes.forEach(f => console.log(` - [${f.id}] ${f.nome} (Atuais: ${f.quantidade_pessoas} pessoas, Regras: ${f.regras})`));

    const funcaoAlvo = funcoes[0]; // Assumindo que é a primeira

    console.log(`\n🛠️ Atualizando função: "${funcaoAlvo.nome}"...`);

    const { error: updateError } = await supabase
        .from('funcoes')
        .update({
            quantidade_pessoas: 8,
            regras: null,                // Remove requisitos de permissão/repetição
            especificidade_sexo: 'Unissex' // Remove requisito de sexo (se houver)
        })
        .eq('id', funcaoAlvo.id);

    if (updateError) {
        console.error('❌ Erro ao atualizar:', updateError);
    } else {
        console.log('✨ Função atualizada com sucesso!');
        console.log('   - Quantidade: 8');
        console.log('   - Regras: (removidas)');
        console.log('   - Sexo: Unissex');
    }
}

run();
