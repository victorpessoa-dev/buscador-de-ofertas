import { expect, test } from '@playwright/test';

test('renders the offer search experience', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Buscador de Ofertas' })).toBeVisible();
  await expect(page.getByPlaceholder('Digite o nome do produto ou cole um link')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buscar Ofertas' })).toBeVisible();
  await expect(page.getByLabel('Marketplace')).toHaveValue('ambos');
  await expect(page.getByLabel('Desconto')).toHaveValue('0');
  await expect(page.getByLabel('Produto ou link')).toHaveCount(1);
});

test('searches offers with filters and renders affiliate results', async ({ page }) => {
  let requestBody: Record<string, unknown> | null = null;

  await page.route('**/api/offers', async (route) => {
    requestBody = route.request().postDataJSON();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        timestamp: Date.now(),
        query: 'Tinta Epson T544',
        source: 'nome',
        cached: false,
        totals: {
          collected: 1,
          filtered: 1,
          returned: 1,
        },
        produtos: [
          {
            titulo: 'Tinta Epson T544 Original',
            preco: 89.9,
            desconto: 20,
            avaliacao: 4.8,
            vendas: 1200,
            freteGratis: true,
            link: 'https://www.mercadolivre.com.br/tinta-epson-t544/p/MLB123',
            linkOriginal: 'https://www.mercadolivre.com.br/tinta-epson-t544/p/MLB123',
            imagem: '',
            marketplace: 'mercadolivre',
            marketplaceLabel: 'Mercado Livre',
            score: 140,
          },
        ],
      }),
    });
  });

  let affiliateBody: Record<string, unknown> | null = null;
  await page.route('**/api/affiliate', async (route) => {
    affiliateBody = route.request().postDataJSON();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        redirectUrl: 'http://localhost:3000/go?u=https%3A%2F%2Fexample.com%2Faff',
      }),
    });
  });

  await page.goto('/');
  await page.getByPlaceholder('Digite o nome do produto ou cole um link').fill('Tinta Epson T544');
  await page.getByLabel('Marketplace').selectOption('mercadolivre');
  await page.getByLabel('Desconto').selectOption('20');
  await page.getByLabel('Preco maximo').fill('150');
  await page.getByLabel('Avaliacao').selectOption('4.5');
  await page.getByLabel('Frete gratis').check();
  await Promise.all([
    page.waitForResponse('**/api/offers'),
    page.getByRole('button', { name: 'Buscar Ofertas' }).click(),
  ]);

  await expect(page.getByRole('heading', { name: '1 oferta encontrada' })).toBeVisible();
  const offerCard = page.locator('[data-slot="card"]').filter({
    hasText: 'Tinta Epson T544 Original',
  });
  await expect(offerCard).toBeVisible();
  await expect(offerCard.getByText('Mercado Livre')).toBeVisible();
  await expect(offerCard.getByText('R$ 89,90')).toBeVisible();
  await expect(offerCard.getByRole('button', { name: /Comprar Agora/ })).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await offerCard.getByRole('button', { name: /Comprar Agora/ }).click({ force: true });
  const popup = await popupPromise;
  await popup.waitForFunction(() => window.location.href.includes('/go?u='));

  expect(requestBody).toMatchObject({
    query: 'Tinta Epson T544',
    marketplace: 'mercadolivre',
    minDiscount: 20,
    maxPrice: 150,
    minRating: 4.5,
    freeShipping: true,
  });
  expect(affiliateBody).toMatchObject({
    url: 'https://www.mercadolivre.com.br/tinta-epson-t544/p/MLB123',
  });
});
