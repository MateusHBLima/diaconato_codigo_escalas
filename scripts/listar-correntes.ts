
import { supabase } from '../src/config/supabase';

async function main() {
    console.log('Buscando funções "Corrente"...');

    const { data: funcoes, error } = await supabase
        .from('funcoes')
        .select('nome, setor_pai')
        .ilike('nome', '%Corrente%')
        .eq('ativo', true);

    if (error) {
        console.error('Erro:', error);
        return;
    }

    const output = funcoes.map(f => `[${f.setor_pai}]__${f.nome}`).join('\n');
    console.log(output);
}
main();
