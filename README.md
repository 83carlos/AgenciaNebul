# Story Planner DentalMed

Sistema web para gerenciar o calendario de stories das quatro unidades DentalMed:

- DentalMed Joao Pessoa
- DentalMed Campina Grande
- DentalMed Recife
- DentalMed Guarabira

O projeto evoluiu de um checklist local para um painel multiunidades com login, permissoes, tarefas por unidade, observacoes, logs, relatorios mensais e sincronizacao por CSV publicado do Google Sheets.

## Funcionalidades

- Login com Supabase Auth.
- Perfis `admin` e `responsible`.
- Responsavel visualiza apenas tarefas da propria unidade.
- Admin visualiza todas as unidades, relatorios e sincronizacao.
- Checklist com status `pending`, `in_progress`, `completed` e `not_done`.
- Logs com usuario, unidade, tarefa, status, observacao e data.
- Relatorio mensal com total previsto, total concluido, percentual e ranking.
- Exportacao simples em CSV.
- Sincronizacao manual por CSV publicado do Google Sheets.
- Layout responsivo com foco no celular.

## Estrutura

```text
/
├── dentalmed_app/
│   ├── assets/logo.png
│   ├── app.js
│   ├── config.example.js
│   ├── index.html
│   ├── manifest.json
│   ├── style.css
│   └── sw.js
├── supabase/schema.sql
├── .env.example
├── .gitignore
├── netlify.toml
└── README.md
```

## Configurar Supabase

1. Crie um projeto no Supabase.
2. No SQL Editor, execute o arquivo `supabase/schema.sql`.
3. Em Authentication, crie os usuarios da equipe.
4. Para cada usuario criado em `auth.users`, insira um perfil na tabela `public.users`.

Exemplo de usuario admin:

```sql
insert into public.users (id, full_name, email, role)
values ('UUID_DO_AUTH_USER', 'Gestao DentalMed', 'admin@dentalmed.com.br', 'admin');
```

Exemplo de responsavel de unidade:

```sql
insert into public.users (id, full_name, email, role, unit_id)
select
  'UUID_DO_AUTH_USER',
  'Responsavel Recife',
  'recife@dentalmed.com.br',
  'responsible',
  id
from public.units
where city = 'Recife';
```

## Configurar o app

Edite `dentalmed_app/config.js` com as credenciais do seu projeto Supabase. `config.example.js` fica como referencia:

```js
window.DENTALMED_CONFIG = {
  SUPABASE_URL: 'https://seu-projeto.supabase.co',
  SUPABASE_ANON_KEY: 'sua-chave-anon-publica',
  GOOGLE_SHEETS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/SEU_ID/pub?output=csv'
};
```

A chave `anon` do Supabase e publica, mas deve continuar vinculada a RLS bem configurado. Em projetos com build, tambem e possivel gerar esse arquivo a partir das variaveis de `.env.example`.

## Planilha CSV

Publique a planilha do Google Sheets como CSV e use colunas com estes nomes:

```text
unidade,data,horario,turno,titulo,descricao,tipo de conteudo,cta,enquete,link de referencia,responsavel,status inicial
```

Formatos aceitos:

- `data`: `YYYY-MM-DD` ou `DD/MM/YYYY`
- `status inicial`: `pending`, `in_progress`, `completed`, `not_done` ou equivalentes em portugues
- `unidade`: nome ou cidade da unidade

No app, entre como admin, abra **Sincronizar**, informe a URL CSV e clique em **Sincronizar agora**.

Um modelo pronto esta em `docs/google-sheets-template.csv`. Para usar:

1. Importe esse CSV no Google Sheets.
2. Ajuste as linhas de conteudo.
3. Acesse **Arquivo > Compartilhar > Publicar na Web**.
4. Escolha a aba da planilha e o formato **CSV**.
5. Copie a URL publicada e use no campo `GOOGLE_SHEETS_CSV_URL` em `dentalmed_app/config.js`.

## Deploy no Netlify

O arquivo `netlify.toml` ja publica a pasta `dentalmed_app`.

1. Crie um site no Netlify conectado ao GitHub.
2. Use este repositorio como origem.
3. O publish directory sera lido de `netlify.toml`: `dentalmed_app`.
4. Antes do deploy de producao, preencha `dentalmed_app/config.js` com as configuracoes do projeto ou use uma etapa de build propria para gerar esse arquivo.

## Desenvolvimento local

Como o app e estatico, basta servir a pasta:

```bash
cd dentalmed_app
python -m http.server 4173
```

Abra `http://127.0.0.1:4173/`.

Sem `config.js`, o app abre em modo demonstracao para revisar a interface, mas os dados reais dependem do Supabase.
