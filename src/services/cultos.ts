import dayjs from 'dayjs';
import { supabase } from '../config/supabase.js';
import type { Culto } from '../types/index.js';

/**
 * Gera as datas de culto para um mês específico
 */
export async function gerarCultosDoMes(mes: number, ano: number): Promise<Culto[]> {
    const cultosDoMes: Omit<Culto, 'id'>[] = [];

    // Primeiro dia do mês
    const primeiroDia = dayjs().year(ano).month(mes - 1).date(1);
    const diasNoMes = primeiroDia.daysInMonth();

    // Flag para identificar o primeiro domingo (Santa Ceia)
    let primeiroDomingoEncontrado = false;

    for (let dia = 1; dia <= diasNoMes; dia++) {
        const data = primeiroDia.date(dia);
        const diaDaSemana = data.day(); // 0 = Domingo, 4 = Quinta

        // Lógica da Santa Ceia: primeiro domingo do mês
        let isSantaCeia = false;
        if (diaDaSemana === 0 && !primeiroDomingoEncontrado) {
            isSantaCeia = true;
            primeiroDomingoEncontrado = true;
        }

        // Quinta-feira (dia 4)
        if (diaDaSemana === 4) {
            const dataCulto = data.hour(19).minute(30).second(0);

            cultosDoMes.push({
                data_culto: dataCulto.toISOString(),
                nome_culto: 'Culto da Vitória',
                periodo: 'quinta',
                is_santa_ceia: false,
                aprovada: false,
                mes,
                ano,
                timestamp_criacao_escala: null,
                responsavel_geral_1_id: null,
                responsavel_geral_2_id: null
            });
        }

        // Domingo (dia 0)
        if (diaDaSemana === 0) {
            // Manhã - 10:00
            const dataManha = data.hour(10).minute(0).second(0);
            cultosDoMes.push({
                data_culto: dataManha.toISOString(),
                nome_culto: 'Culto da Família (Manhã)',
                periodo: 'domingo_manha',
                is_santa_ceia: isSantaCeia,
                aprovada: false,
                mes,
                ano,
                timestamp_criacao_escala: null,
                responsavel_geral_1_id: null,
                responsavel_geral_2_id: null
            });

            // Noite - 18:00
            const dataNoite = data.hour(18).minute(0).second(0);
            cultosDoMes.push({
                data_culto: dataNoite.toISOString(),
                nome_culto: 'Culto da Família (Noite)',
                periodo: 'domingo_noite',
                is_santa_ceia: isSantaCeia,
                aprovada: false,
                mes,
                ano,
                timestamp_criacao_escala: null,
                responsavel_geral_1_id: null,
                responsavel_geral_2_id: null
            });
        }
    }

    return cultosDoMes as Culto[];
}

/**
 * Salva os cultos no banco de dados (com upsert)
 */
export async function salvarCultos(cultos: Omit<Culto, 'id'>[]): Promise<{ criados: number; existentes: number }> {
    let criados = 0;
    let existentes = 0;

    for (const culto of cultos) {
        const { data, error } = await supabase
            .from('datas_cultos')
            .upsert(culto, {
                onConflict: 'data_culto,periodo',
                ignoreDuplicates: true
            })
            .select();

        if (error) {
            console.error(`Erro ao salvar culto: ${error.message}`);
        } else if (data && data.length > 0) {
            criados++;
        } else {
            existentes++;
        }
    }

    return { criados, existentes };
}

/**
 * Busca cultos de um mês
 */
export async function buscarCultosDoMes(mes: number, ano: number): Promise<Culto[]> {
    const { data, error } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('mes', mes)
        .eq('ano', ano)
        .order('data_culto', { ascending: true });

    if (error) {
        console.error(`Erro ao buscar cultos: ${error.message}`);
        return [];
    }

    return data || [];
}

/**
 * Busca um culto por ID
 */
export async function buscarCultoPorId(cultoId: string): Promise<Culto | null> {
    const { data, error } = await supabase
        .from('datas_cultos')
        .select('*')
        .eq('id', cultoId)
        .single();

    if (error) {
        console.error(`Erro ao buscar culto: ${error.message}`);
        return null;
    }

    return data;
}

/**
 * Atualiza timestamp de criação da escala
 */
export async function marcarEscalaCriada(cultoId: string): Promise<void> {
    await supabase
        .from('datas_cultos')
        .update({ timestamp_criacao_escala: new Date().toISOString() })
        .eq('id', cultoId);
}
