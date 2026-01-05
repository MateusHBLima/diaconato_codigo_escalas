import cron from 'node-cron';
import dayjs from 'dayjs';
import { gerarCultosDoMes, salvarCultos, buscarCultosDoMes } from './cultos.js';
import { gerarEscalaParaCulto } from './escala.js';

export function iniciarAgendamento() {
    // Rodar dia 1 de cada mês às 00:00
    // Formato cron: min hora dia_mes mes dia_semana
    cron.schedule('0 0 1 * *', async () => {
        console.log('⏰ Iniciando tarefa agendada: Gerar escalas do mês');
        await executarRotinaMensal();
    });

    console.log('✅ Agendador iniciado: Configurado para dia 1 de cada mês às 00:00');
}

export async function executarRotinaMensal(mes?: number, ano?: number) {
    try {
        const hoje = dayjs();
        const mesAlvo = mes || (hoje.month() + 1); // 1-12
        const anoAlvo = ano || hoje.year();

        console.log(`📅 Executando rotina para: ${mesAlvo}/${anoAlvo}`);

        // 1. Gerar e salvar datas de culto
        console.log('1. Gerando datas de culto...');
        const cultosParaGerar = await gerarCultosDoMes(mesAlvo, anoAlvo);
        const resultadoCultos = await salvarCultos(cultosParaGerar);
        console.log(`   Datas processadas: ${resultadoCultos.criados} criadas, ${resultadoCultos.existentes} já existiam.`);

        // 2. Buscar cultos salvos (para ter os IDs)
        const cultosSalvos = await buscarCultosDoMes(mesAlvo, anoAlvo);

        // 3. Gerar escalas para cada culto
        console.log(`2. Gerando escalas para ${cultosSalvos.length} cultos...`);
        let escalasGeradas = 0;

        for (const culto of cultosSalvos) {
            // Verificar se já tem escala (opcional - por enquanto vamos regenerar/atualizar)
            // A função gerarEscalaParaCulto já limpa alocações anteriores

            console.log(`   > Gerando para ${culto.data_culto} (${culto.periodo})...`);
            await gerarEscalaParaCulto(culto.id);
            escalasGeradas++;
        }

        console.log(`✨ Rotina mensal finalizada! ${escalasGeradas} escalas geradas com sucesso.`);
        return { sucesso: true, escalasGeradas };

    } catch (erro) {
        console.error('❌ Erro na rotina mensal:', erro);
        return { sucesso: false, erro: String(erro) };
    }
}
