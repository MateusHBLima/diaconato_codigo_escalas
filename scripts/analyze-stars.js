
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function analyzeStarDistribution() {
    try {
        const { data, error } = await supabase
            .from('membros')
            .select('nome_completo, nivel_experiencia, sexo')
            .eq('ativo', true);

        if (error) {
            console.error('Error:', error);
            return;
        }

        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, null: 0 };
        data.forEach(m => {
            const level = m.nivel_experiencia || 'null';
            distribution[level] = (distribution[level] || 0) + 1;
        });

        console.log('=== DISTRIBUIÇÃO POR ESTRELAS ===');
        console.log('Nível 1:', distribution[1]);
        console.log('Nível 2:', distribution[2]);
        console.log('Nível 3:', distribution[3]);
        console.log('Nível 4:', distribution[4]);
        console.log('Nível 5 (Líderes):', distribution[5]);
        console.log('Sem nível (null):', distribution['null']);
        console.log('TOTAL:', data.length);

        // Listar líderes
        const leaders = data.filter(m => m.nivel_experiencia === 5);
        console.log('\n=== LÍDERES (Nível 5) ===');
        leaders.forEach(l => console.log(`- ${l.nome_completo} (${l.sexo})`));

    } catch (e) {
        console.error(e);
    }
}

analyzeStarDistribution();
