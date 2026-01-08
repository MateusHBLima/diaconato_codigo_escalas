/**
 * Regras de Repetição de Funções
 * 
 * Define quais funções devem reutilizar pessoas de outras funções já alocadas.
 * Isso garante escalas mais enxutas (~26-28 pessoas únicas).
 */

export interface RepetitionConfig {
    fontes: string[];           // Nomes das funções fonte (usa includes para match)
    indices: number[];          // Quais índices das fontes usar (vagas que repetem)
    novasVagas?: number;        // Quantas vagas são para pessoas NOVAS
    descricao: string;          // Descrição para logs
}

/**
 * Mapeamento de repetições: "Função destino" -> Config
 */
export const REPETITION_RULES: Record<string, RepetitionConfig> = {
    // Banheiro Masculino: repete do Hall (2 primeiras pessoas)
    'Masculino': {
        fontes: ['Hall'],
        indices: [0, 1],
        descricao: 'Banheiro Masculino repete do Hall'
    },

    // Banheiro Feminino: repete do Apoio (2 primeiras pessoas)
    'Feminino': {
        fontes: ['Apoio'],
        indices: [0, 1],
        descricao: 'Banheiro Feminino repete do Apoio'
    },

    // Púlpito: repete de Corrente (1 pessoa)
    'Púlpito': {
        fontes: ['Corrente'],
        indices: [0],
        descricao: 'Púlpito repete de Corrente'
    },

    // Salvas (09): repete da Corrente (1 pessoa)
    'Lado Bateria (09 salvas)': {
        fontes: ['Corrente'],
        indices: [0],
        descricao: 'Salvas repete da Corrente'
    },

    // Máquinas (16): ESPECIAL - 3 repetem do Interno + 5 novas
    // Índices 0,1,2 = repetem do Interno (Portas A3/A4)
    // Índices 3,4,5,6,7 = pessoas NOVAS
    'Lado bateria (16 máquinas)': {
        fontes: ['Interno'],
        indices: [0, 1, 2],  // Só 3 primeiras vagas repetem
        novasVagas: 5,       // 5 vagas são para pessoas novas
        descricao: 'Máquinas: 3 do Interno + 5 novos'
    },

    // Finalização: repete das Máquinas (2 primeiras)
    'Finalização': {
        fontes: ['Lado bateria'],
        indices: [0, 1],
        descricao: 'Finalização repete das Máquinas'
    }
};

/**
 * Verifica se uma função tem regra de repetição
 */
export function temRegraRepeticao(nomeFuncao: string): RepetitionConfig | null {
    for (const [funcao, config] of Object.entries(REPETITION_RULES)) {
        if (nomeFuncao.toLowerCase().includes(funcao.toLowerCase())) {
            return config;
        }
    }
    return null;
}

/**
 * Verifica se uma vaga específica deve repetir ou é para pessoa nova
 * @param config Configuração de repetição
 * @param indiceVaga Índice da vaga (0-based)
 * @returns true se deve repetir, false se deve buscar pessoa nova
 */
export function vagaDeveRepetir(config: RepetitionConfig, indiceVaga: number): boolean {
    // Se tem novasVagas definido, só repete nos índices especificados
    if (config.novasVagas !== undefined) {
        return config.indices.includes(indiceVaga);
    }
    // Se não tem novasVagas, todas as vagas repetem
    return true;
}

/**
 * Também verificar o campo regras='REPETIR_PESSOA' do banco
 */
export function ehFuncaoRepeticao(nomeFuncao: string, regras: string | null): boolean {
    return regras?.includes('REPETIR_PESSOA') || temRegraRepeticao(nomeFuncao) !== null;
}
