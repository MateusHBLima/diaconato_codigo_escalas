
import { gerarEscalaMensal } from '../src/services/escala_mensal.js';
import dotenv from 'dotenv';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MES_TESTE = 3; // Março
const ANO_TESTE = 2026;

async function run() {
    console.log(`\n🧪 Teste Direto: Gerar Escala Mensal por 2 Fases (${MES_TESTE}/${ANO_TESTE})`);

    try {
        const resultado = await gerarEscalaMensal(MES_TESTE, ANO_TESTE);

        console.log('\n✅ Geração concluída!');
        console.log(`Cultos Processados: ${resultado.resultados.length}`);

        resultado.resultados.forEach(r => {
            console.log(`Culto ID: ${r.culto_id} | Preenchidas: ${r.vagas_preenchidas} | Vazias: ${r.vagas_vazias}`);
        });

    } catch (error) {
        console.error('\n❌ Erro Fatal:', error);
    }
}

run();
