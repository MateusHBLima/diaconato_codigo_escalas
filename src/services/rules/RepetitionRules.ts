/**
 * Regras de Repetição de Funções
 * 
 * Define quais funções devem reutilizar pessoas de outras funções já alocadas.
 * Isso garante escalas mais enxutas (~26-28 pessoas únicas).
 */

export interface RepetitionConfig {
    fontes: string[];           // Nomes das funções fonte (usa includes para match)
    fontesExcluir?: string[];   // Padrões para EXCLUIR do match
    indicesFonte: number[];     // Quais índices das FONTES usar (0 = primeira fonte alocada)
    indicesVaga?: number[];     // Quais vagas do destino repetem (se omitido, todas)
    novasVagas?: number;        // Quantas vagas finais são para pessoas NOVAS
    descricao: string;          // Descrição para logs
}

/**
 * Mapeamento de repetições: "Função destino" -> Config
 */
export const REPETITION_RULES: Record<string, RepetitionConfig> = {
    // Banheiro Masculino: repete do Hall (2 primeiras pessoas do Hall)
    'Masculino': {
        fontes: ['Hall'],
        indicesFonte: [0, 1],  // Pega ocupantes 0 e 1 do Hall
        descricao: 'Banheiro Masculino repete do Hall'
    },

    // Banheiro Feminino: repete SOMENTE de funções "Apoio" (não "Responsável e apoio")
    // Precisa excluir "Responsável" do match
    'Feminino': {
        fontes: ['Apoio'],
        fontesExcluir: ['Responsável'],  // Exclui "Responsável e apoio"
        indicesFonte: [0, 1],  // Pega ocupantes 0 e 1 do Apoio
        descricao: 'Banheiro Feminino repete do Apoio'
    },

    // Púlpito: repete de Corrente (1 pessoa)
    'Púlpito': {
        fontes: ['Corrente'],
        indicesFonte: [0],
        descricao: 'Púlpito repete de Corrente'
    },

    // Salvas (09): repete da Corrente (1 pessoa)
    'Lado Bateria (09 salvas)': {
        fontes: ['Corrente'],
        indicesFonte: [0],
        descricao: 'Salvas repete da Corrente'
    },

    // Máquinas (16): 3 repetem do Interno (A3 e A4) + 5 novas
    // Interno está ordenado: 0=A1, 1=A2, 2=A3, 3=A4
    // Queremos A3 (2 pessoas) + A4 (1 pessoa) = indices 4,5,6,7 (considerando Hall+Interno)
    // Mas a fonte é apenas Interno, então índices 2,3 (A3 e A4)
    'Lado bateria (16 máquinas)': {
        fontes: ['Interno'],
        indicesFonte: [2, 3],  // Interno de A3 (índice 2) e A4 (índice 3)
        indicesVaga: [0, 1, 2],  // Vagas 0,1,2 repetem
        novasVagas: 5,  // Vagas 3-7 são novas
        descricao: 'Máquinas: 3 do Interno A3/A4 + 5 novos'
    },

    // Finalização: repete das Máquinas (2 primeiras)
    'Finalização': {
        fontes: ['Lado bateria (16 máquinas)'],  // Específico para evitar pegar Salvas
        indicesFonte: [0, 1],
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
 */
export function vagaDeveRepetir(config: RepetitionConfig, indiceVaga: number): boolean {
    // Se tem indicesVaga definido, só repete nesses índices
    if (config.indicesVaga !== undefined) {
        return config.indicesVaga.includes(indiceVaga);
    }
    // Se tem novasVagas, calcula quais são de repetição
    if (config.novasVagas !== undefined) {
        const totalVagas = config.indicesFonte.length + config.novasVagas;
        return indiceVaga < config.indicesFonte.length;
    }
    // Se não tem nada especificado, todas repetem
    return true;
}

/**
 * Verifica se uma chave de função deve ser incluída no match
 */
export function chaveMatchFonte(chave: string, config: RepetitionConfig): boolean {
    const chaveLower = chave.toLowerCase();

    // Verifica se inclui algum padrão fonte
    const matchFonte = config.fontes.some(f => chaveLower.includes(f.toLowerCase()));
    if (!matchFonte) return false;

    // Verifica se deve excluir
    if (config.fontesExcluir) {
        const deveExcluir = config.fontesExcluir.some(e => chaveLower.includes(e.toLowerCase()));
        if (deveExcluir) return false;
    }

    return true;
}

/**
 * Também verificar o campo regras='REPETIR_PESSOA' do banco
 */
export function ehFuncaoRepeticao(nomeFuncao: string, regras: string | null): boolean {
    return regras?.includes('REPETIR_PESSOA') || temRegraRepeticao(nomeFuncao) !== null;
}
