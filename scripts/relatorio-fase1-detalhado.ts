/**
 * Relatório Fase 1 - COM NOVA LÓGICA DE DISTRIBUIÇÃO DE QUINTAS
 */

import { supabase } from '../src/config/supabase.js';
import { parseDisponibilidade } from '../src/services/parser.js';
import fs from 'fs';

const MINIMO_MEMBROS = 28;

interface Membro {
    id: string;
    nome_completo: string;
    limite_mes: number;
    aptidoes: string[];
    nivel_experiencia: number;
    melhor_periodo_domingo: string;
    nome_conjuge: string | null;
    pool_cultos_ids: Set<string>;
}

interface Culto {
    id: string;
    data_culto: string;
    periodo: string;
    is_santa_ceia: boolean;
}

async function gerarRelatorio(mes: number, ano: number) {
    let output = '';
    const log = (msg: string) => { console.log(msg); output += msg + '\n'; };

    log(`\n# RELATÓRIO FASE 1 - ${mes}/${ano}`);
    log(`Nova lógica: 3x→primeiras 3, 2x→completa+alterna, 1x→preenche até 24\n`);

    // 1. Buscar cultos
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('mes', mes)
        .eq('ano', ano)
        .order('data_culto');

    if (!cultos) return;

    // 2. Buscar membros
    const { data: membrosRaw } = await supabase
        .from('membros')
        .select('*')
        .eq('ativo', true);

    if (!membrosRaw) return;

    const quintas = cultos.filter(c => c.periodo === 'quinta');
    const domingos = cultos.filter(c => c.periodo.includes('domingo'));

    // ==== PROCESSAR QUINTAS (NOVA LÓGICA) ====
    const membrosQuinta: Membro[] = membrosRaw
        .map(m => {
            const res = parseDisponibilidade(m.disponibilidade_quinta);
            let limite = res.vezesPorMes;
            if (m.aptidoes?.includes('Prioridade Mesa') || m.nivel_experiencia === 5) limite = 10;
            return {
                id: m.id, nome_completo: m.nome_completo, limite_mes: limite,
                aptidoes: m.aptidoes || [], nivel_experiencia: m.nivel_experiencia || 1,
                melhor_periodo_domingo: m.melhor_periodo_domingo || '',
                nome_conjuge: m.nome_conjuge, pool_cultos_ids: new Set<string>()
            };
        })
        .filter(m => parseDisponibilidade(membrosRaw.find(x => x.id === m.id)?.disponibilidade_quinta).disponivel);

    // NOVA DISTRIBUIÇÃO QUINTAS
    const cultosOrdenados = [...quintas].sort((a, b) => a.data_culto.localeCompare(b.data_culto));
    const ocupacao = new Map<string, number>();
    cultosOrdenados.forEach(c => ocupacao.set(c.id, 0));

    const grupo3x = membrosQuinta.filter(m => m.limite_mes >= 3);
    const grupo2x = [...membrosQuinta.filter(m => m.limite_mes === 2)];
    const grupo1x = [...membrosQuinta.filter(m => m.limite_mes === 1)];

    const primeirasTresQuintas = cultosOrdenados.slice(0, 3);
    const quintasRestantes = cultosOrdenados.slice(3);

    // PASSO 1: 3x nas primeiras 3
    for (const m of grupo3x) {
        for (const c of primeirasTresQuintas) {
            m.pool_cultos_ids.add(c.id);
            ocupacao.set(c.id, (ocupacao.get(c.id) || 0) + 1);
        }
    }

    // PASSO 2: 2x completa primeiras 3 até 24
    const membros2xUsados = new Set<string>();
    for (const c of primeirasTresQuintas) {
        const atual = ocupacao.get(c.id) || 0;
        const faltam = Math.max(0, MINIMO_MEMBROS - atual);
        let preenchidos = 0;
        for (const m of grupo2x) {
            if (membros2xUsados.has(m.id)) continue;
            if (preenchidos >= faltam) break;
            m.pool_cultos_ids.add(c.id);
            ocupacao.set(c.id, (ocupacao.get(c.id) || 0) + 1);
            membros2xUsados.add(m.id);
            preenchidos++;
        }
    }

    // PASSO 3: 2x restante em quintas restantes (alternância)
    const membros2xSobrando = grupo2x.filter(m => !membros2xUsados.has(m.id));
    if (quintasRestantes.length > 0 && membros2xSobrando.length > 0) {
        const quintasImparesRest: Culto[] = [];
        const quintasParesRest: Culto[] = [];
        quintasRestantes.forEach((c, idx) => {
            if (idx % 2 === 0) quintasImparesRest.push(c);
            else quintasParesRest.push(c);
        });

        let toggle = false;
        for (const m of membros2xSobrando) {
            const alvos = toggle ? quintasParesRest : quintasImparesRest;
            toggle = !toggle;
            const qtdAlocar = Math.min(2, alvos.length);
            for (let i = 0; i < qtdAlocar; i++) {
                const c = alvos[i];
                m.pool_cultos_ids.add(c.id);
                ocupacao.set(c.id, (ocupacao.get(c.id) || 0) + 1);
            }
        }
    }

    // PASSO 4: 1x preenche quintas < 24
    for (const m of grupo1x) {
        let menorCulto: Culto | null = null;
        let menorCount = MINIMO_MEMBROS;
        for (const c of cultosOrdenados) {
            const count = ocupacao.get(c.id) || 0;
            if (count < menorCount) { menorCount = count; menorCulto = c; }
        }
        if (menorCulto) {
            m.pool_cultos_ids.add(menorCulto.id);
            ocupacao.set(menorCulto.id, menorCount + 1);
        }
    }

    // N5 e Prioridade Mesa em todos
    membrosQuinta.filter(m => m.nivel_experiencia === 5 || m.aptidoes.includes('Prioridade Mesa'))
        .forEach(m => quintas.forEach(c => m.pool_cultos_ids.add(c.id)));

    // ==== PROCESSAR DOMINGOS (mantém lógica original) ====
    const membrosDomingo: Membro[] = membrosRaw
        .map(m => {
            const res = parseDisponibilidade(m.disponibilidade_domingo);
            let limite = res.vezesPorMes;
            if (m.aptidoes?.includes('Prioridade Mesa') || m.nivel_experiencia === 5) limite = 10;
            return {
                id: m.id, nome_completo: m.nome_completo, limite_mes: limite,
                aptidoes: m.aptidoes || [], nivel_experiencia: m.nivel_experiencia || 1,
                melhor_periodo_domingo: m.melhor_periodo_domingo || '',
                nome_conjuge: m.nome_conjuge, pool_cultos_ids: new Set<string>()
            };
        })
        .filter(m => parseDisponibilidade(membrosRaw.find(x => x.id === m.id)?.disponibilidade_domingo).disponivel);

    const diasMap = new Map<string, Culto[]>();
    domingos.forEach(c => {
        const dataBase = c.data_culto.split('T')[0];
        if (!diasMap.has(dataBase)) diasMap.set(dataBase, []);
        diasMap.get(dataBase)!.push(c);
    });
    const datasOrdenadas = Array.from(diasMap.keys()).sort();

    const processados = new Set<string>();
    for (const mPrincipal of membrosDomingo) {
        if (processados.has(mPrincipal.id)) continue;

        let conjuge: Membro | undefined;
        if (mPrincipal.nome_conjuge) {
            const nomeClean = mPrincipal.nome_conjuge.trim().toLowerCase();
            conjuge = membrosDomingo.find(m => m.id !== mPrincipal.id && m.nome_completo.toLowerCase().includes(nomeClean));
        }
        const dupla = conjuge ? [mPrincipal, conjuge] : [mPrincipal];
        dupla.forEach(d => processados.add(d.id));

        const limite = Math.min(...dupla.map(d => d.limite_mes));
        const totalSemanas = datasOrdenadas.length;
        const idSum = mPrincipal.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

        const semanasAlvoIndices: number[] = [];
        if (limite >= 3) {
            const start = idSum % totalSemanas;
            for (let i = 0; i < 3; i++) semanasAlvoIndices.push((start + i) % totalSemanas);
        } else if (limite === 2) {
            const start = idSum % totalSemanas;
            semanasAlvoIndices.push(start % totalSemanas);
            semanasAlvoIndices.push((start + 2) % totalSemanas);
        } else {
            semanasAlvoIndices.push(idSum % totalSemanas);
        }

        const prefs = dupla.map(d => d.melhor_periodo_domingo?.toLowerCase() || 'qualquer');
        const temManha = prefs.some(p => p.includes('manhã'));
        const temNoite = prefs.some(p => p.includes('noite'));
        const soQualquer = prefs.every(p => p.includes('qualquer') || p === '');
        let periodoFinal: 'manha' | 'noite' = 'noite';
        if (soQualquer) periodoFinal = 'noite';
        else if (temManha && !temNoite) periodoFinal = 'manha';
        else periodoFinal = 'noite';

        semanasAlvoIndices.forEach(idx => {
            if (idx >= datasOrdenadas.length) return;
            const dataAlvo = datasOrdenadas[idx];
            const cultosDoDia = diasMap.get(dataAlvo) || [];
            const cultoAlvo = cultosDoDia.find(c => periodoFinal === 'manha' ? c.periodo === 'domingo_manha' : c.periodo === 'domingo_noite');
            if (cultoAlvo) dupla.forEach(m => m.pool_cultos_ids.add(cultoAlvo.id));
        });
    }

    membrosDomingo.filter(m => m.nivel_experiencia === 5 || m.aptidoes.includes('Prioridade Mesa'))
        .forEach(m => domingos.forEach(c => m.pool_cultos_ids.add(c.id)));

    // ==== GERAR RELATÓRIO ====
    for (const culto of cultos) {
        const dataFormatada = new Date(culto.data_culto).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        const ehDomingo = culto.periodo.includes('domingo');
        const periodo = culto.periodo === 'quinta' ? 'Quinta' : culto.periodo === 'domingo_manha' ? 'Domingo Manhã' : 'Domingo Noite';

        log(`\n## ${periodo} - ${dataFormatada}`);
        log(`ID: ${culto.id} | Santa Ceia: ${culto.is_santa_ceia ? 'Sim' : 'Não'}\n`);

        const membrosBase = ehDomingo ? membrosDomingo : membrosQuinta;
        const membrosNoCulto = membrosBase.filter(m => m.pool_cultos_ids.has(culto.id));

        if (ehDomingo) {
            log('| Nome | Lim | ★ | Período | Cônjuge | Aptidões | Motivo |');
            log('|------|-----|---|---------|---------|----------|--------|');
        } else {
            log('| Nome | Lim | ★ | Cônjuge | Aptidões | Motivo |');
            log('|------|-----|---|---------|----------|--------|');
        }

        membrosNoCulto.sort((a, b) => b.nivel_experiencia - a.nivel_experiencia || b.limite_mes - a.limite_mes);

        const contagem = { 'Líder N5': 0, 'Prioridade Mesa': 0, '3x': 0, '2x': 0, '1x': 0 };

        for (const m of membrosNoCulto) {
            const nome = m.nome_completo.length > 30 ? m.nome_completo.substring(0, 27) + '...' : m.nome_completo;
            const conjuge = m.nome_conjuge?.split(' ')[0] || '-';
            const apt = m.aptidoes.length > 0 ? m.aptidoes.join(', ') : '-';

            let motivo = `${m.limite_mes}x/mês`;
            if (m.nivel_experiencia === 5) { motivo = 'Líder N5'; contagem['Líder N5']++; }
            else if (m.aptidoes.includes('Prioridade Mesa')) { motivo = 'Prioridade Mesa'; contagem['Prioridade Mesa']++; }
            else if (m.limite_mes >= 3) contagem['3x']++;
            else if (m.limite_mes === 2) contagem['2x']++;
            else contagem['1x']++;

            if (ehDomingo) {
                const per = m.melhor_periodo_domingo || 'Qualquer';
                log(`| ${nome} | ${m.limite_mes}x | ${m.nivel_experiencia}★ | ${per} | ${conjuge} | ${apt} | ${motivo} |`);
            } else {
                log(`| ${nome} | ${m.limite_mes}x | ${m.nivel_experiencia}★ | ${conjuge} | ${apt} | ${motivo} |`);
            }
        }

        log(`\n**📊 Total: ${membrosNoCulto.length} membros** (mínimo: ${MINIMO_MEMBROS})`);
        log('| Categoria | Qtd |'); log('|-----------|-----|');
        for (const [cat, qtd] of Object.entries(contagem)) { if (qtd > 0) log(`| ${cat} | ${qtd} |`); }
    }

    fs.writeFileSync(`relatorio-fase1-${mes}-${ano}.md`, output);
    log(`\n✅ Salvo em: relatorio-fase1-${mes}-${ano}.md`);
}

const mes = parseInt(process.argv[2]) || 1;
const ano = parseInt(process.argv[3]) || 2026;
gerarRelatorio(mes, ano).then(() => process.exit(0));
