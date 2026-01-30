/**
 * Verificar contagem de alocações por quinta-feira
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

    output += `ALOCAÇÕES QUINTAS - ${mes}/${ano}\n\n`;

    for (const c of cultos || []) {
        const { count } = await supabase
            .from('escalas_alocacoes')
            .select('*', { count: 'exact', head: true })
            .eq('culto_id', c.id);

        const data = c.data_culto.split('T')[0];
        output += `Quinta ${data}: ${count} membros alocados\n`;
    }

    fs.writeFileSync('verificacao-quintas.txt', output);
    console.log('Salvo em verificacao-quintas.txt');
    process.exit(0);
}

verificar();

