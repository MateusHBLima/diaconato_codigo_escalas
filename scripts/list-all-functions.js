
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function listFunctions() {
    try {
        const { data, error } = await supabase
            .from('funcoes')
            .select('nome')
            .eq('ativo', true);

        if (error) {
            console.error('Error fetching functions:', error);
            return;
        }

        const names = data.map(f => f.nome).sort();
        console.log('--- START ---');
        names.forEach(n => console.log(n));
        console.log('--- END ---');
    } catch (e) {
        console.error(e);
    }
}

listFunctions();
