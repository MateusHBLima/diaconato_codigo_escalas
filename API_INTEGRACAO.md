# Integração Frontend e Automação

## 1. Geração Automática Mensal
O sistema possui agendamento automático configurado via **Vercel Cron**.
Ele rodará todo dia **1º de cada mês às 00:00** automaticamente.

---

## 2. Integração com o Botão "Gerar Escala"

Configure seu frontend para chamar a nova API na Vercel:

### URL Base:
`https://diaconatocodigoescalas.vercel.app`

### Opção A: Envio por Data (Compatível com formato anterior/n8n)
Use este se o frontend envia a data do culto.
- **Endpoint:** `POST https://diaconatocodigoescalas.vercel.app/webhook/escala_solicitada`
- **Body:**
  ```json
  {
    "data_culto": "2026-01-08T19:30:00" 
  }
  ```

### Opção B: Envio por ID (Novo padrão)
Use este se o frontend já tem o ID do culto.
- **Endpoint:** `POST https://diaconatocodigoescalas.vercel.app/api/gerar-escala`
- **Body:**
  ```json
  {
    "culto_id": "uuid-do-culto-aqui"
  }
  ```

---

## 3. Teste Manual (Forçar mês)

Para forçar a geração de um mês inteiro manualmente:
- **Endpoint:** `POST https://diaconatocodigoescalas.vercel.app/api/trigger-rotina-mensal`
- **Body:**
  ```json
  {
    "mes": 2,
    "ano": 2026
  }
  ```

---

## 4. Verificar Status (Health Check)
Para saber se a API está no ar:
- **GET** `https://diaconatocodigoescalas.vercel.app/health`
