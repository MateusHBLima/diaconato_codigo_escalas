/**
 * Regenerar escala mensal usando código fonte TypeScript atualizado
 */

import { gerarEscalaMensal } from '../src/services/escala_mensal.js';

const mes = parseInt(process.argv[2]) || 1;
const ano = parseInt(process.argv[3]) || 2026;

console.log(`\n🔄 Regenerando escala ${mes}/${ano} com nova lógica...\n`);

gerarEscalaMensal(mes, ano)
    .then(() => {
        console.log(`\n✅ Escala ${mes}/${ano} regenerada com sucesso!`);
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Erro:', err);
        process.exit(1);
    });
