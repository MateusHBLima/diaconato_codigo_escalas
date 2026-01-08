
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function listFunctions() {
    try {
        const { data, error } = await supabase
            .from('funcoes')
            .select('nome, especificidade_sexo, regras')
            .eq('ativo', true)
            .order('nome');

        if (error) {
            console.error('Error:', error);
            return;
        }

        const output = data.map(f => `${f.nome} | Sexo: ${f.especificidade_sexo} | Regras: ${f.regras || 'null'}`).join('\n');
        writeFileSync('funcoes-ativas.txt', output);
        console.log('Salvo em funcoes-ativas.txt');
        console.log(`Total: ${data.length} funções`);
    } catch (e) {
        console.error(e);
    }
}

listFunctions();
