
import { supabase } from '../src/config/supabase';

async function main() {
    console.log("Testing supabase query...");
    const { data, error } = await supabase
        .from('escalas_alocacoes')
        .select(`
            membro_id,
            culto:datas_cultos!inner(data_culto, periodo, mes, ano)
        `)
        .eq('status', 'ALOCADO')
        .limit(5);

    if (error) {
        console.error("Supabase Error:", error);
    } else {
        console.log("Success! Rows:", data?.length);
    }
}

main();
