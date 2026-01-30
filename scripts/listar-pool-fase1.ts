/**
 * Script para listar membros selecionados na Fase 1 (Pool baseado em disponibilidade)
 * Mostra quem está no Pool de cada culto após a distribuição inicial
 */

import { supabase } from '../src/config/supabase.js';
import { parseDisponibilidade } from '../src/services/parser.js';

interface MembroPool {
    id: string;
    nome_completo: string;
    limite_mes: number;
    disponivel: boolean;
    aptidoes: string[];
    nivel_experiencia: number;
    melhor_periodo_domingo: string;
    pool_cultos_ids: Set<string>;
}

async function listarPoolFase1(mes: number, ano: number) {
    console.log(`\n📋 POOL DA FASE 1 - ${mes}/${ano}`);
    console.log('='.repeat(70));
    console.log('Membros selecionados baseados APENAS em disponibilidade\n');

    // 1. Buscar cultos do mês
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('mes', mes)
        .eq('ano', ano)
        .order('data_culto');

    if (!cultos || cultos.length === 0) {
        console.log('❌ Nenhum culto encontrado para este mês');
        return;
    }

    // 2. Buscar membros ativos
    const { data: membrosRaw } = await supabase
        .from('membros')
        .select('*')
        .eq('ativo', true);

    if (!membrosRaw) {
        console.log('❌ Nenhum membro encontrado');
        return;
    }

    // Separar por período
    const quintas = cultos.filter(c => c.periodo === 'quinta');
    const domingos = cultos.filter(c => c.periodo.includes('domingo'));

    // ==== QUINTA-FEIRA ====
    console.log('\n🟡 QUINTA-FEIRA');
    console.log('-'.repeat(70));

    const membrosQuinta: MembroPool[] = membrosRaw
        .map(m => {
            const res = parseDisponibilidade(m.disponibilidade_quinta);
            let limiteFinal = res.vezesPorMes;
            if (m.aptidoes?.includes('Prioridade Mesa')) {
                limiteFinal = 10;
            }
            return {
                id: m.id,
                nome_completo: m.nome_completo,
                limite_mes: limiteFinal,
                disponivel: res.disponivel,
                aptidoes: m.aptidoes || [],
                nivel_experiencia: m.nivel_experiencia || 1,
                melhor_periodo_domingo: m.melhor_periodo_domingo || '',
                pool_cultos_ids: new Set<string>()
            };
        })
        .filter(m => m.disponivel);

    console.log(`\n📊 Total de membros disponíveis para quinta: ${membrosQuinta.length}`);
    console.log('\nMembros por limite mensal:');

    const porLimiteQuinta = new Map<number, MembroPool[]>();
    membrosQuinta.forEach(m => {
        if (!porLimiteQuinta.has(m.limite_mes)) {
            porLimiteQuinta.set(m.limite_mes, []);
        }
        porLimiteQuinta.get(m.limite_mes)!.push(m);
    });

    Array.from(porLimiteQuinta.keys()).sort((a, b) => b - a).forEach(limite => {
        const membros = porLimiteQuinta.get(limite)!;
        console.log(`\n   📌 Limite ${limite}x/mês (${membros.length} pessoas):`);
        membros.forEach(m => {
            const apt = m.aptidoes.length > 0 ? ` [${m.aptidoes.join(', ')}]` : '';
            console.log(`      - ${m.nome_completo} (${m.nivel_experiencia}★)${apt}`);
        });
    });

    // ==== DOMINGO ====
    console.log('\n\n🔵 DOMINGO');
    console.log('-'.repeat(70));

    const membrosDomingo: MembroPool[] = membrosRaw
        .map(m => {
            const res = parseDisponibilidade(m.disponibilidade_domingo);
            let limiteFinal = res.vezesPorMes;
            if (m.aptidoes?.includes('Prioridade Mesa')) {
                limiteFinal = 10;
            }
            return {
                id: m.id,
                nome_completo: m.nome_completo,
                limite_mes: limiteFinal,
                disponivel: res.disponivel,
                aptidoes: m.aptidoes || [],
                nivel_experiencia: m.nivel_experiencia || 1,
                melhor_periodo_domingo: m.melhor_periodo_domingo || '',
                pool_cultos_ids: new Set<string>()
            };
        })
        .filter(m => m.disponivel);

    console.log(`\n📊 Total de membros disponíveis para domingo: ${membrosDomingo.length}`);
    console.log('\nMembros por limite mensal:');

    const porLimiteDomingo = new Map<number, MembroPool[]>();
    membrosDomingo.forEach(m => {
        if (!porLimiteDomingo.has(m.limite_mes)) {
            porLimiteDomingo.set(m.limite_mes, []);
        }
        porLimiteDomingo.get(m.limite_mes)!.push(m);
    });

    Array.from(porLimiteDomingo.keys()).sort((a, b) => b - a).forEach(limite => {
        const membros = porLimiteDomingo.get(limite)!;
        console.log(`\n   📌 Limite ${limite}x/mês (${membros.length} pessoas):`);
        membros.forEach(m => {
            const apt = m.aptidoes.length > 0 ? ` [${m.aptidoes.join(', ')}]` : '';
            const periodo = m.melhor_periodo_domingo ? ` (${m.melhor_periodo_domingo})` : '';
            console.log(`      - ${m.nome_completo} (${m.nivel_experiencia}★)${apt}${periodo}`);
        });
    });

    // ==== RESUMO ====
    console.log('\n\n📊 RESUMO GERAL');
    console.log('='.repeat(70));
    console.log(`   Membros ativos no sistema: ${membrosRaw.length}`);
    console.log(`   Disponíveis para quinta: ${membrosQuinta.length}`);
    console.log(`   Disponíveis para domingo: ${membrosDomingo.length}`);
    console.log(`   Indisponíveis (removidos): ${membrosRaw.length - Math.max(membrosQuinta.length, membrosDomingo.length)}`);

    // Listar quem foi REMOVIDO (indisponível)
    console.log('\n\n❌ MEMBROS REMOVIDOS (Indisponíveis):');
    console.log('-'.repeat(70));

    const removidosQuinta = membrosRaw.filter(m => {
        const res = parseDisponibilidade(m.disponibilidade_quinta);
        return !res.disponivel;
    });

    const removidosDomingo = membrosRaw.filter(m => {
        const res = parseDisponibilidade(m.disponibilidade_domingo);
        return !res.disponivel;
    });

    console.log(`\n   🟡 Quinta (${removidosQuinta.length} removidos):`);
    removidosQuinta.forEach(m => {
        console.log(`      - ${m.nome_completo}: "${m.disponibilidade_quinta}"`);
    });

    console.log(`\n   🔵 Domingo (${removidosDomingo.length} removidos):`);
    removidosDomingo.forEach(m => {
        console.log(`      - ${m.nome_completo}: "${m.disponibilidade_domingo}"`);
    });
}

// Executar para Março 2026 (ou usar args)
const mes = parseInt(process.argv[2]) || 3;
const ano = parseInt(process.argv[3]) || 2026;

listarPoolFase1(mes, ano).then(() => process.exit(0));
