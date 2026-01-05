# Integração Frontend e Automação

## 1. Geração Automática Mensal
O sistema agora possui um agendador interno (**Cron Job**) configurado para rodar todo **dia 01 de cada mês às 00:00**.

### O que ele faz:
1. Define o mês atual/próximo.
2. Gera as datas dos cultos no banco (se não existirem).
3. Gera as escalas automaticamente para todos os cultos do mês.

---

## 2. Integração com o Botão "Gerar Escala"

Para substituir o n8n, o frontend deve apontar para um dos endpoints abaixo, dependendo de qual dado ele envia:

### Opção A: Envio por Data (Compatível com formato anterior)
Use este se o frontend envia a data do culto.
- **Endpoint:** `POST http://localhost:3000/webhook/escala_solicitada`
- **Body:**
  ```json
  {
    "data_culto": "2026-01-08T19:30:00" 
  }
  ```
  *(Aceita formatos de data ISO ou parciais, desde que encontre no banco)*

### Opção B: Envio por ID (Recomendado)
Use este se o frontend já tem o ID do culto.
- **Endpoint:** `POST http://localhost:3000/api/gerar-escala`
- **Body:**
  ```json
  {
    "culto_id": "uuid-do-culto-aqui"
  }
  ```

---

## 3. Comandos Manuais (Teste)

Se precisar forçar a geração do mês manualmente sem esperar o dia 01:
- **Endpoint:** `POST http://localhost:3000/api/trigger-rotina-mensal`
- **Body:** (Opcional, se vazio gera para o próximo mês)
  ```json
  {
    "mes": 1,
    "ano": 2026
  }
  ```
