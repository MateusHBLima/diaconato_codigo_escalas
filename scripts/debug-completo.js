
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';
const log = (msg) => { console.log(msg); output += msg + '\n'; };

// Copiar as regras de repetição exatamente como estão no código
const REPETITION_RULES = {
    'Masculino': {
        fontes: ['Hall'],
        indicesFonte: [0, 1],
        descricao: 'Banheiro Masculino repete do Hall'
    },
    'Feminino': {
        fontes: ['Apoio'],
        fontesExcluir: ['Responsável'],
        indicesFonte: [0, 1],
        descricao: 'Banheiro Feminino repete do Apoio'
    },
    'Púlpito': {
        fontes: ['Corrente'],
        indicesFonte: [0],
        descricao: 'Púlpito repete de Corrente'
    },
    'Lado Bateria (09 salvas)': {
        fontes: ['Corrente'],
        indicesFonte: [0],
        descricao: 'Salvas repete da Corrente'
    },
    'Lado bateria (16 máquinas)': {
        fontes: ['Interno'],
        indicesFonte: [2, 3],
        indicesVaga: [0, 1, 2],
        novasVagas: 5,
        descricao: 'Máquinas: 3 do Interno A3/A4 + 5 novos'
    },
    'Finalização': {
        fontes: ['Lado bateria (16 máquinas)'],
        indicesFonte: [0, 1],
        descricao: 'Finalização repete das Máquinas'
    }
};

function chaveMatchFonte(chave, config) {
    const chaveLower = chave.toLowerCase();
    const matchFonte = config.fontes.some(f => chaveLower.includes(f.toLowerCase()));
    if (!matchFonte) return false;

    if (config.fontesExcluir) {
        const deveExcluir = config.fontesExcluir.some(e => chaveLower.includes(e.toLowerCase()));
        if (deveExcluir) return false;
    }
    return true;
}

function temRegraRepeticao(nomeFuncao) {
    for (const [funcao, config] of Object.entries(REPETITION_RULES)) {
        if (nomeFuncao.toLowerCase().includes(funcao.toLowerCase())) {
            return config;
        }
    }
    return null;
}

async function debugCompleto() {
    log('🔬 DEBUG COMPLETO DA LÓGICA DE REPETIÇÃO\n');
    log('='.repeat(60));

    // Buscar última escala gerada
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('id, nome_culto, responsavel_geral_1_id, responsavel_geral_2_id')
        .gte('data_culto', '2026-01-04')
        .lt('data_culto', '2026-01-05')
        .limit(1);

    if (!cultos || cultos.length === 0) {
        log('Culto não encontrado');
        return;
    }

    const culto = cultos[0];
    log(`📅 Culto: ${culto.nome_culto}`);
    log(`👑 Resp Geral 1 ID: ${culto.responsavel_geral_1_id}`);
    log(`👑 Resp Geral 2 ID: ${culto.responsavel_geral_2_id}`);

    // Buscar alocações
    const { data: alocacoes } = await supabase
        .from('escalas_alocacoes')
        .select('*, funcao:funcoes(nome, setor_pai, ordem_exibicao), membro:membros(nome_completo)')
        .eq('culto_id', culto.id)
        .order('funcao(ordem_exibicao)');

    // Simular o quemEstaOnde
    const quemEstaOnde = new Map();
    alocacoes.forEach(a => {
        const nomeFuncao = a.funcao?.nome;
        if (!quemEstaOnde.has(nomeFuncao)) {
            quemEstaOnde.set(nomeFuncao, []);
        }
        quemEstaOnde.get(nomeFuncao).push({
            id: a.membro_id,
            nome: a.membro?.nome_completo
        });
    });

    log('\n📋 MAPA quemEstaOnde (chaves):');
    for (const [chave, ocupantes] of quemEstaOnde.entries()) {
        log(`   "${chave}": ${ocupantes.map(o => o.nome).join(', ')}`);
    }

    // Testar cada regra de repetição
    log('\n🔗 TESTE DE CADA REGRA:');
    for (const [funcaoDestino, config] of Object.entries(REPETITION_RULES)) {
        log(`\n📌 ${funcaoDestino}:`);

        // Buscar chaves que matcham
        const chavesFonte = Array.from(quemEstaOnde.keys()).filter(k =>
            chaveMatchFonte(k, config)
        );

        log(`   Padrões fonte: ${config.fontes.join(', ')}`);
        if (config.fontesExcluir) log(`   Excluir: ${config.fontesExcluir.join(', ')}`);
        log(`   Chaves encontradas: ${chavesFonte.length > 0 ? chavesFonte.join(', ') : 'NENHUMA!'}`);

        if (chavesFonte.length > 0) {
            const todosOcupantes = [];
            chavesFonte.forEach(chave => {
                const ocupantes = quemEstaOnde.get(chave) || [];
                ocupantes.forEach(o => {
                    if (!todosOcupantes.find(x => x.id === o.id)) {
                        todosOcupantes.push(o);
                    }
                });
            });

            log(`   Total ocupantes: ${todosOcupantes.length}`);
            todosOcupantes.forEach((o, i) => log(`      [${i}] ${o.nome}`));

            log(`   IndicesFonte: ${config.indicesFonte.join(', ')}`);
            config.indicesFonte.forEach((idx, vagaIdx) => {
                const ocupante = todosOcupantes[idx];
                if (ocupante) {
                    log(`      Vaga ${vagaIdx} → fonte[${idx}] = ${ocupante.nome}`);
                } else {
                    log(`      Vaga ${vagaIdx} → fonte[${idx}] = ❌ ÍNDICE INVÁLIDO`);
                }
            });
        }
    }

    // Verificar OFERTA especificamente
    log('\n🎁 VERIFICAÇÃO OFERTA:');
    const ofertaAlocs = alocacoes.filter(a => a.funcao?.setor_pai === 'OFERTA');
    log(`   Alocações na Oferta: ${ofertaAlocs.length}`);
    ofertaAlocs.forEach(a => {
        const ehResp1 = a.membro_id === culto.responsavel_geral_1_id;
        const ehResp2 = a.membro_id === culto.responsavel_geral_2_id;
        log(`   - ${a.membro?.nome_completo} ${ehResp1 ? '(RESP 1)' : ''} ${ehResp2 ? '(RESP 2)' : ''} ${!ehResp1 && !ehResp2 ? '❌ NÃO É RESPONSÁVEL!' : ''}`);
    });

    writeFileSync('debug-completo.txt', output);
    console.log('\n📁 Salvo em debug-completo.txt');
}

debugCompleto();
