
import { supabase } from '../src/config/supabase';
import fs from 'fs';

async function main() {
    console.log('Listando todos os membros...');

    const { data: membros, error } = await supabase
        .from('membros')
        .select('nome_completo')
        .order('nome_completo');

    if (error) {
        console.error('Erro:', error);
        return;
    }

    const output = membros.map(m => m.nome_completo).join('\n');
    console.log(output);

    // Also save to file just in case console truncates
    fs.writeFileSync('lista-membros.txt', output, 'utf8');
}

main();
