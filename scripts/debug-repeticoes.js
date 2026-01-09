
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';
const log = (msg) => { console.log(msg); output += msg + '\n'; };

// Regras de repetição
const REPETITION_RULES = {
    'Masculino': { fontes: ['Hall'], indices: [0, 1], descricao: 'Banheiro M → Hall' },
    'Feminino': { fontes: ['Apoio'], indices: [0, 1], descricao: 'Banheiro F → Apoio' },
    'Púlpito': { fontes: ['Corrente'], indices: [0], descricao: 'Púlpito → Corrente' },
    'Lado Bateria (09 salvas)': { fontes: ['Corrente'], indices: [0], descricao: 'Salvas → Corrente' },
    'Lado bateria (16 máquinas)': { fontes: ['Interno'], indices: [0, 1, 2], novasVagas: 5, descricao: 'Máquinas → Interno' },
    'Finalização': { fontes: ['Lado bateria'], indices: [0, 1], descricao: 'Finalização → Máquinas' }
};

async function analisarRepeticoes() {
    log('🔍 ANÁLISE DE REPETIÇÕES\n');

    const { data: funcoes } = await supabase
        .from('funcoes')
        .select('nome, setor_pai, ordem_exibicao')
        .eq('ativo', true)
        .order('ordem_exibicao');

    const chavesPossiveis = funcoes.map(f => f.nome);

    log('📋 FUNÇÕES NO BANCO:');
    chavesPossiveis.forEach(c => log(`   - "${c}"`));
    log('');

    log('🔗 ANÁLISE DE MATCH:');
    for (const [funcaoDestino, config] of Object.entries(REPETITION_RULES)) {
        log(`\n📌 ${config.descricao}`);

        for (const fontePattern of config.fontes) {
            const matches = chavesPossiveis.filter(k =>
                k.toLowerCase().includes(fontePattern.toLowerCase())
            );

            if (matches.length > 0) {
                log(`   ✅ "${fontePattern}" → ${matches.length} matches: ${matches.join(', ')}`);
            } else {
                log(`   ❌ "${fontePattern}" → NENHUM MATCH!`);
            }
        }
    }

    log('\n📊 FUNÇÕES POR TIPO:');
    ['Interno', 'Hall', 'Apoio', 'Corrente'].forEach(tipo => {
        const matches = funcoes.filter(f => f.nome.toLowerCase().includes(tipo.toLowerCase()));
        log(`   ${tipo}: ${matches.length} funções`);
        matches.forEach((f, i) => log(`      ${i}: "${f.nome}" (${f.setor_pai})`));
    });

    writeFileSync('debug-analise.txt', output);
    console.log('\n📁 Salvo em debug-analise.txt');
}

analisarRepeticoes();
