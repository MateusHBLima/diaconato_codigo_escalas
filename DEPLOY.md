# Guia de Deploy (GitHub + Hospedagem)

Para que o **Cron Job (Agendador)** funcione, seu código precisa rodar continuamente.

## 1. Subir para o GitHub (Obrigatório)

1. Inicialize e suba o código:
   ```bash
   git init
   git add .
   git commit -m "Deploy inicial"
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
   git branch -M main
   git push -u origin main
   ```

---

## 2. Escolha onde Hospedar

### Opção A: Vercel (Gratuito e Simples)
Configurei o projeto para funcionar na Vercel!
O arquivo `vercel.json` já está configurado para usar o "Vercel Cron" que chama sua API todo dia 1º.

1. Crie conta em [vercel.com](https://vercel.com).
2. "Add New..." -> "Project" -> Importe seu repositório GitHub.
3. Em **Environment Variables**, adicione:
   - `SUPABASE_URL`: (Valor do .env)
   - `SUPABASE_SERVICE_ROLE_KEY`: (Valor do .env)
4. Deploy!

*Nota: O agendamento (Cron) funciona automaticamente pela configuração do `vercel.json`.*

### Opção B: Railway (Mais robusto)
Se preferir um servidor que roda 24h sem "dormir".
1. [railway.app](https://railway.app) -> "New Project" -> GitHub.
2. Adicione as variáveis (`SUPABASE_URL`, etc).
3. Adicione variável `TZ` = `America/Sao_Paulo`.
4. O Railway detecta o start script e roda o `node-cron` interno.

### Opção C: Render (Alternativa)
1. [render.com](https://render.com) -> New Web Service.
2. Build Command: `npm install && npm run build`
3. Start Command: `npm start`
4. Adicione variáveis de ambiente.

---

## Endpoint para o Frontend
Depois do deploy, a URL da sua API vai mudar (ex: `https://seu-projeto.vercel.app`).
Atualize o frontend para apontar para:
- `https://seu-projeto.vercel.app/api/gerar-escala`
ou
- `https://seu-projeto.vercel.app/webhook/escala_solicitada`
