import { Funcao, Membro } from '../../types';

export const STAR_REQUIREMENTS: Record<number, string[]> = {
    // 1 Estrela (Nível 1)
    1: [
        'Hall', // Hall da porta
        'Interno', // Interno da porta
        'Corrente 1',
        'Corrente 2',
        'Corrente corredor da mídia',
        'Corrente entre verde e laranja'
    ],
    // 2 Estrelas (Nível 2)
    2: [
        'Máquinas', 'Cartão', 'Finalização', // Máquina (oferta)
        'Apoio' // Apoio
    ],
    // 3 Estrelas (Nível 3)
    3: [
        'atrás do Pastor', // Atrás pastor
        'Salvas', // Salva
        'Responsável' // Responsável do setor (Responsável e apoio)
    ],
    // 4 Estrelas (Nível 4)
    4: [
        'Púlpito',
        'Mesa' // Mesa (Mesa, água e microfone)
    ],
    // 5 Estrelas (Liderança Geral)
    5: []
};

/**
 * Define o LIMITE MÁXIMO de estrelas para certas funções.
 */
export const STAR_MAX_LIMITS: Record<string, number> = {
    'Hall': 2,
    'Interno': 2,
    'Apoio': 2,
    'Corrente 1': 2,
    'Corrente 2': 2,
    'Corrente corredor da mídia': 2,
    'Corrente entre verde e laranja': 2,
};

type MinStarRule = {
    minStars: number;
    setores?: string[];
    vagaIndex?: number;
};

export const STAR_MIN_LIMITS: Record<string, MinStarRule> = {
    'Apoio': {
        minStars: 2,
        setores: ['Verde', 'Azul', 'Laranja'],
        vagaIndex: 0
    }
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
export function podeExecutarFuncao(
    membro: Membro,
    nomeFuncao: string,
    especificidadeSexoFuncao: string,
    setorPai?: string,
    numeroVaga?: number
): boolean {
    const estrelas = membro.nivel_experiencia || 1; // Default para 1 estrela se não definido

    // ---------------------------------------------------
    // REGRA DE GÊNERO (DATABASE & PROGRAMÁTICA)
    // ---------------------------------------------------
    if (membro.sexo === 'HOMEM' && especificidadeSexoFuncao === 'Mulher') return false;
    if (membro.sexo === 'MULHER' && especificidadeSexoFuncao === 'Homem') return false;

    const nomeLower = nomeFuncao.toLowerCase();
    
    // 1. Porta (Hall e Interno) -> apenas homens
    if ((nomeLower.includes('hall') || nomeLower.includes('interno')) && membro.sexo !== 'HOMEM') {
        return false;
    }
    // 2. Apoio (exceto Responsável e apoio) -> apenas mulheres
    if (nomeLower.includes('apoio') && !nomeLower.includes('responsável') && membro.sexo !== 'MULHER') {
        return false;
    }
    // 3. Púlpito -> apenas homens
    if (nomeLower.includes('púlpito') && membro.sexo !== 'HOMEM') {
        return false;
    }
    // 4. Mesa Santa Ceia -> apenas mulheres
    if (nomeLower.includes('mesa') && membro.sexo !== 'MULHER') {
        return false;
    }

    // REGRA ESPECIAL: Líderes (Nível 5) NÃO são alocados via função.
    if (estrelas === 5) {
        return false;
    }

    // REGRA DE PRIORIDADE:
    if (membro.aptidoes?.includes('Prioridade Mesa')) {
        if (!nomeFuncao.toLowerCase().includes('mesa')) {
            return false;
        }
    }

    // ===============================================
    // VERIFICAÇÃO DE TETO (MAX_STARS)
    // ===============================================
    for (const [chave, maxEstrelas] of Object.entries(STAR_MAX_LIMITS)) {
        if (nomeFuncao.includes(chave)) {
            // EXCEÇÃO IMPORTANTE: "Apoio" também tem em "Responsável e apoio" e "Apoio - Oferta"
            if (chave === 'Apoio' && nomeFuncao.toLowerCase().includes('responsável')) {
                continue; // Ignora o teto de Apoio se for Responsável
            }

            if (estrelas > maxEstrelas) {
                return false;
            }
        }
    }

    // ===============================================
    // VERIFICAÇÃO DE PISO (MIN_STARS)
    // ===============================================
    for (const [chave, regra] of Object.entries(STAR_MIN_LIMITS)) {
        if (nomeFuncao.includes(chave)) {
            if (regra.setores && setorPai) {
                const setorPermitido = regra.setores.some(s => setorPai.toLowerCase().includes(s.toLowerCase()));
                if (!setorPermitido) continue;
            } else if (regra.setores && !setorPai) {
                continue;
            }

            if (regra.vagaIndex !== undefined && numeroVaga !== undefined) {
                if (numeroVaga !== regra.vagaIndex) continue;
            }

            if (estrelas < regra.minStars) {
                const isStretchAllowed = (estrelas === 2 && regra.minStars === 3);
                if (!isStretchAllowed) {
                    return false;
                }
            }
        }
    }

    // Para níveis 1-4, lógica cumulativa normal
    let nivelEfetivo = estrelas;

    for (let nivel = 1; nivel <= nivelEfetivo; nivel++) {
        const funcoesPermitidas = STAR_REQUIREMENTS[nivel] || [];
        for (const f of funcoesPermitidas) {
            if (nomeFuncao.includes(f)) {
                // Se for Apoio, mas for Responsável e apoio, só permite se for nível >= 3
                if (f === 'Apoio' && nomeFuncao.toLowerCase().includes('responsável')) {
                    continue;
                }
                return true;
            }
        }
    }

    // FALLBACK: Se a função não está mapeada em nenhum nível, permitir qualquer membro com estrelas >= 1
    const todasFuncoesConhecidas = Object.values(STAR_REQUIREMENTS).flat();
    const funcaoConhecida = todasFuncoesConhecidas.some(f => nomeFuncao.includes(f));

    if (!funcaoConhecida) {
        return true;
    }

    return false;
}

/**
 * Retorna o nível de estrelas exigido para uma função.
 * Usado para priorizar membros com nível mais adequado (evitar experientes em funções básicas).
 */
export function getNivelExigidoParaFuncao(nomeFuncao: string): number {
    // Buscar do nível mais alto para o mais baixo
    for (let nivel = 4; nivel >= 1; nivel--) {
        const funcoes = STAR_REQUIREMENTS[nivel] || [];
        if (funcoes.some(f => nomeFuncao.includes(f))) {
            return nivel;
        }
    }
    return 1; // Default para funções não mapeadas
}
