
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

async function validarEscala(cultoId) {
    log('🔍 VALIDANDO ESCALA\n');

    // Buscar culto
    const { data: culto, error: erroCulto } = await supabase
        .from('datas_cultos')
        .select('*, responsavel_geral_1:membros!datas_cultos_responsavel_geral_1_id_fkey(nome_completo, nivel_experiencia), responsavel_geral_2:membros!datas_cultos_responsavel_geral_2_id_fkey(nome_completo, nivel_experiencia)')
        .eq('id', cultoId)
        .single();

    if (erroCulto || !culto) {
        log('Erro ao buscar culto: ' + JSON.stringify(erroCulto));
        return;
    }

    log(`📅 Culto: ${culto.nome_culto} - ${culto.data_culto}`);
    log('='.repeat(60));

    // VALIDAR RESPONSÁVEIS GERAIS
    log('\n👑 RESPONSÁVEIS GERAIS:');
    if (culto.responsavel_geral_1) {
        const r1 = culto.responsavel_geral_1;
        log(`   1: ${r1.nome_completo} (Nível ${r1.nivel_experiencia})`);
        if (r1.nivel_experiencia !== 5) {
            log('   ❌ ERRO: Deveria ser Nível 5!');
        } else {
            log('   ✅ OK');
        }
    } else {
        log('   ❌ Responsável 1 não definido!');
    }

    if (culto.responsavel_geral_2) {
        const r2 = culto.responsavel_geral_2;
        log(`   2: ${r2.nome_completo} (Nível ${r2.nivel_experiencia})`);
        if (r2.nivel_experiencia !== 5) {
            log('   ❌ ERRO: Deveria ser Nível 5!');
        } else {
            log('   ✅ OK');
        }
    } else {
        log('   ⚠️ Responsável 2 não definido');
    }

    // Buscar alocações com detalhes
    const { data: alocacoes, error: erroAloc } = await supabase
        .from('escalas_alocacoes')
        .select('*, funcao:funcoes(nome, especificidade_sexo), membro:membros(nome_completo, sexo, nivel_experiencia)')
        .eq('culto_id', cultoId);

    if (erroAloc) {
        log('Erro ao buscar alocações: ' + JSON.stringify(erroAloc));
        return;
    }

    // VALIDAR BANHEIROS
    log('\n🚻 VALIDAÇÃO BANHEIROS:');

    const hallMasculino = alocacoes.filter(a =>
        a.funcao?.nome?.includes('Hall') && a.membro?.sexo === 'HOMEM'
    );
    const banheiroMasculino = alocacoes.filter(a =>
        a.funcao?.nome?.toLowerCase()?.includes('masculino')
    );

    log(`   Hall Masculino: ${hallMasculino.map(a => a.membro?.nome_completo || 'VAZIO').join(', ')}`);
    log(`   Banheiro Masculino: ${banheiroMasculino.map(a => a.membro?.nome_completo || 'VAZIO').join(', ')}`);

    if (banheiroMasculino.length > 0 && hallMasculino.length > 0) {
        const repetido = banheiroMasculino.some(b =>
            hallMasculino.some(h => h.membro_id === b.membro_id)
        );
        if (repetido) {
            log('   ✅ Repetição masculina OK');
        } else {
            log('   ❌ ERRO: Banheiro masculino deveria repetir pessoa do Hall!');
        }
    } else {
        log('   ⚠️ Não foi possível validar (falta dados)');
    }

    const apoioFeminino = alocacoes.filter(a =>
        a.funcao?.nome?.includes('Apoio') && a.membro?.sexo === 'MULHER'
    );
    const banheiroFeminino = alocacoes.filter(a =>
        a.funcao?.nome?.toLowerCase()?.includes('feminino')
    );

    log(`   Apoio Feminino: ${apoioFeminino.map(a => a.membro?.nome_completo || 'VAZIO').join(', ')}`);
    log(`   Banheiro Feminino: ${banheiroFeminino.map(a => a.membro?.nome_completo || 'VAZIO').join(', ')}`);

    if (banheiroFeminino.length > 0 && apoioFeminino.length > 0) {
        const repetido = banheiroFeminino.some(b =>
            apoioFeminino.some(a => a.membro_id === b.membro_id)
        );
        if (repetido) {
            log('   ✅ Repetição feminina OK');
        } else {
            log('   ❌ ERRO: Banheiro feminino deveria repetir pessoa do Apoio!');
        }
    } else {
        log('   ⚠️ Não foi possível validar (falta dados)');
    }

    // VALIDAR VAGAS VAZIAS
    log('\n📊 RESUMO DE ALOCAÇÕES:');
    const vazias = alocacoes.filter(a => a.status === 'SEM_CANDIDATO');
    const preenchidas = alocacoes.filter(a => a.status === 'ALOCADO');

    log(`   Total: ${alocacoes.length}`);
    log(`   Preenchidas: ${preenchidas.length}`);
    log(`   Vazias: ${vazias.length}`);

    if (vazias.length > 0) {
        log('\n   ❌ FUNÇÕES VAZIAS:');
        vazias.forEach(v => {
            log(`      - ${v.funcao?.nome}: ${v.motivo_falha}`);
        });
    } else {
        log('   ✅ Nenhuma vaga vazia!');
    }

    log('\n' + '='.repeat(60));
    log('✅ Validação concluída!');

    // Salvar em arquivo
    writeFileSync('validacao-resultado.txt', output);
    console.log('\n📁 Resultado salvo em validacao-resultado.txt');
}

// Buscar último culto gerado
async function validarUltimoCulto() {
    const { data, error } = await supabase
        .from('datas_cultos')
        .select('id, nome_culto, data_culto')
        .not('timestamp_criacao_escala', 'is', null)
        .order('timestamp_criacao_escala', { ascending: false })
        .limit(1);

    if (error || !data || data.length === 0) {
        console.error('Nenhum culto com escala encontrado');
        return;
    }

    await validarEscala(data[0].id);
}

validarUltimoCulto();
