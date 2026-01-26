
import { supabase } from '../src/config/supabase';

async function main() {
    console.log("Listando TODA a estrutura de uma função...");

    const { data: funcoes, error } = await supabase
        .from('funcoes')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Erro:", error);
        return;
    }

    if (funcoes && funcoes.length > 0) {
        console.log("Campos disponíveis:");
        Object.keys(funcoes[0]).forEach(key => {
            console.log(` - ${key}: ${typeof funcoes[0][key]}`);
        });

        // Também tenta mostrar valores de um Apoio
        const { data: apoio } = await supabase
            .from('funcoes')
            .select('*')
            .ilike('nome', 'Apoio')
            .limit(1);

        if (apoio && apoio.length > 0) {
            console.log("\nExemplo de Apoio:", JSON.stringify(apoio[0], null, 2));
        }
    } else {
        console.log("Tabela funcoes parece vazia.");
    }
}

main();
