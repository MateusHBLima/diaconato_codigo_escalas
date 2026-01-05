/**
 * Script para analisar a estrutura do banco de dados Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

// Credenciais do Supabase
const SUPABASE_URL = 'https://xawbaaevhmxkmanmfjpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2JhYWV2aG14a21hbm1manBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjE0NDQsImV4cCI6MjA3NTkzNzQ0NH0.zDpiYN2qwOREe2UVOtuaYnG3zVOCk7sd4OJag-yWBpw';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let output = '';

function log(text) {
    console.log(text);
    output += text + '\n';
}

async function analyzeDatabase() {
    log('🔍 Conectando ao Supabase...\n');
    log('='.repeat(60));

    const results = {};

    // Lista de tabelas conhecidas do workflow
    const tables = [
        'membros',
        'funcoes',
        'datas_cultos',
        'escalas_alocacoes'
    ];

    for (const table of tables) {
        log(`\n📋 TABELA: ${table.toUpperCase()}`);
        log('-'.repeat(60));

        try {
            // Buscar dados da tabela
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .limit(3);

            if (error) {
                log(`❌ Erro ao acessar tabela: ${error.message}`);
                continue;
            }

            if (!data || data.length === 0) {
                log('📭 Tabela vazia ou não existe');
                continue;
            }

            // Mostrar colunas
            const columns = Object.keys(data[0]);
            log(`\n📊 Colunas (${columns.length}):`);
            columns.forEach(col => {
                const sampleValue = data[0][col];
                const type = Array.isArray(sampleValue) ? 'array' : typeof sampleValue;
                const preview = JSON.stringify(sampleValue)?.substring(0, 40) || 'null';
                log(`   - ${col}: ${type} (ex: ${preview})`);
            });

            // Contar total de registros
            const { count } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });

            log(`\n📈 Total de registros: ${count || 'N/A'}`);

            // Salvar dados para análise
            results[table] = {
                columns,
                count,
                samples: data
            };

        } catch (err) {
            log(`❌ Erro: ${err.message}`);
        }
    }

    log('\n' + '='.repeat(60));
    log('✅ Análise concluída!');

    // Salvar resultado completo em JSON
    writeFileSync('database-analysis.json', JSON.stringify(results, null, 2));
    log('\n📁 Resultado salvo em database-analysis.json');

    // Salvar log em texto
    writeFileSync('database-analysis.txt', output);
}

analyzeDatabase();
