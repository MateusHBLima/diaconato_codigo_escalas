import { supabase } from '../src/config/supabase';
import { podeExecutarFuncao } from '../src/services/rules/StarSystem';
import fs from 'fs';

async function main() {
    // Usar ilike para ser case insensitive e tolerante
    const nomeBusca = 'Adilson Miranda Neto';

    console.log(`Buscando membro contendo: "${nomeBusca}"...`);

    const { data: membros, error: erroMembro } = await supabase
        .from('membros')
        .select('*')
        .ilike('nome_completo', `%${nomeBusca}%`);

    if (erroMembro) {
        console.error('Erro ao buscar membro:', erroMembro);
        process.exit(1);
    }

    if (!membros || membros.length === 0) {
        console.error('Membro não encontrado.');
        process.exit(1);
    }

    const membro = membros[0];
    console.log(`\n👤 Membro encontrado: ${membro.nome_completo} `);
    console.log(`   Sexo: ${membro.sexo} `);
    console.log(`   Nível Experiência(Estrelas): ${membro.nivel_experiencia} `);
    console.log(`   Aptidões: ${JSON.stringify(membro.aptidoes)} `);

    console.log('\n🔍 Analisando funções permitidas...');

    const { data: funcoes, error: erroFuncoes } = await supabase
        .from('funcoes')
        .select('*')
        .eq('ativo', true)
        .order('nome');

    if (erroFuncoes) {
        console.error('Erro ao buscar funções:', erroFuncoes);
        process.exit(1);
    }

    const STAR_MAX_LIMITS: Record<string, number> = {
        'Hall': 2,
        'Apoio': 2,
    };

    const permitidas: string[] = [];

    funcoes?.forEach(funcao => {
        // Logica adicional para Aptidões Especiais (cópia simplificada de escala.ts)
        const nomeFuncaoLower = funcao.nome.toLowerCase();
        let pode = podeExecutarFuncao(membro, funcao.nome, funcao.especificidade_sexo);

        // REPLICAR LOGICA DE TETO (MAX_STARS) AQUI PARA O SCRIPT
        // Copiada de StarSystem.ts
        const estrelas = membro.nivel_experiencia || 1;
        for (const [chave, maxEstrelas] of Object.entries(STAR_MAX_LIMITS)) {
            if (funcao.nome.includes(chave)) {
                if (chave === 'Apoio' && nomeFuncaoLower.includes('responsável')) {
                    continue;
                }
                if (estrelas > maxEstrelas) {
                    pode = false;
                }
            }
        }

        // Checagem extra de aptidões (Copiado de escala.ts logic)
        // 1. Prioridade Mesa
        if (nomeFuncaoLower.includes('mesa')) {
            const temPrioridadeMesa = membro.aptidoes?.includes('Prioridade Mesa');
            if (!temPrioridadeMesa) {
                // Se NÃO tem prioridade mesa, segue a regra normal de estrelas (podeExecutarFuncao já retorna false se for <4 estrelas)
                // Mas a regra diz: "Função Mesa EXIGE ter a aptidão".
                // Então, se não tem a aptidão, NÃO PODE, mesmo que tenha estrelas.
                // Mas espere, podeExecutarFuncao pede 4 estrelas para Mesa.
                // A regra no escala.ts diz: "Se tem a aptidão, IGNORA estrelas".
                // Mas se NÃO tem a aptidão? O código diz "return false" -> Exige aptidão.
                // Vou replicar essa lógica.
                pode = false;
            } else {
                // Tem prioridade mesa -> Ignora estrelas -> Pode
                pode = true;
            }
        }

        // 2. Necessidade Sentado
        if (membro.aptidoes?.includes('NECESSIDADE SENTADO')) {
            const ehCorrente = nomeFuncaoLower.includes('corrente');
            const setorPaiLower = funcao.setor_pai?.toLowerCase() || '';
            const ehSetorAzulOuLaranja = setorPaiLower.includes('azul') || setorPaiLower.includes('laranja');

            if (ehCorrente && ehSetorAzulOuLaranja) {
                pode = true;
            } else {
                pode = false;
            }
        }

        if (pode) {
            permitidas.push(`${funcao.nome} (${funcao.setor_pai})`);
        }
    });

    const output = [
        `\n👤 Membro encontrado: ${membro.nome_completo} `,
        `   Sexo: ${membro.sexo} `,
        `   Nível Experiência(Estrelas): ${membro.nivel_experiencia} `,
        `   Aptidões: ${JSON.stringify(membro.aptidoes)} `,
        '',
        `\n✅ Posições PERMITIDAS(${permitidas.length}): `,
        ...permitidas.map(p => ` - ${p} `)
    ].join('\n');

    console.log(output);
    fs.writeFileSync('analise-adilson.txt', output, 'utf8');
}

main();
