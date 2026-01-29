
import { supabase } from '../src/config/supabase';
import * as fs from 'fs';

// Helper parsing logic (simplified from parser.ts + new requirements)
function parseLimit(text: string | null): number {
    if (!text) return 1; // Default fallback if empty, consistent with current parser
    const lower = text.toLowerCase();

    if (lower.includes('não tenho') || lower.includes('não posso') || lower.includes('nunca')) return 0;

    const match = lower.match(/(\d+)/);
    if (match) return Math.min(parseInt(match[1], 10), 5);

    if (lower.includes('sim') || lower.includes('livre') || lower.includes('ok')) return 4;
    if (lower.includes('quinzenal')) return 2;

    return 1; // Default
}

function parsePeriod(text: string | null): 'MANHA' | 'NOITE' | 'QUALQUER' {
    if (!text) return 'QUALQUER'; // Default if empty
    const lower = text.toLowerCase();

    // Explicit unavailability in period preference overrides everything? 
    // Usually if they said 'Unable to serve Sundays' in the other field, limit is 0 anyway.
    if (lower.includes('não tenho')) return 'QUALQUER';

    if (lower.includes('manhã') && !lower.includes('noite')) return 'MANHA';
    if (lower.includes('noite') && !lower.includes('manhã')) return 'NOITE';

    return 'QUALQUER';
}

async function run() {
    console.log("Fetching members...");
    const { data: members, error } = await supabase
        .from('membros')
        .select('id, nome_completo, disponibilidade_quinta, disponibilidade_domingo, melhor_periodo_domingo')
        .eq('ativo', true)
        .order('nome_completo');

    if (error) {
        console.error("Error fetching members:", error);
        return;
    }

    console.log(`Found ${members.length} active members.`);

    let csvContent = "Nome;Disp. Quinta (Orig);Novo Quinta (Int);Disp. Domingo (Orig);Novo Total (Int);Pref. Domingo (Orig);Novo Pref (Int);Cap Manha (Implied);Cap Noite (Implied);Nota\n";

    for (const m of members) {
        // 1. Process Quinta
        const quintaLimit = parseLimit(m.disponibilidade_quinta);

        // 2. Process Domingo Limit
        const domingoLimit = parseLimit(m.disponibilidade_domingo);

        // 3. Process Period Preference
        const periodo = parsePeriod(m.melhor_periodo_domingo);

        let prefInt = 0;

        let nota = "";

        // Map Period Preference to Integer
        if (periodo === 'MANHA') prefInt = 1;
        else if (periodo === 'NOITE') prefInt = 2;
        else if (periodo === 'QUALQUER') prefInt = 3; // Default 'QUALQUER' even if text is empty/weird, unless explicit 'NÃO' dealt with below

        // Refine Preference based on explicit unavailability text in proper column
        if (m.melhor_periodo_domingo && m.melhor_periodo_domingo.toLowerCase().includes('não tenho')) {
            prefInt = 0;
        }

        // Logic: Preserve Total + Preference.
        // 'Any' means available for BOTH periods up to the Total limit.

        const totalDomingo = domingoLimit;
        let capManha = 0;
        let capNoite = 0;

        if (totalDomingo === 0) {
            capManha = 0;
            capNoite = 0;
            nota = "Indisponível";
            prefInt = 0; // Force consistency
        } else {
            if (periodo === 'MANHA') {
                capManha = totalDomingo;
                capNoite = 0;
                nota = "Restrito: Manhã";
            } else if (periodo === 'NOITE') {
                capManha = 0;
                capNoite = totalDomingo;
                nota = "Restrito: Noite";
            } else {
                // QUALQUER
                // Available for both, constrained by Total
                capManha = totalDomingo;
                capNoite = totalDomingo;
                nota = "Flexível (Qualquer)";
            }
        }

        // Sanitize strings for CSV
        const cleanStr = (s: string | null) => s ? s.replace(/;/g, ",").replace(/\n/g, " ") : "";

        csvContent += `${cleanStr(m.nome_completo)};${cleanStr(m.disponibilidade_quinta)};${quintaLimit};${cleanStr(m.disponibilidade_domingo)};${totalDomingo} (Total Novo);${cleanStr(m.melhor_periodo_domingo)};${prefInt} (Pref Nova);${capManha} (Cap Manhã);${capNoite} (Cap Noite);${nota}\n`;
    }

    fs.writeFileSync('migration_preview.csv', csvContent, { encoding: 'utf8' }); // Add encoding
    console.log("Migration preview saved to 'migration_preview.csv'");
}

run();
