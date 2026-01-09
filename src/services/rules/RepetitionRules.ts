/**
 * Regras de Repetição Completas
 * 
 * Define TODAS as regras de repetição para alcançar 28 pessoas únicas.
 * Cada regra especifica:
 * - Função destino
 * - Fontes (por setor/posição específica)
 * - Mapeamento de vagas
 */

// ============================================
// TIPOS
// ============================================

export interface PositionRule {
    /** Padrão para identificar a função destino (usa includes) */
    destinoPattern: string;
    /** Setor da função destino (opcional, para especificar qual "Apoio" é) */
    destinoSetor?: string;
    /** Mapeamento: índice da vaga destino -> fonte específica */
    mapeamento: VagaMapping[];
    /** Descrição para logs */
    descricao: string;
}

export interface VagaMapping {
    /** Índice da vaga no destino (0-based) */
    vagaDestino: number;
    /** Padrão da função fonte */
    fontePattern: string;
    /** Setor específico da fonte (ex: "PORTA - A2") */
    fonteSetor?: string;
    /** Índice da vaga na fonte (qual pessoa pegar) */
    vagaFonte: number;
}

// ============================================
// REGRAS DETALHADAS
// ============================================

export const DETAILED_RULES: PositionRule[] = [
    // ========== MÁQUINAS (8 posições) ==========
    {
        destinoPattern: 'Lado bateria (16 máquinas)',
        mapeamento: [
            // Posição 1: Interno A2 (quem finaliza)
            { vagaDestino: 0, fontePattern: 'Interno', fonteSetor: 'PORTA - A2', vagaFonte: 0 },
            // Posição 2: Interno A3 (quem finaliza)
            { vagaDestino: 1, fontePattern: 'Interno', fonteSetor: 'PORTA Nova - A3', vagaFonte: 0 },
            // Posição 3: Interno A1
            { vagaDestino: 2, fontePattern: 'Interno', fonteSetor: 'PORTA - A1 Parede', vagaFonte: 0 },
            // Posição 4: Apoio 1 (Azul) - primeira vaga do Apoio Azul
            // NOTA: fonteExact=true para não pegar "Responsável e apoio"
            { vagaDestino: 3, fontePattern: '^Apoio$', fonteSetor: 'SETOR AZUL', vagaFonte: 0 },
            // Posição 5: Apoio 1 (Verde) - primeira vaga do Apoio Verde
            { vagaDestino: 4, fontePattern: '^Apoio$', fonteSetor: 'SETOR VERDE', vagaFonte: 0 },
            // Posição 6: Apoio 1 (Laranja) - primeira vaga do Apoio Laranja
            { vagaDestino: 5, fontePattern: '^Apoio$', fonteSetor: 'SETOR LARANJA', vagaFonte: 0 },
            // Posição 7: Responsável Ala Azul
            { vagaDestino: 6, fontePattern: 'Responsável e apoio', fonteSetor: 'SETOR AZUL', vagaFonte: 0 },
            // Posição 8: Responsável Ala Laranja
            { vagaDestino: 7, fontePattern: 'Responsável e apoio', fonteSetor: 'SETOR LARANJA', vagaFonte: 0 },
        ],
        descricao: 'Máquinas: Internos + Apoios + Responsáveis Ala'
    },

    // ========== FINALIZAÇÃO (2 posições) ==========
    {
        destinoPattern: 'Finalização',
        mapeamento: [
            // Posição 1: mesmo que Máquinas posição 1
            { vagaDestino: 0, fontePattern: 'Lado bateria (16 máquinas)', vagaFonte: 0 },
            // Posição 2: mesmo que Máquinas posição 2
            { vagaDestino: 1, fontePattern: 'Lado bateria (16 máquinas)', vagaFonte: 1 },
        ],
        descricao: 'Finalização: Máquinas 1 e 2'
    },

    // ========== BANHEIRO MASCULINO (2 posições) ==========
    {
        destinoPattern: 'Masculino',
        mapeamento: [
            // Banheiro antigo: Hall A2
            { vagaDestino: 0, fontePattern: 'Hall', fonteSetor: 'PORTA - A2', vagaFonte: 0 },
            // Banheiro novo: Hall A3
            { vagaDestino: 1, fontePattern: 'Hall', fonteSetor: 'PORTA Nova - A3', vagaFonte: 0 },
        ],
        descricao: 'Banheiro Masculino: Hall A2 (antigo) + A3 (novo)'
    },

    // ========== BANHEIRO FEMININO (2 posições) ==========
    {
        destinoPattern: 'Feminino',
        mapeamento: [
            // Banheiro antigo: Apoio 2 (segunda vaga) do Azul
            // NOTA: fonteExact=true (^Apoio$) para não pegar "Responsável e apoio"
            { vagaDestino: 0, fontePattern: '^Apoio$', fonteSetor: 'SETOR AZUL', vagaFonte: 1 },
            // Banheiro novo: Apoio 2 (segunda vaga) do Verde
            { vagaDestino: 1, fontePattern: '^Apoio$', fonteSetor: 'SETOR VERDE', vagaFonte: 1 },
        ],
        descricao: 'Banheiro Feminino: Apoio 2 Azul (antigo) + Verde (novo)'
    },

    // ========== PÚLPITO (1 posição) ==========
    {
        destinoPattern: 'Púlpito',
        destinoSetor: 'ALTAR',
        mapeamento: [
            // Repete da Corrente entre verde e azul
            { vagaDestino: 0, fontePattern: 'Corrente entre verde e azul', vagaFonte: 0 },
        ],
        descricao: 'Púlpito: Corrente Verde/Azul'
    },

    // ========== SALVAS (1-2 posições) ==========
    {
        destinoPattern: 'Lado Bateria (09 salvas)',
        mapeamento: [
            // Interno A4
            { vagaDestino: 0, fontePattern: 'Interno', fonteSetor: 'PORTA Nova - A4', vagaFonte: 0 },
            // Se tiver segunda vaga, pegar de Corrente
            // (isso será tratado como fallback no código)
        ],
        descricao: 'Salvas: Interno A4'
    },
];

