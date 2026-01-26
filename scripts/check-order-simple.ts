
import { supabase } from '../src/config/supabase';
import fs from 'fs';

async function main() {
    const setores = ['SETOR VERDE', 'SETOR AZUL', 'SETOR LARANJA'];

    // Simplificando output para evitar problemas de encoding
    let output = "VERIFICACAO DE ORDEM\n";

    const { data: funcoes, error } = await supabase
        .from('funcoes')
        .select('id, nome, setor_pai, ordem_exibicao')
        .in('setor_pai', setores)
        .ilike('nome', '%Apoio%')
        .order('setor_pai')
        .order('ordem_exibicao');

    if (error) {
        console.error("Erro:", error);
        return;
    }

    let lastSetor = '';

    funcoes?.forEach(f => {
        if (f.setor_pai !== lastSetor) {
            output += `\n[${f.setor_pai}]\n`;
            lastSetor = f.setor_pai;
        }

        if (f.nome.toLowerCase().includes('responsável')) {
            // Ignora
        } else {
            output += `   ID: ${f.id} | ${f.nome} (Ordem: ${f.ordem_exibicao})\n`;
        }
    });

    console.log(output);
    fs.writeFileSync('ordem_simples.txt', output, 'utf8');
}

main();
