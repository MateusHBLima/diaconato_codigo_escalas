
import { gerarEscalaMensal } from '../src/services/escala_mensal';

async function main() {
    console.log('--- TESTE: GERAÇÃO MISTA (POOL + ESCALA) ---');
    console.log('Fevereiro 2026 (gerarSomentePool = false)');

    // Executa o processo completo (deve salvar Pool E Alocações)
    await gerarEscalaMensal(2, 2026, false);
}

main().catch(console.error);
