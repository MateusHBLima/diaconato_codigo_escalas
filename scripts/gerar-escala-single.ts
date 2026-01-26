
import { gerarEscalaParaCulto, buscarAlocacoesDoCulto } from '../src/services/escala';
import { supabase } from '../src/config/supabase';
import fs from 'fs';

function log(msg: string) {
    console.log(msg);
    fs.appendFileSync('generation_log.txt', msg + '\n');
}

async function main() {
    const cultoId = '17d4e7a9-37ea-4627-bb8d-ff22c086a057';
    fs.writeFileSync('generation_log.txt', 'Starting generation...\n'); // Reset log

    log(`🚀 Iniciando geração de escala para o culto ${cultoId}...`);

    try {
        const resultado = await gerarEscalaParaCulto(cultoId);

        log('\n✅ Escala gerada com sucesso!');
        log(`   Preenchidas: ${resultado.vagas_preenchidas}`);
        log(`   Vazias: ${resultado.vagas_vazias}`);

        // Buscar detalhes para exibir
        const { data: alocacoes, error } = await supabase
            .from('escalas_alocacoes')
            .select(`
                status,
                motivo_falha,
                funcao:funcoes (nome, setor_pai),
                membro:membros (nome_completo, nivel_experiencia)
            `)
            .eq('culto_id', cultoId)
        //.order('funcao(ordem_exibicao)'); // Commented out to avoid join issues if any

        if (error) {
            log(`Erro ao buscar detalhes: ${error.message}`);
            return;
        }

        // Formatar saída
        const linhas: string[] = [];
        linhas.push(`📅 ESCALA GERADA PARA 29/01/2026\n`);

        // Agrupar por setor (simplificado)
        alocacoes?.forEach((a: any) => {
            const nomeFuncao = a.funcao?.nome || 'N/A';
            const setor = a.funcao?.setor_pai || 'N/A';
            const status = a.status;

            if (status === 'ALOCADO') {
                const nomeMembro = a.membro?.nome_completo || 'DESCONHECIDO';
                const nivel = a.membro?.nivel_experiencia || '?';
                linhas.push(`✅ [${setor}] ${nomeFuncao}: ${nomeMembro} (Nível ${nivel})`);
            } else {
                linhas.push(`❌ [${setor}] ${nomeFuncao}: VAZIO (${a.motivo_falha})`);
            }
        });

        const output = linhas.join('\n');
        log('\n' + output);
        fs.writeFileSync('escala-gerada-29-01.txt', output, 'utf8');

    } catch (error: any) {
        log(`❌ Erro fatal: ${error.message}`);
        if (error.stack) {
            log(error.stack);
        }
    }
}

main();
