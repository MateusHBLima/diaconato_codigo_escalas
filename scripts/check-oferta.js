
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkOferta() {
    const { data } = await supabase
        .from('funcoes')
        .select('nome, setor_pai')
        .eq('ativo', true)
        .ilike('setor_pai', '%oferta%');

    console.log('Funções no setor OFERTA:');
    data?.forEach(f => {
        console.log(`  Nome: "${f.nome}" | Setor: "${f.setor_pai}"`);
        console.log(`  Inclui "oferta"? ${f.nome.toLowerCase().includes('oferta')}`);
    });
}

checkOferta();
