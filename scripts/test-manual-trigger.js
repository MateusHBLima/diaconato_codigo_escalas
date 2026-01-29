
const fetch = require('node-fetch');

async function trigger() {
    console.log('Disparando geração mensal (Simulando Frontend)...');

    // Mês/Ano para teste (ex: Março/2026 para não afetar Janeiro/Fevereiro atuais)
    const payload = {
        mes: 3,
        ano: 2026
    };

    try {
        const response = await fetch('http://localhost:3000/api/gerar-escala-mes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('Status Code:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));

        if (data.success) {
            console.log('\n✅ Geração Mensal concluída com sucesso!');
        } else {
            console.error('\n❌ Erro na geração:', data.error);
        }

    } catch (err) {
        console.error('Erro na requisição:', err);
    }
}

trigger();
