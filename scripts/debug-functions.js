
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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
        console.log(JSON.stringify(names, null, 2));
    } catch (e) {
        console.error(e);
    }
}

listFunctions();
