
import { supabase } from '../src/config/supabase';

async function main() {
    const setores = ['SETOR VERDE', 'SETOR AZUL', 'SETOR LARANJA'];

    console.log("Buscando funções 'Apoio' nos setores especificados...");

    const { data: funcoes, error } = await supabase
        .from('funcoes')
        .select('nome, setor_pai, ordem_exibicao')
        .in('setor_pai', setores)
        .ilike('nome', '%Apoio%')
        .order('setor_pai')
        .order('ordem_exibicao');

    if (error) {
        console.error("Erro:", error);
        return;
    }

    console.log("\nFunções encontradas:");
    let lastSetor = '';
    let count = 0;

    funcoes?.forEach(f => {
        if (f.setor_pai !== lastSetor) {
            console.log(`\n--- ${f.setor_pai} ---`);
            lastSetor = f.setor_pai;
            count = 0;
        }
        count++;
        // Se for "Responsável e apoio", ignorar pois é nível 3
        if (f.nome.toLowerCase().includes('responsável')) {
            console.log(`   [SKIP] ${f.nome} (Ordem: ${f.ordem_exibicao}) - É Responsável`);
        } else {
            console.log(`   [${count}] ${f.nome} (Ordem: ${f.ordem_exibicao})`);
        }
    });
}

main();
