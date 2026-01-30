// ============================================
// TIPOS DO SISTEMA DE ESCALAS
// ============================================

export interface Membro {
    id: string;
    numero: number;
    nome_completo: string;
    telefone_celular: string;
    sexo: 'HOMEM' | 'MULHER';
    aptidoes: string[];
    ativo: boolean;
    disponibilidade_quinta: string;
    disponibilidade_domingo: string;
    melhor_periodo_domingo: string;
    monitor: string;
    nivel_experiencia?: number; // 1 a 5
    nome_conjuge?: string;
}

export interface Funcao {
    id: string;
    nome: string;
    descricao_instrucoes: string | null;
    especificidade_sexo: 'Homem' | 'Mulher' | 'Unissex';
    quantidade_pessoas: number;
    setor_pai: string;
    is_santa_ceia: boolean;
    ordem_exibicao: number;
    ativo: boolean;
    regras: string | null;
}

export interface Culto {
    id: string;
    data_culto: string;
    nome_culto: string;
    periodo: 'quinta' | 'domingo_manha' | 'domingo_noite';
    is_santa_ceia: boolean;
    aprovada: boolean;
    mes: number;
    ano: number;
    timestamp_criacao_escala: string | null;
    responsavel_geral_1_id: string | null;
    responsavel_geral_2_id: string | null;
}

export interface Alocacao {
    id?: string;
    culto_id: string;
    membro_id: string | null;
    funcao_id: string;
    status: 'ALOCADO' | 'SEM_CANDIDATO';
    motivo_falha: string | null;
}

export interface DisponibilidadeParsed {
    disponivel: boolean;
    vezesPorMes: number;
}

export interface ResultadoEscala {
    culto_id: string;
    alocacoes: Alocacao[];
    vagas_preenchidas: number;
    vagas_vazias: number;
}
