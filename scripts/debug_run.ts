
import { gerarEscalaParaCulto } from '../src/services/escala';
import { supabase } from '../src/config/supabase';

async function main() {
    process.stdout.write("DEBUG: Starting main\n");
    const cultoId = 'c8230537-814d-4581-9f93-4102c086a057';

    try {
        process.stdout.write("DEBUG: Calling gerarEscalaParaCulto\n");
        const resultado = await gerarEscalaParaCulto(cultoId);
        process.stdout.write("DEBUG: Finished gerarEscalaParaCulto\n");

        console.log(JSON.stringify(resultado, null, 2));

    } catch (error: any) {
        process.stdout.write("DEBUG: Caught error\n");
        console.error('❌ Erro fatal:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
    }
}

main();
