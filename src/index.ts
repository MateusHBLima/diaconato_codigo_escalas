import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Import config (inicializa Supabase)
import './config/supabase.js';

// Import services
import { gerarCultosDoMes, salvarCultos, buscarCultosDoMes } from './services/cultos.js';
import { gerarEscalaParaCulto, buscarAlocacoesDoCulto } from './services/escala.js';
import { iniciarAgendamento, executarRotinaMensal } from './services/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors({
    origin: '*', // Permite qualquer origem (Lovable, localhost, etc)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Iniciar agendamento
iniciarAgendamento();

// ============================================
// ROTAS
// ============================================

/**
 * Health check
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /api/trigger-rotina-mensal
 * Força a execução da rotina mensal (útil para testes)
 */
app.post('/api/trigger-rotina-mensal', async (req, res) => {
    try {
        const { mes, ano } = req.body;
        console.log(`\n🔔 Disparo manual da rotina mensal: ${mes ? mes + '/' + ano : 'Automático'}`);

        const resultado = await executarRotinaMensal(mes, ano);

        res.json({
            success: resultado.sucesso,
            ...resultado
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/gerar-cultos
 * Gera as datas de culto para um mês
 */
app.post('/api/gerar-cultos', async (req, res) => {
    try {
        const { mes, ano } = req.body;

        if (!mes || !ano) {
            return res.status(400).json({ error: 'mes e ano são obrigatórios' });
        }

        console.log(`\n📅 Gerando cultos para ${mes}/${ano}`);

        const cultos = await gerarCultosDoMes(mes, ano);
        const resultado = await salvarCultos(cultos);

        console.log(`   ✅ Criados: ${resultado.criados}, Existentes: ${resultado.existentes}`);

        res.json({
            success: true,
            mes,
            ano,
            total_cultos: cultos.length,
            ...resultado
        });
    } catch (error: any) {
        console.error('Erro ao gerar cultos:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cultos/:mes/:ano
 * Lista cultos de um mês
 */
app.get('/api/cultos/:mes/:ano', async (req, res) => {
    try {
        const mes = parseInt(req.params.mes);
        const ano = parseInt(req.params.ano);

        const cultos = await buscarCultosDoMes(mes, ano);

        res.json({
            success: true,
            mes,
            ano,
            total: cultos.length,
            cultos
        });
    } catch (error: any) {
        console.error('Erro ao buscar cultos:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/gerar-escala
 * Gera a escala para um culto específico
 */
app.post('/api/gerar-escala', async (req, res) => {
    try {
        const { culto_id } = req.body;

        if (!culto_id) {
            return res.status(400).json({ error: 'culto_id é obrigatório' });
        }

        const resultado = await gerarEscalaParaCulto(culto_id);

        res.json({
            success: true,
            ...resultado
        });
    } catch (error: any) {
        console.error('Erro ao gerar escala:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/gerar-escala-mes
 * Gera escalas para todos os cultos de um mês
 */
app.post('/api/gerar-escala-mes', async (req, res) => {
    try {
        const { mes, ano } = req.body;

        if (!mes || !ano) {
            return res.status(400).json({ error: 'mes e ano são obrigatórios' });
        }

        console.log(`\n🗓️ Gerando escalas para ${mes}/${ano}`);

        // Primeiro, garantir que os cultos existem
        const cultosGerados = await gerarCultosDoMes(mes, ano);
        await salvarCultos(cultosGerados);

        // Buscar cultos do mês
        const cultos = await buscarCultosDoMes(mes, ano);

        const resultados = [];
        let totalAlocacoes = 0;
        let totalPreenchidas = 0;
        let totalVazias = 0;

        for (const culto of cultos) {
            try {
                const resultado = await gerarEscalaParaCulto(culto.id);
                resultados.push(resultado);
                totalAlocacoes += resultado.alocacoes.length;
                totalPreenchidas += resultado.vagas_preenchidas;
                totalVazias += resultado.vagas_vazias;
            } catch (err: any) {
                console.error(`Erro no culto ${culto.id}: ${err.message}`);
                resultados.push({ culto_id: culto.id, error: err.message });
            }
        }

        console.log(`\n📊 RESUMO ${mes}/${ano}`);
        console.log(`   Cultos: ${cultos.length}`);
        console.log(`   Alocações: ${totalAlocacoes}`);
        console.log(`   Preenchidas: ${totalPreenchidas}`);
        console.log(`   Vazias: ${totalVazias}`);

        res.json({
            success: true,
            mes,
            ano,
            total_cultos: cultos.length,
            total_alocacoes: totalAlocacoes,
            vagas_preenchidas: totalPreenchidas,
            vagas_vazias: totalVazias,
            resultados
        });
    } catch (error: any) {
        console.error('Erro ao gerar escalas do mês:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/escala/:culto_id
 * Busca a escala de um culto
 */
app.get('/api/escala/:culto_id', async (req, res) => {
    try {
        const { culto_id } = req.params;

        const alocacoes = await buscarAlocacoesDoCulto(culto_id);

        res.json({
            success: true,
            culto_id,
            total: alocacoes.length,
            alocacoes
        });
    } catch (error: any) {
        console.error('Erro ao buscar escala:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /webhook/escala_solicitada
 * Compatibilidade com o formato do n8n
 */
app.post('/webhook/escala_solicitada', async (req, res) => {
    try {
        const { data_culto } = req.body;

        if (!data_culto) {
            return res.status(400).json({ error: 'data_culto é obrigatório' });
        }

        console.log(`\n🔔 Webhook recebido para ${data_culto}`);

        // Buscar culto pela data
        const { supabase } = await import('./config/supabase.js');
        const { data: cultos } = await supabase
            .from('datas_cultos')
            .select('*')
            .eq('data_culto', data_culto)
            .limit(1);

        if (!cultos || cultos.length === 0) {
            return res.status(404).json({
                status: 'error',
                comentario: 'Culto não encontrado'
            });
        }

        const culto = cultos[0];
        const resultado = await gerarEscalaParaCulto(culto.id);

        res.json({
            status: 'success',
            comentario: 'escala gerada com sucesso',
            ...resultado
        });
    } catch (error: any) {
        console.error('Erro no webhook:', error);
        res.status(500).json({
            status: 'error',
            comentario: error.message
        });
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================

// Se estiver rodando localmente ou em servidor tradicional (Railway/Render)
if (process.env.NODE_ENV !== 'test') { // Pequena proteção para testes unitários
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║        🙏 SISTEMA DE ESCALAS DO DIACONATO 🙏                ║
╠════════════════════════════════════════════════════════════╣
║  Servidor rodando em http://localhost:${PORT}                   ║
║                                                            ║
║  Endpoints:                                                ║
║  - GET  /health                                            ║
║  - POST /api/gerar-cultos                                  ║
║  - GET  /api/cultos/:mes/:ano                              ║
║  - POST /api/gerar-escala                                  ║
║  - POST /api/gerar-escala-mes                              ║
║  - GET  /api/escala/:culto_id                              ║
║  - POST /webhook/escala_solicitada (compatível n8n)        ║
║  - POST /api/trigger-rotina-mensal (Gatilho CronVercel)    ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
}

// Exportar app para Vercel (Serverless)
export default app;
