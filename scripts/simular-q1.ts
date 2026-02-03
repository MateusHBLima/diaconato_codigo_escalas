import { createClient } from '@supabase/supabase-js';
import { STAR_MAX_LIMITS } from '../src/services/rules/StarSystem';
import * as fs from 'fs';

const supabase = createClient(
    'https://xawbaaevhmxkmanmfjpq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw'
);

function log(msg: string) {
    console.log(msg);
    fs.appendFileSync('simulacao.txt', msg + '\n');
}

// Mock `parseDisponibilidade` logic
function getFreq(disp: string | null): number {
    if (!disp) return 0;
    const match = disp.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

async function simular() {
    fs.writeFileSync('simulacao.txt', ''); // Clear file
    log('🔍 SIMULAÇÃO DETALHADA DO POOL Q1');
    log('='.repeat(50));

    // 1. Buscar membros
    const { data: membros } = await supabase
        .from('membros')
        .select('*')
        .eq('ativo', true);

    if (!membros) return;

    // 2. Filtrar e classificar como no código principal
    const validos = membros.filter(m => {
        const d = m.disponibilidade_quinta?.toLowerCase() || '';
        return !d.includes('não') && !d.includes('nao') && m.disponibilidade_quinta;
    }).map(m => ({
        ...m,
        freq: getFreq(m.disponibilidade_quinta),
        isN5: m.nivel_experiencia === 5,
        isMesa: m.aptidoes?.includes('Prioridade Mesa')
    }));

    const n5 = validos.filter(m => m.isN5);
    const semN5 = validos.filter(m => !m.isN5);

    // Grupo 3x
    const g3x = semN5.filter(m => m.freq >= 3);

    // Grupo 2x (Intercalado)
    const g2xRaw = semN5.filter(m => m.freq === 2);
    const g2xM = g2xRaw.filter(m => m.sexo === 'MULHER');
    const g2xH = g2xRaw.filter(m => m.sexo === 'HOMEM');
    const g2xIntercalado: typeof validos = [];
    const max = Math.max(g2xM.length, g2xH.length);
    for (let i = 0; i < max; i++) {
        if (i < g2xM.length) g2xIntercalado.push(g2xM[i]);
        if (i < g2xH.length) g2xIntercalado.push(g2xH[i]);
    }

    // Calcular vagas (igual ao código: MIN 28 - 3x.length)
    const MINIMO = 28;
    const vagasQ1 = Math.max(0, MINIMO - g3x.length);

    // Pegar quem vai pra Q1
    const g2x_Q1 = g2xIntercalado.slice(0, vagasQ1);

    // QUEM ESTÁ NO POOL Q1?
    const poolQ1 = [
        ...n5,
        ...g3x,
        ...g2x_Q1,
        // (1x não entra em Q1 se vagasQ1 for preenchido por 2x, o que parece ser o caso)
    ];

    log(`\n📊 COMPOSIÇÃO DO POOL Q1 (${poolQ1.length} membros):`);
    log(`- N5: ${n5.length}`);
    log(`- 3x: ${g3x.length}`);
    log(`- 2x: ${g2x_Q1.length} (vagas: ${vagasQ1})`);

    // ANÁLISE PARA HALL (Homem, <= 2 estrelas, ou 3 se ajustarmos)
    log('\n🚪 ANÁLISE PARA HALL (Precisa: Homem | Nível <= 2)');
    const candidatosHall = poolQ1.filter(m => m.sexo === 'HOMEM' && m.nivel_experiencia <= 2);
    log(`Candidatos Hall Nível <= 2: ${candidatosHall.length}`);
    candidatosHall.forEach(m => log(`  - ${m.nome_completo} (${m.nivel_experiencia}★)`));

    const candidatosHall3 = poolQ1.filter(m => m.sexo === 'HOMEM' && m.nivel_experiencia <= 3);
    log(`Candidatos Hall Nível <= 3: ${candidatosHall3.length}`);

    // ANÁLISE PARA APOIO (Mulher, <= 3 estrelas)
    log('\n🤲 ANÁLISE PARA APOIO (Precisa: Mulher | Nível <= 3)');
    const candidatosApoio = poolQ1.filter(m => m.sexo === 'MULHER' && m.nivel_experiencia <= 3);
    log(`Candidatos Apoio Nível <= 3: ${candidatosApoio.length}`);
    candidatosApoio.forEach(m => log(`  - ${m.nome_completo} (${m.nivel_experiencia}★)`));

    // VERIFICAR FUNÇÕES REAIS
    const { data: funcoes } = await supabase.from('funcoes').select('*').eq('dia_semana', 'Quinta');
    const vagasHall = funcoes?.filter(f => f.nome.includes('Hall') || f.nome.includes('Porta')).reduce((acc, curr) => acc + curr.quantidade_pessoas, 0) || 0;
    const vagasApoio = funcoes?.filter(f => f.nome.includes('Apoio')).reduce((acc, curr) => acc + curr.quantidade_pessoas, 0) || 0;

    log(`\n📋 VAGAS REAIS:`);
    log(`- Hall: Requer ~${vagasHall} vagas`);
    log(`- Apoio: Requer ~${vagasApoio} vagas`);

    log('\n🔎 DIAGNÓSTICO FINAL:');
    if (candidatosHall.length < vagasHall) log(`❌ DÉFICIT DE HALL: Tem ${candidatosHall.length}, precisa ${vagasHall}`);
    if (candidatosApoio.length < vagasApoio) log(`❌ DÉFICIT DE APOIO: Tem ${candidatosApoio.length}, precisa ${vagasApoio}`);

    // Listar quem são os homens Nível 3+ que estão "sobrando" mas não podem fazer Hall
    const homensN3Plus = poolQ1.filter(m => m.sexo === 'HOMEM' && m.nivel_experiencia > 2);
    log(`\n🚫 HOMENS N3+ (Bloqueados do Hall 2★): ${homensN3Plus.length}`);
    homensN3Plus.forEach(m => log(`  - ${m.nome_completo} (${m.nivel_experiencia}★) -> Pode fazer Hall se aumentar para 3★?`));
}

simular();
