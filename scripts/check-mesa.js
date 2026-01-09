// Script para verificar quem está na Mesa no culto 04/01/2026
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';
const log = (msg) => { console.log(msg); output += msg + '\n'; };

async function checkMesa() {
    const CULTO_ID = '07755b4e-e85d-45ef-af74-14c285aaa431';

    // Buscar alocações para funções com "mesa" no nome
    const { data: alocacoes } = await supabase
        .from('escalas_alocacoes')
        .select(`
            funcao:funcoes(nome),
            membro:membros(nome_completo, aptidoes),
            status,
            motivo_falha
        `)
        .eq('culto_id', CULTO_ID);

    log('=== Alocações do culto 04/01/2026 ===\n');

    // Filtrar apenas alocações de Mesa
    const mesaAlocacoes = alocacoes?.filter(a => a.funcao?.nome?.toLowerCase().includes('mesa'));

    log('Funções MESA:');
    for (const a of mesaAlocacoes || []) {
        log(`  ${a.funcao?.nome}:`);
        if (a.membro) {
            log(`    Membro: ${a.membro.nome_completo}`);
            log(`    Aptidões: ${JSON.stringify(a.membro.aptidoes)}`);
        } else {
            log(`    Status: ${a.status}`);
            log(`    Motivo: ${a.motivo_falha}`);
        }
    }

    // Verificar José Duarte
    log('\n=== Quem tem Prioridade Mesa no banco? ===');
    const { data: membrosComPrioridade } = await supabase
        .from('membros')
        .select('nome_completo, aptidoes, disponibilidade_domingo, melhor_periodo_domingo, sexo')
        .contains('aptidoes', ['Prioridade Mesa']);

    for (const m of membrosComPrioridade || []) {
        log(`  ${m.nome_completo}`);
        log(`    Sexo: ${m.sexo}`);
        log(`    Aptidões: ${JSON.stringify(m.aptidoes)}`);
        log(`    Disp Domingo: ${m.disponibilidade_domingo}`);
        log(`    Melhor período: ${m.melhor_periodo_domingo}`);
    }

    // Verificar função Mesa
    log('\n=== Configuração da Função Mesa ===');
    const { data: funcaoMesa } = await supabase
        .from('funcoes')
        .select('*')
        .ilike('nome', '%mesa%água%')
        .limit(1);

    for (const f of funcaoMesa || []) {
        log(`  Nome: ${f.nome}`);
        log(`  Sexo: ${f.especificidade_sexo}`);
        log(`  Regras: ${f.regras}`);
    }

    writeFileSync('check-mesa-resultado.txt', output);
    log('\n📁 Salvo em check-mesa-resultado.txt');
}

checkMesa();
