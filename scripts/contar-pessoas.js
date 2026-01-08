
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';
function log(msg) {
    console.log(msg);
    output += msg + '\n';
}

async function contarPessoas() {
    log('📊 CONTAGEM DE PESSOAS ESCALADAS\n');

    // Buscar último culto
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('id, nome_culto, data_culto')
        .not('timestamp_criacao_escala', 'is', null)
        .order('timestamp_criacao_escala', { ascending: false })
        .limit(1);

    if (!cultos || cultos.length === 0) {
        log('Nenhum culto encontrado');
        return;
    }

    const cultoId = cultos[0].id;
    log(`📅 Culto: ${cultos[0].nome_culto}`);
    log('='.repeat(60));

    // Buscar alocações
    const { data: alocacoes } = await supabase
        .from('escalas_alocacoes')
        .select('*, funcao:funcoes(nome, regras), membro:membros(nome_completo)')
        .eq('culto_id', cultoId)
        .eq('status', 'ALOCADO');

    // Contar
    const totalVagas = alocacoes.length;
    const membrosUnicos = new Set(alocacoes.map(a => a.membro_id));
    const totalPessoasUnicas = membrosUnicos.size;

    // Identificar repetições
    const repeticoes = {};
    alocacoes.forEach(a => {
        if (!repeticoes[a.membro_id]) {
            repeticoes[a.membro_id] = {
                nome: a.membro?.nome_completo,
                funcoes: []
            };
        }
        repeticoes[a.membro_id].funcoes.push(a.funcao?.nome);
    });

    const pessoasRepetidas = Object.values(repeticoes).filter(p => p.funcoes.length > 1);

    log(`\n📈 TOTAIS:`);
    log(`   Total de vagas preenchidas: ${totalVagas}`);
    log(`   Total de pessoas ÚNICAS: ${totalPessoasUnicas}`);
    log(`   Pessoas com repetição: ${pessoasRepetidas.length}`);

    if (pessoasRepetidas.length > 0) {
        log(`\n🔄 PESSOAS REPETIDAS:`);
        pessoasRepetidas.forEach(p => {
            log(`   - ${p.nome}: ${p.funcoes.join(' + ')}`);
        });
    }

    writeFileSync('contagem-pessoas.txt', output);
    console.log('\n📁 Salvo em contagem-pessoas.txt');
}

contarPessoas();
