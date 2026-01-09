
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function exportarEscala() {
    let output = '';
    const log = (msg) => { console.log(msg); output += msg + '\n'; };

    // Buscar culto do dia 04/01/2026
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('*, responsavel_geral_1:membros!datas_cultos_responsavel_geral_1_id_fkey(nome_completo), responsavel_geral_2:membros!datas_cultos_responsavel_geral_2_id_fkey(nome_completo)')
        .gte('data_culto', '2026-01-04')
        .lt('data_culto', '2026-01-05')
        .order('data_culto')
        .limit(1);

    if (!cultos || cultos.length === 0) {
        log('Culto não encontrado');
        return;
    }

    const culto = cultos[0];
    log(`# ESCALA GERADA - ${culto.nome_culto}`);
    log(`📅 Data: ${culto.data_culto}`);
    log(`👑 Responsável 1: ${culto.responsavel_geral_1?.nome_completo || 'Não definido'}`);
    log(`👑 Responsável 2: ${culto.responsavel_geral_2?.nome_completo || 'Não definido'}`);
    log('');

    // Buscar alocações
    const { data: alocacoes } = await supabase
        .from('escalas_alocacoes')
        .select('*, funcao:funcoes(nome, setor_pai, ordem_exibicao), membro:membros(nome_completo)')
        .eq('culto_id', culto.id)
        .eq('status', 'ALOCADO')
        .order('funcao(ordem_exibicao)');

    // Agrupar por setor
    const porSetor = {};
    alocacoes.forEach(a => {
        const setor = a.funcao?.setor_pai || 'Outros';
        if (!porSetor[setor]) porSetor[setor] = [];
        porSetor[setor].push(a);
    });

    // Exibir por setor
    for (const [setor, alocs] of Object.entries(porSetor)) {
        log(`\n## ${setor.toUpperCase()}`);
        log('| Função | Pessoa |');
        log('|--------|--------|');
        alocs.forEach(a => {
            log(`| ${a.funcao?.nome} | ${a.membro?.nome_completo || 'VAZIO'} |`);
        });
    }

    // Contagem
    const membrosUnicos = new Set(alocacoes.map(a => a.membro_id));
    log(`\n## RESUMO`);
    log(`- Total de vagas: ${alocacoes.length}`);
    log(`- Pessoas únicas: ${membrosUnicos.size}`);

    // Pessoas que repetem
    const repeticoes = {};
    alocacoes.forEach(a => {
        if (!repeticoes[a.membro_id]) {
            repeticoes[a.membro_id] = { nome: a.membro?.nome_completo, funcoes: [] };
        }
        repeticoes[a.membro_id].funcoes.push(a.funcao?.nome);
    });

    const pessoasRepetidas = Object.values(repeticoes).filter(p => p.funcoes.length > 1);
    if (pessoasRepetidas.length > 0) {
        log(`\n## REPETIÇÕES (${pessoasRepetidas.length} pessoas)`);
        pessoasRepetidas.forEach(p => {
            log(`- ${p.nome}: ${p.funcoes.join(' + ')}`);
        });
    }

    writeFileSync('escala-gerada.md', output);
    console.log('\n📁 Salvo em escala-gerada.md');
}

exportarEscala();
