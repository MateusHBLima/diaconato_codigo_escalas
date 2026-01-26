
import { supabase } from '../src/config/supabase';
import fs from 'fs';

async function main() {
    const dataAlvo = '2026-01-29';
    console.log(`Buscando culto em: ${dataAlvo}...`);

    // Busca cultos que começam com a data (timestamp)
    const { data: cultos, error } = await supabase
        .from('datas_cultos')
        .select('*')
        .gte('data_culto', `${dataAlvo}T00:00:00`)
        .lte('data_culto', `${dataAlvo}T23:59:59`);

    if (error) {
        console.error('Erro:', error);
        return;
    }

    if (!cultos || cultos.length === 0) {
        console.log('Nenhum culto encontrado nesta data.');
        return;
    }

    cultos.forEach(c => {
        console.log(`\n📅 Encontrado: ${c.nome_culto}`);
        console.log(`   ID: ${c.id}`);
        console.log(`   Data: ${c.data_culto}`);
        console.log(`   Período: ${c.periodo}`);

        fs.writeFileSync('culto_id.txt', c.id, 'utf8');
    });
}

main();
