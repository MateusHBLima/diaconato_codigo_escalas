import type { DisponibilidadeParsed } from '../types/index.js';

/**
 * Parser de disponibilidade - converte texto livre para estrutura
 * 
 * Exemplos de entrada:
 * - "SIM, 2 VEZ POR MÊS" → { disponivel: true, vezesPorMes: 2 }
 * - "SIM, 4 DOMINGOS/MÊS" → { disponivel: true, vezesPorMes: 4 }
 * - "NÃO TENHO DISPONIBILIDADE NAS QUINTAS-FEIRAS" → { disponivel: false, vezesPorMes: 0 }
 */
export function parseDisponibilidade(texto: string | null): DisponibilidadeParsed {
    if (!texto) {
        return { disponivel: false, vezesPorMes: 0 };
    }

    const lower = texto.toLowerCase();

    // Padrões negativos
    const padraoNegativo = [
        'não tenho',
        'não posso',
        'nunca',
        'impossível',
        'indisponível',
        'sem disponibilidade'
    ];

    for (const padrao of padraoNegativo) {
        if (lower.includes(padrao)) {
            return { disponivel: false, vezesPorMes: 0 };
        }
    }

    // Padrões positivos - extrair número
    const matchNumero = texto.match(/(\d+)/);

    if (matchNumero) {
        const vezes = parseInt(matchNumero[1], 10);
        return { disponivel: true, vezesPorMes: Math.min(vezes, 5) }; // Cap em 5
    }

    // "SIM" genérico sem número
    if (lower.includes('sim') || lower.includes('livre') || lower.includes('ok')) {
        return { disponivel: true, vezesPorMes: 4 }; // Assume 4 (todos)
    }

    // "Quinzenal" = 2 vezes
    if (lower.includes('quinzenal')) {
        return { disponivel: true, vezesPorMes: 2 };
    }

    // Default: assume disponível 1 vez
    return { disponivel: true, vezesPorMes: 1 };
}

/**
 * Verifica se o membro atende o período do culto
 */
export function atendePeriodo(
    melhorPeriodo: string | null,
    periodoCulto: 'quinta' | 'domingo_manha' | 'domingo_noite'
): boolean {
    if (!melhorPeriodo) return true; // Sem preferência = aceita qualquer

    const lower = melhorPeriodo.toLowerCase();

    // Quinta-feira: qualquer um pode
    if (periodoCulto === 'quinta') return true;

    // "Qualquer período" = aceita ambos
    if (lower.includes('qualquer')) return true;

    // Verificar match de período
    if (periodoCulto === 'domingo_manha') {
        if (lower.includes('noite') && !lower.includes('manhã')) return false;
        return true;
    }

    if (periodoCulto === 'domingo_noite') {
        if (lower.includes('manhã') && !lower.includes('noite')) return false;
        return true;
    }

    return true;
}

/**
 * Verifica se o membro atende o gênero exigido pela função
 */
export function atendeGenero(
    sexoMembro: 'HOMEM' | 'MULHER',
    especificidadeFuncao: 'Homem' | 'Mulher' | 'Unissex'
): boolean {
    if (especificidadeFuncao === 'Unissex') return true;
    if (especificidadeFuncao === 'Homem' && sexoMembro === 'HOMEM') return true;
    if (especificidadeFuncao === 'Mulher' && sexoMembro === 'MULHER') return true;
    return false;
}

/**
 * Verifica se o membro tem a permissão exigida pela função
 * NOTA: REPETIR_PESSOA não é uma permissão, é um flag de comportamento
 */
export function atendePermissao(
    aptidoesMembro: string[],
    regraFuncao: string | null
): boolean {
    // Se função não exige permissão, qualquer um serve
    if (!regraFuncao) return true;

    // REPETIR_PESSOA não é uma permissão, é um flag de comportamento
    // Significa que a pessoa nessa função PODE ser repetida em outra
    if (regraFuncao.includes('REPETIR_PESSOA')) return true;

    // Verificar se membro tem a aptidão
    return aptidoesMembro.includes(regraFuncao);
}
