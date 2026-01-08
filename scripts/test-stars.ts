
import { podeExecutarFuncao, STAR_REQUIREMENTS, REPETICAO_BANHEIRO_MASCULINO } from '../src/services/rules/StarSystem.js';
import { Membro } from '../src/types/index.js';

// Mock de membros
const membroNivel1: Partial<Membro> = { nivel_experiencia: 1, sexo: 'HOMEM' };
const membroNivel3: Partial<Membro> = { nivel_experiencia: 3, sexo: 'HOMEM' };
const membroNivel5: Partial<Membro> = { nivel_experiencia: 5, sexo: 'HOMEM' };

// Teste 1: Membro Nível 1 não pode fazer função Nível 3
console.log('Teste 1 - Nível Insuficiente:',
    !podeExecutarFuncao(membroNivel1 as Membro, 'Corrente 1', 'Unissex') ? 'PASS' : 'FAIL');

// Teste 2: Membro Nível 3 pode fazer função Nível 3
console.log('Teste 2 - Nível Exato:',
    podeExecutarFuncao(membroNivel3 as Membro, 'Corrente 1', 'Unissex') ? 'PASS' : 'FAIL');

// Teste 3: Membro Nível 5 pode fazer função Nível 1 (Cumulativo)
console.log('Teste 3 - Nível Superior (Cumulativo):',
    podeExecutarFuncao(membroNivel5 as Membro, 'Hall - Porta A1', 'Unissex') ? 'PASS' : 'FAIL');

// Teste 4: Membro Nível 3 NÃO pode fazer função Nível 4 (Púlpito)
console.log('Teste 4 - Nível Limite:',
    !podeExecutarFuncao(membroNivel3 as Membro, 'Púlpito', 'Homem') ? 'PASS' : 'FAIL');

// Teste 5: Repetição Banheiro
console.log('Teste 5 - Mapeamento Repetição:',
    REPETICAO_BANHEIRO_MASCULINO[0] === 'Hall - Porta A2' ? 'PASS' : 'FAIL');

// Teste 6: Mulher Nível 4 pode fazer Mesa Santa Ceia
const membroMulherNivel4: Partial<Membro> = { nivel_experiencia: 4, sexo: 'MULHER' };
console.log('Teste 6 - Mulher Nível 4 (Mesa Santa Ceia):',
    podeExecutarFuncao(membroMulherNivel4 as Membro, 'Mesa Santa Ceia', 'Mulher') ? 'PASS' : 'FAIL');

// Teste 7: Líder (Nível 5) NÃO pode fazer função de Nível 1 (Hall Porta)
console.log('Teste 7 - Líder Restrito (NÃO Hall):',
    !podeExecutarFuncao(membroNivel5 as Membro, 'Hall - Porta A1', 'Homem') ? 'PASS' : 'FAIL');

// Teste 8: Líder (Nível 5) PODE fazer Apoio Oferta
console.log('Teste 8 - Líder em Apoio Oferta:',
    podeExecutarFuncao(membroNivel5 as Membro, 'Apoio oferta', 'Homem') ? 'PASS' : 'FAIL');

console.log('--- FIM DOS TESTES ---');
