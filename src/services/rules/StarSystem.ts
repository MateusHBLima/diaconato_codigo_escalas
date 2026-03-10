
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
    // 3 Estrelas (Responsáveis de Ala e Correntes)
    3: [
        'Salvas',
        'Corrente', // Cobre Corrente 1, 2, Mídia, Pastor
        'Feminino entre', // Correntes específicas
        'Masculino entre', // Correntes específicas
        'Responsável' // Responsável e apoio (Ala) - SÓ MULHERES pelo banco
    ],
    // 4 Estrelas (Especialista)
    4: [
        'Púlpito',
        'Mesa', // Cobre Mesa água/mic e Mesa Santa Ceia
    ],
    // 5 Estrelas (Liderança Geral)
    // NOTA: Líderes Nível 5 NÃO são alocados via função normal.
    // Eles são salvos diretamente em datas_cultos.responsavel_geral_1_id / _2_id
    // O Nível 5 fica vazio para que líderes não sejam escalados em funções normais.
    5: []
};

/**
 * Define o LIMITE MÁXIMO de estrelas para certas funções.
 * Isso garante que funções básicas (Hall, Apoio) sejam feitas APENAS por quem é Nível 1 ou 2.
 * Membros Nível 3+ serão BLOQUEADOS dessas funções.
 */
export const STAR_MAX_LIMITS: Record<string, number> = {
    'Hall': 2,    // Apenas 1★ e 2★ podem fazer Hall
    'Apoio': 2,   // Apenas 1★ e 2★ podem fazer Apoio (exceto "Responsável e apoio" que é 3★)
    'Interno': 3, // Apenas 2★ e 3★ podem fazer Interno
    'Corrente': 3, // Apenas 2-3★ podem fazer Corrente
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

    // Verifica sexo
    if (membro.sexo === 'HOMEM' && especificidadeSexoFuncao === 'Mulher') return false;
    if (membro.sexo === 'MULHER' && especificidadeSexoFuncao === 'Homem') return false;

    // REGRA ESPECIAL: Líderes (Nível 5) NÃO são alocados via função.
    // Eles são salvos diretamente em datas_cultos.responsavel_geral_1_id / _2_id
    // Portanto, bloquear de TODAS as funções normais.
    if (estrelas === 5) {
        return false;
    }

    // REGRA DE PRIORIDADE:
    // Quem tem "Prioridade Mesa" só deve fazer Mesa (para não ser roubado por outras funções processadas antes)
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
                // console.log(`   🚫 Bloqueio MaxStars: ${membro.nome_completo} (${estrelas}★) > ${nomeFuncao} (Max ${maxEstrelas})`);
                return false;
            }
        }
    }

    // ===============================================
    // VERIFICAÇÃO DE PISO (MIN_STARS)
    // ===============================================
    for (const [chave, regra] of Object.entries(STAR_MIN_LIMITS)) {
        if (nomeFuncao.includes(chave)) {
            // Verifica Setor
            if (regra.setores && setorPai) {
                const setorPermitido = regra.setores.some(s => setorPai.toLowerCase().includes(s.toLowerCase()));
                if (!setorPermitido) continue;
            } else if (regra.setores && !setorPai) {
                continue; // Se requer setor e não foi passado, ignora (ou assume seguro não bloquear)
            }

            // Verifica Vaga
            if (regra.vagaIndex !== undefined && numeroVaga !== undefined) {
                if (numeroVaga !== regra.vagaIndex) continue;
            }

            if (estrelas < regra.minStars) {
                // NOVA REGRA (STRETCH): Se for Nível 2 tentando função Nível 3, PERMITIR se a regra exigir Min 3?
                // O pedido foi "Talvez os de 2 poderem servir em 3".
                // Se a função exige Nível 3 (ex: Corrente não tem regra explicita aqui, mas cai no loop cumulativo abaixo).
                // As regras de MIN_LIMITS aqui são 'hard blocks' para setores específicos (ex: Apoio Corrente).
                // Se o membro é 2 e exige 2, ok.
                const isStretchAllowed = (estrelas === 2 && regra.minStars === 3);
                if (!isStretchAllowed) {
                    return false;
                }
            }
        }
    }

    // Para níveis 1-4, lógica cumulativa normal
    // REGRA ESTRITA: Cada nível só faz as funções do seu nível e abaixo
    // Nível 2 NÃO pode fazer funções de nível 3 (sem stretch)

    let nivelEfetivo = estrelas;

    for (let nivel = 1; nivel <= nivelEfetivo; nivel++) {
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
