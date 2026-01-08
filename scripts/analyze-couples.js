
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function analyzeCouples() {
    try {
        const { data, error } = await supabase
            .from('membros')
            .select('nome_completo, nivel_experiencia, sexo, conjuge_serve_junto, nome_conjuge')
            .eq('ativo', true)
            .eq('nivel_experiencia', 5);

        if (error) {
            console.error('Error:', error);
            return;
        }

        console.log('=== LÍDERES (Nível 5) E SEUS CÔNJUGES ===\n');
        data.forEach(m => {
            console.log(`Nome: ${m.nome_completo}`);
            console.log(`  Sexo: ${m.sexo}`);
            console.log(`  Cônjuge serve junto: ${m.conjuge_serve_junto}`);
            console.log(`  Nome do cônjuge: ${m.nome_conjuge || 'N/A'}`);
            console.log('---');
        });

        console.log(`\nTotal de líderes: ${data.length}`);

    } catch (e) {
        console.error(e);
    }
}

analyzeCouples();
