/**
 * Script de Diagnóstico: Comparar Escala Diária vs Mensal
 * 
 * Gera uma escala usando o código DIÁRIO original e compara
 * com a escala MENSAL para o mesmo culto.
 */

import { supabase } from '../src/config/supabase.js';
import { gerarEscalaParaCulto } from '../src/services/escala.js';
import { gerarEscalaComPool } from '../src/services/escala_diaria_custom.js';
import { parseDisponibilidade } from '../src/services/parser.js';

interface MembroComHistorico {
    id: string;
    nome_completo: string;
    nivel_experiencia: number;
    aptidoes: string[];
    sexo: string;
    disponibilidade_quinta: string;
    disponibilidade_domingo: string;
    melhor_periodo_domingo: string;
    nome_conjuge: string;
    conjuge_serve_junto: boolean;
    escalas_no_mes: number;
    ultima_escala?: string;
    limite_mes: number;
    pool_cultos_ids?: Set<string>;
}

async function diagnosticar() {
    console.log('\n🔍 DIAGNÓSTICO: ESCALA DIÁRIA vs MENSAL');
    console.log('='.repeat(60));

    // 1. Buscar José Duarte
    const { data: joseDuarte } = await supabase
        .from('membros')
        .select('*')
        .ilike('nome_completo', '%duarte%')
        .single();

    if (joseDuarte) {
        console.log('\n📋 JOSÉ DUARTE:');
        console.log(`   Nome: ${joseDuarte.nome_completo}`);
        console.log(`   Disponibilidade Quinta: ${joseDuarte.disponibilidade_quinta}`);
        console.log(`   Disponibilidade Domingo: ${joseDuarte.disponibilidade_domingo}`);
        console.log(`   Período Domingo: ${joseDuarte.melhor_periodo_domingo}`);
        console.log(`   Aptidões: ${JSON.stringify(joseDuarte.aptidoes)}`);
        console.log(`   Estrelas: ${joseDuarte.nivel_experiencia}`);

        const dispQuinta = parseDisponibilidade(joseDuarte.disponibilidade_quinta);
        const dispDomingo = parseDisponibilidade(joseDuarte.disponibilidade_domingo);
        console.log(`\n   Parsed Quinta: disponivel=${dispQuinta.disponivel}, vezes=${dispQuinta.vezesPorMes}`);
        console.log(`   Parsed Domingo: disponivel=${dispDomingo.disponivel}, vezes=${dispDomingo.vezesPorMes}`);
    }

    // 2. Buscar um culto de domingo recente
    const { data: cultoDomingo } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('mes', 3)
        .eq('ano', 2026)
        .ilike('periodo', 'domingo%')
        .limit(1)
        .single();

    if (cultoDomingo) {
        console.log('\n📅 CULTO DE DOMINGO PARA TESTE:');
        console.log(`   ID: ${cultoDomingo.id}`);
        console.log(`   Nome: ${cultoDomingo.nome_culto}`);
        console.log(`   Data: ${cultoDomingo.data_culto}`);
        console.log(`   Período: ${cultoDomingo.periodo}`);
    }

    // 3. Buscar TODOS os membros ativos
    const { data: membros } = await supabase
        .from('membros')
        .select('*')
        .eq('ativo', true);

    if (!membros) {
        console.log('❌ Nenhum membro encontrado');
        return;
    }

    // 4. Construir Pool simulado para domingo (como a escala mensal faz)
    console.log('\n📊 CONSTRUINDO POOL PARA DOMINGO:');

    const poolDomingo: MembroComHistorico[] = [];
    let joseDuarteNoPool = false;

    for (const m of membros) {
        const dispDomingo = parseDisponibilidade(m.disponibilidade_domingo);

        // Simular o que a Fase 1 faz
        if (dispDomingo.disponivel) {
            const membro: MembroComHistorico = {
                ...m,
                escalas_no_mes: 0,
                limite_mes: dispDomingo.vezesPorMes,
                pool_cultos_ids: new Set()
            };

            // Simular Fase 1.6: Prioridade Mesa
            if (m.aptidoes?.includes('Prioridade Mesa')) {
                poolDomingo.push(membro);
                if (m.nome_completo.toLowerCase().includes('duarte')) {
                    joseDuarteNoPool = true;
                    console.log(`   ✅ ${m.nome_completo} (Prioridade Mesa) INCLUÍDO no Pool`);
                }
            } else if (dispDomingo.vezesPorMes > 0) {
                poolDomingo.push(membro);
            }
        } else {
            if (m.nome_completo.toLowerCase().includes('duarte')) {
                console.log(`   ❌ ${m.nome_completo} NÃO DISPONÍVEL para domingo (disponivel=false)`);
            }
        }
    }

    console.log(`\n   Total no Pool: ${poolDomingo.length}`);
    console.log(`   José Duarte no Pool: ${joseDuarteNoPool ? 'SIM' : 'NÃO'}`);

    // 5. Verificar funções de Mesa
    const { data: funcoes } = await supabase
        .from('funcoes')
        .select('*')
        .ilike('nome', '%mesa%');

    console.log('\n📋 FUNÇÕES DE MESA:');
    for (const f of funcoes || []) {
        console.log(`   ${f.nome} (${f.setor_pai}) - Qty: ${f.quantidade_pessoas}`);
    }

    // 6. Verificar quem tem Prioridade Mesa
    console.log('\n📋 MEMBROS COM PRIORIDADE MESA:');
    for (const m of membros) {
        if (m.aptidoes?.includes('Prioridade Mesa')) {
            const dispD = parseDisponibilidade(m.disponibilidade_domingo);
            console.log(`   ${m.nome_completo}`);
            console.log(`      - Disponível Domingo: ${dispD.disponivel}`);
            console.log(`      - Período: ${m.melhor_periodo_domingo}`);
        }
    }

    // 7. Verificar alocações existentes de José Duarte
    if (joseDuarte) {
        const { data: alocacoesJose } = await supabase
            .from('escalas_alocacoes')
            .select(`
                *,
                culto:datas_cultos(*),
                funcao:funcoes(*)
            `)
            .eq('membro_id', joseDuarte.id)
            .order('culto(data_culto)');

        console.log(`\n📋 ALOCAÇÕES DE JOSÉ DUARTE (${alocacoesJose?.length || 0}):`);
        for (const a of alocacoesJose || []) {
            const culto = a.culto as any;
            const funcao = a.funcao as any;
            console.log(`   ${culto?.data_culto} | ${culto?.periodo} | ${funcao?.nome}`);
        }
    }
}

diagnosticar().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
