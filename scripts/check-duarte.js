// Script para verificar José Duarte no banco
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    // Buscar todos com prioridade mesa
    const { data: membros } = await supabase
        .from('membros')
        .select('nome_completo, aptidoes, nivel_experiencia')
        .contains('aptidoes', ['Prioridade Mesa']);

    console.log('Membros com Prioridade Mesa:');
    console.log(JSON.stringify(membros, null, 2));

    // Buscar José
    const { data: jose } = await supabase
        .from('membros')
        .select('nome_completo, aptidoes, nivel_experiencia')
        .ilike('nome_completo', '%jose%');

    console.log('\nMembros com "jose" no nome:');
    console.log(JSON.stringify(jose, null, 2));
}

check();
