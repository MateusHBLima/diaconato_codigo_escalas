
import { Funcao, Membro } from '../../types';

export const STAR_REQUIREMENTS: Record<number, string[]> = {
    // 1 Estrela (Básico)
    1: [
        'Hall', // Cobre Hall A1, A2...
        'Apoio' // Cobre Apoio Geral, Setores
    ],
    // 2 Estrelas
    2: [
        'Interno', // Cobre Interno A1...
        'Máquinas', 'Cartão'
    ],
    // 3 Estrelas
    3: [
        'Salvas',
        'Corrente', // Cobre Corrente 1, 2, Mídia, Pastor
        'Feminino entre', // Correntes específicas
        'Masculino entre' // Correntes específicas
    ],
    // 4 Estrelas (Especialista)
    4: [
        'Púlpito',
        'Mesa', // Cobre Mesa água/mic e Mesa Santa Ceia
    ],
    // 5 Estrelas (Liderança)
    5: [
        'Responsável', // Cobre "Responsável e apoio"
        'Oferta'
    ]
};

// Mapeamento de funções masculinas para repetição no Banheiro Masculino
export const REPETICAO_BANHEIRO_MASCULINO = [
    'Hall' // Simplificado para pegar qualquer Hall se necessário, mas o código usa includes
];

// Mapeamento de funções femininas para repetição no Banheiro Feminino
export const REPETICAO_BANHEIRO_FEMININO = [
    'Apoio'
];

/**
 * Verifica se um membro tem nível de experiência suficiente para uma função.
 * A lógica é cumulativa para níveis 1-4: Quem tem 3 estrelas pode fazer funções de 1, 2 e 3.
 * EXCEÇÃO: Nível 5 (Líderes) SÓ fazem funções de nível 5 (Responsável Geral e Apoio Oferta).
 * FALLBACK: Se função não está mapeada, permite qualquer membro (exceto Líderes que são restritos).
 */
export function podeExecutarFuncao(membro: Membro, nomeFuncao: string, especificidadeSexoFuncao: string): boolean {
    const estrelas = membro.nivel_experiencia || 1; // Default para 1 estrela se não definido

    // Verifica sexo
    if (membro.sexo === 'HOMEM' && especificidadeSexoFuncao === 'Mulher') return false;
    if (membro.sexo === 'MULHER' && especificidadeSexoFuncao === 'Homem') return false;

    // Verificar se a função é de Nível 5 (Liderança)
    const funcoesLider = STAR_REQUIREMENTS[5] || [];
    const ehFuncaoLider = funcoesLider.some(f => nomeFuncao.includes(f));

    // REGRA ESPECIAL: Líderes (Nível 5) SÓ podem fazer funções de Nível 5
    if (estrelas === 5) {
        return ehFuncaoLider;
    }

    // Se é função de Líder mas membro NÃO é líder, barrar
    if (ehFuncaoLider) {
        return false;
    }

    // Para níveis 1-4, lógica cumulativa normal
    for (let nivel = 1; nivel <= estrelas; nivel++) {
        const funcoesPermitidas = STAR_REQUIREMENTS[nivel] || [];
        if (funcoesPermitidas.some(f => nomeFuncao.includes(f))) {
            return true;
        }
    }

    // FALLBACK: Se a função não está mapeada em nenhum nível, permitir qualquer membro com estrelas >= 1
    // Isso garante que não fiquem vagas vazias por falta de mapeamento
    const todasFuncoesConhecidas = Object.values(STAR_REQUIREMENTS).flat();
    const funcaoConhecida = todasFuncoesConhecidas.some(f => nomeFuncao.includes(f));

    if (!funcaoConhecida) {
        // Função não mapeada - permite qualquer um exceto líderes (que são restritos)
        return true;
    }

    return false;
}
