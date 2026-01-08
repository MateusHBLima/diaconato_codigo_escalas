/**
 * Regras de Repetição de Funções
 * 
 * Define quais funções devem reutilizar pessoas de outras funções já alocadas.
 * Isso garante escalas mais enxutas (26-32 pessoas únicas).
 */

/**
 * Mapeamento de repetições: "Função destino" -> ["Funções fonte"]
 * 
 * A pessoa alocada na função fonte será reutilizada na função destino.
 * O índice [i] na função destino usa o ocupante [i] da função fonte.
 */
export const REPETITION_RULES: Record<string, RepetitionConfig> = {
    // Banheiro Masculino: repete do Hall (2 pessoas)
    'Masculino': {
        fontes: ['Hall'],
        indices: [0, 1], // Usa os 2 primeiros do Hall
        descricao: 'Banheiro Masculino repete do Hall'
    },

    // Banheiro Feminino: repete do Apoio (2 pessoas)
    'Feminino': {
        fontes: ['Apoio'],
        indices: [0, 1], // Usa as 2 primeiras do Apoio
        descricao: 'Banheiro Feminino repete do Apoio'
    },

    // Púlpito: repete de Corrente (1 pessoa)
    'Púlpito': {
        fontes: ['Corrente'],
        indices: [0], // Usa o primeiro da Corrente
        descricao: 'Púlpito repete de Corrente'
    },

    // Salvas (09): repete da Corrente Verde (Setor Verde tem correntes)
    'Lado Bateria (09 salvas)': {
        fontes: ['Corrente'],
        indices: [0], // Usa 1 pessoa da Corrente
        filtroSetor: 'verde', // Priorizar do setor verde
        descricao: 'Salvas repete da Corrente Verde'
    },

    // Máquinas (16): repete da Porta A3 (2 pessoas) + 1 da A4
    // Como as funções são chamadas apenas "Interno", precisamos usar ordem
    'Lado bateria (16 máquinas)': {
        fontes: ['Interno'], // Porta Nova A3 e A4 são "Interno"
        indices: [4, 5, 6, 7], // Índices 4-7 correspondem a A3 e A4 (depois de A1, A2)
        // Nota: A ordem depende de como as funções são ordenadas (ordem_exibicao)
        descricao: 'Máquinas usa Interno da Porta A3 + A4'
    },

    // Finalização: repete das Máquinas
    'Finalização': {
        fontes: ['Lado bateria (16 máquinas)'],
        indices: [0, 1], // Usa os 2 primeiros das Máquinas
        descricao: 'Finalização repete das Máquinas'
    }
};

export interface RepetitionConfig {
    fontes: string[];           // Nomes das funções fonte (usa includes para match)
    indices: number[];          // Quais índices das fontes usar
    filtroSetor?: string;       // Opcional: filtrar por setor (verde, azul, laranja)
    descricao: string;          // Descrição para logs
}

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
 * Também verificar o campo regras='REPETIR_PESSOA' do banco
 */
export function ehFuncaoRepeticao(nomeFuncao: string, regras: string | null): boolean {
    return regras?.includes('REPETIR_PESSOA') || temRegraRepeticao(nomeFuncao) !== null;
}
