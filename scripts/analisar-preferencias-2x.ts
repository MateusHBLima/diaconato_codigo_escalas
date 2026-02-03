
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xawbaaevhmxkmanmfjpq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
);

function parseDisponibilidade(text: string) {
    const clean = text?.toLowerCase() || '';
    const map: any = {
        '2 - duas vezes por mês': 2,
        '3 - três vezes por mês': 3,
        '1 - uma vez por mês': 1
    };
    return map[clean] || 0;
}

async function run() {
    const { data: membros } = await supabase.from('membros').select('*').eq('ativo', true);
    if (!membros) return;

    // Filter 2x members
    const members2x = membros.filter(m => {
        const freq = parseDisponibilidade(m.disponibilidade_domingo);
        return freq === 2;
    });

    console.log(`Total 2x Members: ${members2x.length}`);

    // Emulate Current Logic (Simple Split by Gender then Interleaved)
    // logic in escala_mensal.ts uses units, but assuming singles for simple check

    // Sort logic from code
    const sortSmart = (a: any, b: any) =>
        (a.nivel_experiencia || 1) - (b.nivel_experiencia || 1) || (a.nome_completo || '').localeCompare(b.nome_completo || '');

    const grupo2x = [...members2x].sort(sortSmart);

    // Split by Gender
    const mulheres = grupo2x.filter(m => m.sexo === 'MULHER');
    const homens = grupo2x.filter(m => m.sexo === 'HOMEM');

    const groupA: any[] = [];
    const groupB: any[] = [];

    mulheres.forEach((m, i) => {
        if (i % 2 === 0) groupA.push(m); else groupB.push(m);
    });
    homens.forEach((m, i) => {
        if (i % 2 === 0) groupA.push(m); else groupB.push(m);
    });

    // Analyze Preferences
    const analyze = (group: any[], name: string) => {
        let manha = 0;
        let noite = 0;
        let qualquer = 0;

        group.forEach(m => {
            const pref = m.melhor_periodo_domingo?.toLowerCase() || 'qualquer';
            if (pref.includes('manhã')) manha++;
            else if (pref.includes('noite')) noite++;
            else qualquer++;
        });

        console.log(`--- ${name} (count: ${group.length}) ---`);
        console.log(`   Manhã Only: ${manha}`);
        console.log(`   Noite Only: ${noite}`);
        console.log(`   Qualquer:   ${qualquer}`);
        console.log(`   Risk Factor (Morning Bias): ${manha} fixed vs ${noite} fixed`);
    };

    analyze(groupA, 'Group A (D1 + D3)');
    analyze(groupB, 'Group B (D2 + D4)');
}

run();
