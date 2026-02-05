
import { supabase } from '../src/config/supabase';

async function run() {
    const { data: functions } = await supabase
        .from('funcoes')
        .select('nome, setor_pai, ativo')
        .in('setor_pai', ['GERAL', 'DECORAÇÃO'])
        .order('setor_pai');

    console.log("FUNÇÕES NOS SETORES ALVO:");
    functions?.forEach(f => {
        console.log(`[${f.setor_pai}] ${f.nome} (Ativo: ${f.ativo})`);
    });
}

run();
