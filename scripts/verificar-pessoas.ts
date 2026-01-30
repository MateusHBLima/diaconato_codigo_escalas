/**
 * Verificar pessoas ÚNICAS escaladas por quinta
 */
import { supabase } from '../src/config/supabase.js';
import fs from 'fs';

async function verificar() {
    const mes = parseInt(process.argv[2]) || 1;
    const ano = parseInt(process.argv[3]) || 2026;
    let output = '';

    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('id, data_culto')
        .eq('mes', mes)
        .eq('ano', ano)
        .eq('periodo', 'quinta')
        .order('data_culto');

    output += `PESSOAS ÚNICAS ESCALADAS - QUINTAS ${mes}/${ano}\n\n`;

    for (const c of cultos || []) {
        const { data: alocacoes } = await supabase
            .from('escalas_alocacoes')
            .select('membro_id')
            .eq('culto_id', c.id);

        // Contar membros únicos
        const membrosUnicos = new Set(alocacoes?.map(a => a.membro_id) || []);

        const data = c.data_culto.split('T')[0];
        output += `Quinta ${data}: ${membrosUnicos.size} pessoas únicas (${alocacoes?.length || 0} alocações)\n`;
    }

    fs.writeFileSync('verificacao-pessoas.txt', output);
    console.log('Salvo em verificacao-pessoas.txt');
    console.log(output);
    process.exit(0);
}

verificar();
