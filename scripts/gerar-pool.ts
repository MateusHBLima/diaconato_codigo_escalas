import { gerarEscalaMensal } from '../src/services/escala_mensal';

async function main() {
    console.log('--- GERADOR DE POOL MENSAL ---');
    console.log('Fevereiro 2026 (Modo Somente Pool)');

    // Generate Pool for Feb 2026 (true = onlyPool)
    await gerarEscalaMensal(2, 2026, true);
}

main().catch(console.error);
