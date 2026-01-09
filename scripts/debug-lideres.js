
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';
const log = (msg) => { console.log(msg); output += msg + '\n'; };

function parseDisponibilidade(valor) {
    if (!valor) return { disponivel: false, limiteEscalas: 0 };
    const v = valor.toString().toUpperCase();
    if (v.includes('NÃO') || v === 'N' || v === 'NAO') {
        return { disponivel: false, limiteEscalas: 0 };
    }
    if (v.includes('SIM') || v === 'S' || v === 'YES') {
        const match = v.match(/(\d+)/);
        const limite = match ? parseInt(match[1]) : 4;
        return { disponivel: true, limiteEscalas: limite };
    }
    return { disponivel: true, limiteEscalas: 4 };
}

async function debugLideres() {
    try {
        log('🔍 DEBUG DETECÇÃO DE LÍDERES NÍVEL 5\n');

        const { data: culto, error: erroCulto } = await supabase
            .from('datas_cultos')
            .select('id, nome_culto, periodo')
            .gte('data_culto', '2026-01-04')
            .lt('data_culto', '2026-01-05')
            .limit(1)
            .single();

        if (erroCulto) {
            log(`Erro ao buscar culto: ${erroCulto.message}`);
        } else {
            log(`📅 Culto: ${culto?.nome_culto}`);
            log(`🕐 Período: "${culto?.periodo}"`);
        }

        const { data: nivel5, error: erroNivel5 } = await supabase
            .from('membros')
            .select('id, nome_completo, nivel_experiencia, disponibilidade_domingo, melhor_periodo_domingo')
            .eq('nivel_experiencia', 5)
            .eq('ativo', true);

        if (erroNivel5) {
            log(`Erro ao buscar membros: ${erroNivel5.message}`);
        } else {
            log(`\n👑 Membros Nível 5: ${nivel5?.length}`);

            nivel5?.forEach(m => {
                log(`\n- ${m.nome_completo}`);

                const disp = m.disponibilidade_domingo;
                const { disponivel } = parseDisponibilidade(disp);
                log(`  Disponibilidade: "${disp}" → ${disponivel ? '✅' : '❌'}`);
                log(`  Melhor período: "${m.melhor_periodo_domingo}"`);
            });
        }

    } catch (e) {
        log(`ERRO: ${e.message}`);
    } finally {
        writeFileSync('debug-lideres.txt', output);
        console.log('\n📁 Salvo em debug-lideres.txt');
    }
}

debugLideres();
