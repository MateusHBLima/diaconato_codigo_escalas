
import { supabase } from '../src/config/supabase';

async function run() {
    // Check Pool Diário sector
    const { data: pool } = await supabase
        .from('funcoes')
        .select('nome, setor, setor_pai')
        .ilike('nome', '%Pool Diário%');

    console.log("Pool Diário info:", pool);

    // List distinct sectors
    const { data: sectors } = await supabase
        .from('funcoes')
        .select('setor_pai');

    const uniqueSectors = [...new Set(sectors?.map(s => s.setor_pai))];
    console.log("Unique Sectors:", uniqueSectors);
}

run();
