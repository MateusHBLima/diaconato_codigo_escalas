
import { supabase } from '../src/config/supabase';

async function run() {
    const { data: functions, error } = await supabase
        .from('funcoes')
        .select('*')
        .order('nome');

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("ALL FUNCTIONS (Active & Inactive):");
    functions.forEach(f => {
        console.log(`- [${f.ativo ? 'ACTIVE' : 'INACTIVE'}] ${f.nome} (Setor: ${f.setor_pai})`);
    });
}

run();