// ============================================
// REGRA ESPECIAL: OFERTA
// ============================================
// Oferta é tratada separadamente porque usa:
// - 2 Responsáveis Gerais (Nível 5)
// - 1 Responsável de Ala mais experiente (Verde)
// Esta lógica permanece em escala.ts

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Busca a regra detalhada para uma função destino
 */
export function buscarRegraDetalhada(nomeFuncao: string, setorFuncao?: string): PositionRule | null {
    for (const regra of DETAILED_RULES) {
        if (nomeFuncao.toLowerCase().includes(regra.destinoPattern.toLowerCase())) {
            // Se a regra especifica um setor, verificar
            if (regra.destinoSetor && setorFuncao) {
                if (!setorFuncao.toLowerCase().includes(regra.destinoSetor.toLowerCase())) {
                    continue;
                }
            }
            return regra;
        }
    }
    return null;
}

/**
 * Busca ocupante específico no mapa quemEstaOnde
 * @param quemEstaOnde Mapa de função -> lista de IDs
 * @param fontePattern Padrão da função fonte
 * @param fonteSetor Setor específico (opcional)
 * @param vagaFonte Índice da vaga na fonte
 */
export function buscarOcupanteFonte(
    quemEstaOnde: Map<string, string[]>,
    fontePattern: string,
    fonteSetor: string | undefined,
    vagaFonte: number
): string | null {
    // Construir chave de busca baseada em padrão + setor
    for (const [chave, ocupantes] of quemEstaOnde.entries()) {
        const chaveLower = chave.toLowerCase();
        const patternLower = fontePattern.toLowerCase();

        if (!chaveLower.includes(patternLower)) continue;

        // Se tem setor específico, verificar
        if (fonteSetor) {
            // A chave não contém o setor diretamente, precisamos buscar pelo setorMap
            // Por enquanto, vamos confiar que a chave combina
        }

        if (ocupantes.length > vagaFonte && ocupantes[vagaFonte] !== 'VAZIO') {
            return ocupantes[vagaFonte];
        }
    }
    return null;
}
