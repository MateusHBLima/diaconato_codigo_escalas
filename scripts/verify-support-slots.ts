
import { supabase } from '../src/config/supabase';
import { podeExecutarFuncao } from '../src/services/rules/StarSystem';
import { Membro } from '../src/types';
import * as fs from 'fs';

async function run() {
    let logOutput = "Starting Verification for Support Slots (Apoio)...\n";
    const log = (msg: string) => {
        console.log(msg);
        logOutput += msg + "\n";
    };

    // Fetch Eroni (Level 1)
    const { data: eroni } = await supabase
        .from('membros')
        .select('*')
        .ilike('nome_completo', '%Eroni%')
        .single();

    if (!eroni) {
        log("❌ Eroni not found");
    } else {
        log(`Found Eroni: Level ${eroni.nivel_experiencia}`);
    }

    // Fetch Adilson (Level 2)
    const { data: adilson } = await supabase
        .from('membros')
        .select('*')
        .ilike('nome_completo', '%Adilson Miranda Neto%')
        .single();

    if (!adilson) {
        log("❌ Adilson not found");
    } else {
        log(`Found Adilson: Level ${adilson.nivel_experiencia}`);
    }

    const sectors = ['SETOR VERDE', 'SETOR AZUL', 'SETOR LARANJA'];

    for (const sector of sectors) {
        log(`\n----------------------------------------`);
        log(`Testing Sector: ${sector}`);
        log(`----------------------------------------`);

        // Test Slot 0 (Apoio 1) - EXPECT: Level 2+ only
        log(`[SLOT 0] (Should require Level 2)`);

        if (eroni) {
            const allowed = podeExecutarFuncao(eroni, 'Apoio', 'Unissex', sector, 0);
            log(`   Eroni (Lvl ${eroni.nivel_experiencia}): ${allowed ? 'ALLOWED ❌' : 'BLOCKED ✅'}`);
        }
        if (adilson) {
            const allowed = podeExecutarFuncao(adilson, 'Apoio', 'Unissex', sector, 0);
            log(`   Adilson (Lvl ${adilson.nivel_experiencia}): ${allowed ? 'ALLOWED ✅' : 'BLOCKED ❌'}`);
        }

        // Test Slot 1 (Apoio 2) - EXPECT: Level 1 allowed
        log(`[SLOT 1] (Should allow Level 1)`);

        if (eroni) {
            const allowed = podeExecutarFuncao(eroni, 'Apoio', 'Unissex', sector, 1);
            log(`   Eroni (Lvl ${eroni.nivel_experiencia}): ${allowed ? 'ALLOWED ✅' : 'BLOCKED ❌'}`);
        }
        if (adilson) {
            const allowed = podeExecutarFuncao(adilson, 'Apoio', 'Unissex', sector, 1);
            log(`   Adilson (Lvl ${adilson.nivel_experiencia}): ${allowed ? 'ALLOWED ✅' : 'BLOCKED ❌'}`);
        }
    }

    fs.writeFileSync('verification_results.txt', logOutput);
    console.log("Verification results written to verification_results.txt");
}

run();
