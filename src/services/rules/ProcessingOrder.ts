/**
 * Ordem de Processamento das Funções
 * 
 * Define a ordem em que as funções devem ser processadas para garantir
 * que as fontes sejam alocadas ANTES dos destinos.
 * 
 * Ordem:
 * 1. PORTAS (Hall + Interno) - fontes primárias
 * 2. SETORES (Responsável, Correntes, Apoios) - fontes para Máquinas, Banheiros
 * 3. ALTAR (Mesa) - pessoa nova
 * 4. OFERTA - usa Resp. Gerais + Resp. Ala Verde
 * 5. MÁQUINAS - usa Interno + Apoio + Resp. Ala
 * 6. BANHEIROS - usa Hall + Apoio 2
 * 7. FINALIZAÇÃO - usa Máquinas 1,2
 * 8. SALVAS - usa Interno A4 + Corrente
 * 9. PÚLPITO - usa Corrente
 */

/**
 * Define a ordem de processamento dos setores/grupos de funções
 */
export const PROCESSING_ORDER: string[] = [
    // Fase 1: Portas (fontes primárias)
    'PORTA - A1 Parede',
    'PORTA - A2',
    'PORTA Nova - A3',
    'PORTA Nova - A4',

    // Fase 2: Setores (fontes secundárias)
    'SETOR AZUL',
    'SETOR VERDE',
    'SETOR LARANJA',

    // Fase 3: Altar (Mesa é pessoa nova, Púlpito vem no fim)
    'ALTAR',

    // Fase 4: Oferta (usa Responsáveis)
    'OFERTA',

    // Fase 5: Máquinas (usa Interno + Apoio + Resp. Ala)
    'MÁQUINAS (16 ao total)',

    // Fase 6: Banheiros (usa Hall + Apoio 2)
    'BANHEIROS',

    // Fase 7: Finalização (usa Máquinas 1,2)
    'FINALIZAM AS MÁQUINAS',

    // Fase 8: Salvas (usa Interno A4)
    'SALVAS',
];

/**
 * Ordena as funções de acordo com PROCESSING_ORDER
 * Funções cujo setor_pai não está na lista vão para o final
 */
export function ordenarFuncoesPorProcessamento<T extends { setor_pai: string; ordem_exibicao: number }>(
    funcoes: T[]
): T[] {
    return [...funcoes].sort((a, b) => {
        const ordemA = PROCESSING_ORDER.indexOf(a.setor_pai);
        const ordemB = PROCESSING_ORDER.indexOf(b.setor_pai);

        // Se ambos estão na lista, usar a ordem definida
        if (ordemA !== -1 && ordemB !== -1) {
            if (ordemA !== ordemB) return ordemA - ordemB;
            // Mesmo setor: usar ordem_exibicao original
            return a.ordem_exibicao - b.ordem_exibicao;
        }

        // Se só um está na lista, ele vem primeiro
        if (ordemA !== -1) return -1;
        if (ordemB !== -1) return 1;

        // Nenhum está na lista: usar ordem_exibicao
        return a.ordem_exibicao - b.ordem_exibicao;
    });
}

/**
 * Separa funções que precisam de processamento especial (repetição)
 * das funções que são processadas normalmente
 */
export function separarFuncoesEspeciais<T extends { nome: string; setor_pai: string }>(
    funcoes: T[]
): { normais: T[]; especiais: T[] } {
    const setoresEspeciais = [
        'MÁQUINAS',
        'BANHEIROS',
        'FINALIZAM',
        'SALVAS',
        'OFERTA',
    ];

    const normais: T[] = [];
    const especiais: T[] = [];

    for (const f of funcoes) {
        const ehEspecial = setoresEspeciais.some(s =>
            f.setor_pai.toUpperCase().includes(s) ||
            (f.nome === 'Púlpito' && f.setor_pai === 'ALTAR')
        );

        if (ehEspecial) {
            especiais.push(f);
        } else {
            normais.push(f);
        }
    }

    return { normais, especiais };
}
