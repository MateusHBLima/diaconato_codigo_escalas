
import { supabase } from '../src/config/supabase';

async function run() {
    const setores = ['GERAL', 'DECORAÇÃO', 'Decoração', 'Geral']; // Includig variations just in case

    console.log(`Disabling functions in sectors: ${setores.join(', ')}...`);

    const { data, error } = await supabase
        .from('funcoes')
        .update({ ativo: false })
        .in('setor_pai', setores)
        .select();

    if (error) {
        console.error("Error updating functions:", error);
    } else {
        console.log(`Successfully disabled ${data?.length} functions.`);
        data?.forEach(f => console.log(`- Disabled: ${f.nome} (${f.setor_pai})`));
    }
}

run();
