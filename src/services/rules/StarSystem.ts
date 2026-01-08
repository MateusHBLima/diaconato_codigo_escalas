
import { Funcao, Membro } from '../../types';

export const STAR_REQUIREMENTS: Record<number, string[]> = {
    // 1 Estrela
    1: [
        'Hall - Porta A1', 'Hall - Porta A2', 'Hall - Porta A3', 'Hall - Porta A4',
        'Apoio', 'Apoio setor azul', 'Apoio setor verde', 'Apoio setor laranja'
    ],
    // 2 Estrelas
    2: [
        'Interno - Porta A1', 'Interno - Porta A2', 'Interno - Porta A3', 'Interno - Porta A4',
        'Máquinas de Cartão'
    ],
    // 3 Estrelas
    3: [
        'Salvas', 'Finaliza Máquina de cartão', 'Corrente atrás do Pastor',
        'Responsável de setor', 'Corrente corredor da mídia', 'Corrente entre verde e laranja',
        'Corrente 1', 'Corrente 2'
    ],
    // 4 Estrelas
    4: [
        'Púlpito', 'Mesa, água e microfone', 'Mesa Santa Ceia'
    ],
    // 5 Estrelas
    5: [
        'Apoio oferta', 'Responsável pelo culto'
    ]
};

// Mapeamento de funções masculinas para repetição no Banheiro Masculino
export const REPETICAO_BANHEIRO_MASCULINO = [
    'Hall - Porta A2', 'Hall - Porta A4'
];

// Mapeamento de funções femininas para repetição no Banheiro Feminino
export const REPETICAO_BANHEIRO_FEMININO = [
    'Apoio setor azul', 'Apoio setor laranja'
];

/**
 * Verifica se um membro tem nível de experiência suficiente para uma função.
 * A lógica é cumulativa para níveis 1-4: Quem tem 3 estrelas pode fazer funções de 1, 2 e 3.
 * EXCEÇÃO: Nível 5 (Líderes) SÓ fazem funções de nível 5 (Responsável Geral e Apoio Oferta).
 */
export function podeExecutarFuncao(membro: Membro, nomeFuncao: string, especificidadeSexoFuncao: string): boolean {
    const estrelas = membro.nivel_experiencia || 1; // Default para 1 estrela se não definido

    // Verifica sexo
    if (membro.sexo === 'HOMEM' && especificidadeSexoFuncao === 'Mulher') return false;
    if (membro.sexo === 'MULHER' && especificidadeSexoFuncao === 'Homem') return false;

    // REGRA ESPECIAL: Líderes (Nível 5) SÓ podem fazer funções de Nível 5
    if (estrelas === 5) {
        const funcoesLider = STAR_REQUIREMENTS[5] || [];
        return funcoesLider.some(f => nomeFuncao.includes(f));
    }

    // Para níveis 1-4, lógica cumulativa normal
    for (let nivel = 1; nivel <= estrelas; nivel++) {
        const funcoesPermitidas = STAR_REQUIREMENTS[nivel] || [];
        if (funcoesPermitidas.some(f => nomeFuncao.includes(f))) {
            return true;
        }
    }

    return false;
}
