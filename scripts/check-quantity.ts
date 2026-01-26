
import { supabase } from '../src/config/supabase';

async function main() {
    const setores = ['SETOR VERDE', 'SETOR AZUL', 'SETOR LARANJA'];
    console.log("Checando coluna 'quantidade_vagas' para Apoio...");

    const { data: funcoes, error } = await supabase
        .from('funcoes')
        .select('id, nome, setor_pai, quantidade') // Nome correto baseado na inspeção
        .in('setor_pai', setores)
        .ilike('nome', '%Apoio%');

    if (error) {
        // Se der erro na seleção, pode ser que o nome da coluna esteja errado, 
        // então vamos listar uma linha qualquer para ver as colunas
        console.log("Erro na query (provavelmente nome da coluna). Tentando listar colunas...");
        const { data: oneRow } = await supabase.from('funcoes').select('*').limit(1);
        if (oneRow && oneRow.length > 0) {
            console.log("Colunas disponíveis:", Object.keys(oneRow[0]));
        }
        return;
    }

    funcoes?.forEach(f => {
        if (!f.nome.toLowerCase().includes('responsável')) {
            console.log(`[${f.setor_pai}] ${f.nome} - Vagas: ${f.quantidade}`);
        }
    });
}

main();
