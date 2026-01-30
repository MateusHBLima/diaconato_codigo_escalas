/**
 * Diagnóstico: Por que membros do Pool não estão sendo alocados?
 */
import { supabase } from '../src/config/supabase.js';
import fs from 'fs';

async function diagnosticar() {
    let output = '';
    const log = (msg: string) => { output += msg + '\n'; console.log(msg); };

    // Pegar primeira quinta de janeiro
    const { data: cultos } = await supabase
        .from('datas_cultos')
        .select('id, data_culto')
        .eq('mes', 1).eq('ano', 2026)
        .eq('periodo', 'quinta')
        .order('data_culto')
        .limit(1);

    if (!cultos || cultos.length === 0) {
        log('Nenhum culto encontrado');
        process.exit(1);
    }

    const culto = cultos[0];
    log(`\nDIAGNÓSTICO - ${culto.data_culto.split('T')[0]}\n`);

    // Pegar membros alocados
    const { data: alocacoes } = await supabase
        .from('escalas_alocacoes')
        .select('membro_id, funcao_id, status, motivo_falha')
        .eq('culto_id', culto.id);

    log(`Total alocações: ${alocacoes?.length}`);

    // Contagem por status
    const alocados = alocacoes?.filter(a => a.status === 'ALOCADO') || [];
    const semCandidato = alocacoes?.filter(a => a.status === 'SEM_CANDIDATO') || [];

    log(`Alocados: ${alocados.length}`);
    log(`Sem candidato: ${semCandidato.length}`);

    // Funções com problemas
    if (semCandidato.length > 0) {
        log('\nFunções SEM CANDIDATO:');
        const { data: funcoes } = await supabase.from('funcoes').select('id, nome');
        for (const f of semCandidato) {
            const funcao = funcoes?.find(fn => fn.id === f.funcao_id);
            log(`  - ${funcao?.nome || f.funcao_id}: ${f.motivo_falha}`);
        }
    }

    // Membros únicos alocados
    const membrosAlocados = new Set(alocados.map(a => a.membro_id).filter(Boolean));
    log(`\nMembros únicos alocados: ${membrosAlocados.size}`);

    fs.writeFileSync('diagnostico-alocacao.txt', output);
    log('\nSalvo em diagnostico-alocacao.txt');
    process.exit(0);
}

diagnosticar();
