# Gerador de Links de Afiliado

Aplicação em Next.js para gerar links de afiliado da Shopee e do Mercado Livre e
manter um histórico local no navegador.

## Requisitos

- Node.js 20 ou mais recente
- npm

## Instalação

Na pasta do projeto, instale as dependências:

```bash
npm install
```

## Configuração

Crie um arquivo chamado `.env.local` na raiz do projeto.

> O nome correto é `.env.local`. Não use `.env.loacl`.

### Configuração mínima

Para gerar links adicionando os parâmetros de afiliado à URL, configure:

```env
SHOPEE_AFFILIATE_ID=seu_id_da_shopee
MELI_AFFILIATE_ID=seu_id_do_mercado_livre
REDIRECT_SECRET=uma_chave_longa_e_aleatoria
```

Substitua os valores de exemplo pelos identificadores fornecidos pelas
plataformas.

Não é necessário usar o prefixo `NEXT_PUBLIC_`. Os IDs são processados no
servidor e não precisam ser expostos ao navegador.

`REDIRECT_SECRET` assina os links intermediários e impede que terceiros alterem
o destino. Use uma sequência longa e privada. Para gerar uma com Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Em produção, configure também o endereço público da aplicação:

```env
APP_URL=https://seu-dominio.com
```

### APIs opcionais

Caso você possua endpoints próprios ou oficiais para criar links de afiliado,
adicione também:

```env
# Shopee
SHOPEE_API_URL=https://endereco-da-api
SHOPEE_APP_ID=seu_app_id
SHOPEE_SECRET=seu_secret

# Mercado Livre
MELI_API_URL=https://endereco-da-api
MELI_ACCESS_TOKEN=seu_access_token
```

Essas variáveis são opcionais. Quando uma API não estiver configurada ou não
responder corretamente, o sistema usa os IDs da configuração mínima para
adicionar os parâmetros à URL.

O projeto espera que as APIs retornem um destes formatos:

```json
{
  "affiliate_url": "https://link-gerado"
}
```

Para a Shopee, também é aceito o campo `short_link`. Para o Mercado Livre,
também é aceito `tracking_url`.

## Executar localmente

Depois de criar ou alterar o `.env.local`, reinicie o servidor:

```bash
npm run dev
```

Acesse:

```text
http://localhost:3000
```

## Verificações

```bash
npm run typecheck
npm run build
```

## Segurança

- Nunca envie o arquivo `.env.local` para o Git.
- Não use `NEXT_PUBLIC_` em tokens, secrets ou chaves privadas.
- Configure as mesmas variáveis de ambiente na plataforma de hospedagem.
- O histórico dos links fica salvo somente no `localStorage` do navegador.

## Fluxo da conversão

1. O navegador envia a URL para `/api/affiliate`.
2. O servidor valida se o domínio pertence à Shopee ou ao Mercado Livre.
3. Links curtos são resolvidos com limite de redirecionamentos.
4. A API configurada é utilizada, quando disponível.
5. Se a API não estiver disponível, os parâmetros do ID de afiliado são
   adicionados diretamente à URL.
6. O sistema cria um link assinado em `/go?token=...`, sem salvar o destino no
   servidor.
7. O link assinado exibe uma tela de transição e redireciona o visitante para a
   URL de afiliado.

## Links gerados

O link principal exibido e copiado pelo gerador usa o formato:

```text
https://seu-dominio.com/go?token=codigo-assinado
```

O destino fica dentro do token assinado e expira depois de 30 dias. O app não
salva links em banco, KV, arquivo ou qualquer outro armazenamento no servidor.
Somente o histórico local do navegador é salvo em `localStorage`.

## Prévia do produto

O servidor tenta ler metadados públicos da página, como Open Graph e JSON-LD,
para exibir título, foto, descrição e preço. Algumas páginas bloqueiam robôs ou
carregam essas informações apenas com JavaScript; nesses casos, o link continua
funcionando, mas a prévia pode aparecer sem alguns dados.

Para páginas da Shopee que não expõem Open Graph ou JSON-LD, o projeto usa um
preview renderizado como fallback. A foto real tem prioridade; quando ela não é
disponibilizada, uma captura da página é usada no card.

O fallback pode ser desativado ou substituído:

```env
PREVIEW_FALLBACK=false
PREVIEW_API_URL=https://api.microlink.io/
```
