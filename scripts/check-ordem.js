
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';
const log = (msg) => { console.log(msg); output += msg + '\n'; };

async function checkOrder() {
    const { data } = await supabase
        .from('funcoes')
        .select('nome, setor_pai, ordem_exibicao')
        .eq('ativo', true)
        .order('ordem_exibicao');

    log('ORDEM DAS FUNÇÕES (por ordem_exibicao):');
    data?.forEach((f, i) => {
        log(`${String(f.ordem_exibicao).padStart(2)}. ${f.nome} (${f.setor_pai})`);
    });

    writeFileSync('ordem-funcoes.txt', output);
    console.log('\n📁 Salvo em ordem-funcoes.txt');
}

checkOrder();
