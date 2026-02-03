import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xawbaaevhmxkmanmfjpq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
);

async function limpar() {
    console.log('🧹 Limpando dados de Janeiro 2026...');

    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('id')
        .eq('mes', 1)
        .eq('ano', 2026);

    if (!cultos || cultos.length === 0) {
        console.log('Nenhum culto encontrado para deletar');
        return;
    }

    const ids = cultos.map(c => c.id);
    console.log(`Encontrados ${ids.length} cultos`);

    // Deletar alocações primeiro
    const { error: errAloc } = await supabase
        .from('escalas_alocacoes')
        .delete()
        .in('culto_id', ids);

    if (errAloc) {
        console.log('Erro ao deletar alocações:', errAloc.message);
    } else {
        console.log('✅ Alocações deletadas');
    }

    // Deletar cultos
    const { error: errCulto } = await supabase
        .from('datas_cultos')
        .delete()
        .in('id', ids);

    if (errCulto) {
        console.log('Erro ao deletar cultos:', errCulto.message);
    } else {
        console.log('✅ Cultos deletados');
    }

    console.log('🧹 Limpeza concluída!');
}

limpar();
