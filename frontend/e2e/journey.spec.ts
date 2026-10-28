import { expect, test, type Page } from '@playwright/test';

const FRONTEND_URL = `http://127.0.0.1:${process.env.E2E_FRONTEND_PORT ?? '4180'}`;

async function signIn(page: Page, demo: 'learner' | 'teacher' | 'admin', landing: RegExp) {
  await page.goto(`/login?demo=${demo}`);
  await page.locator('form.auth-card').getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(landing);
}

async function answerQuiz(page: Page) {
  for (let step = 0; step < 12; step += 1) {
    const radio = page.getByRole('radio').first();
    if (await radio.count()) {
      await radio.check();
    } else {
      const textarea = page.locator('.quiz-card textarea');
      if (await textarea.count()) await textarea.fill('Equal parts of a whole');
    }

    const submit = page.getByRole('button', { name: 'Submit quiz' });
    if (await submit.isVisible()) {
      await submit.click();
      return;
    }
    await page.getByRole('button', { name: 'Next' }).click();
  }
  throw new Error('Quiz never reached the submit button');
}

test('public pages, install assets and language switching work', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: /Learning that feels clear, kind and possible/ }),
  ).toBeVisible();

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');

  const desktopCard = page.locator('.desktop-card');
  await expect(desktopCard.getByRole('heading', { name: 'Guruji Box for Windows' })).toBeVisible();
  await expect(desktopCard.getByRole('link', { name: 'Download installer' })).toHaveAttribute(
    'href',
    /github\.com\/Anish17-Shanu\/guruji-box\/releases/,
  );
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  const manifestBody = await manifest.json();
  expect(manifestBody.icons.length).toBeGreaterThanOrEqual(3);
  expect((await page.request.get('/icons/icon-192.png')).ok()).toBeTruthy();
  expect((await page.request.get('/icons/icon-maskable-512.png')).ok()).toBeTruthy();
  expect((await page.request.get('/sw.js')).ok()).toBeTruthy();

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Learn' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lessons' })).toBeVisible();
  await expect(page.locator('.lesson-card')).toHaveCount(4);

  await page.locator('.lesson-card h2 a').first().click();
  await expect(page.locator('.lesson-body section').first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'In this lesson' })).toBeVisible();

  await page.getByRole('button', { name: 'हिन्दी में बदलें' }).click();
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'सीखें' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('hi');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Learn' })).toBeVisible();
});

test('learner studies, asks Guruji, takes a quiz and reviews progress', async ({ page }) => {
  await signIn(page, 'learner', /\/learn$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lessons' })).toBeVisible();

  await page.getByRole('link', { name: 'Fractions', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Fractions' })).toBeVisible();

  await page.locator('#tutor-question').fill('What does the denominator tell us?');
  await page.locator('.tutor-form').getByRole('button', { name: 'Ask' }).click();
  await expect(page.locator('.bubble-assistant').last()).toContainText(/denominator/i);
  await expect(page.locator('.bubble-assistant').last().locator('.bubble-sources')).toBeVisible();

  await page.getByRole('link', { name: 'Take the quiz' }).click();
  await expect(page.getByText('Question 1 of 5')).toBeVisible();
  await answerQuiz(page);

  await expect(page.getByRole('heading', { level: 1, name: 'Quiz complete' })).toBeVisible();
  await expect(page.locator('.score-ring')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Answer review' })).toBeVisible();

  await page.locator('.hero-actions').getByRole('link', { name: 'My progress' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My progress' })).toBeVisible();
  await expect(page.getByText('Quiz attempts')).toBeVisible();
  await expect(page.locator('.attempt-list li')).not.toHaveCount(0);
  await expect(page.locator('.class-list').getByText('Demo Class 6')).toBeVisible();

  await page.locator('.attempt-list').getByRole('link', { name: 'Review answers' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Fractions' })).toBeVisible();
  await expect(page.locator('.review-item')).toHaveCount(5);
  await expect(page.getByText('Your answer').first()).toBeVisible();
});

test('teacher inspects a class and approves a printable worksheet', async ({ page }) => {
  await signIn(page, 'teacher', /\/teach$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Teaching dashboard' })).toBeVisible();

  await page.getByRole('link', { name: 'Demo Class 6' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Demo Class 6' })).toBeVisible();
  await expect(page.locator('.join-code-big')).toHaveText('DEMO01');
  await expect(page.getByRole('cell', { name: /Demo Learner/ }).first()).toBeVisible();

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Worksheets' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Worksheets' })).toBeVisible();

  await page.getByRole('button', { name: 'Generate a worksheet' }).first().click();
  await page.getByLabel('Base on a lesson').selectOption({ label: 'Fractions — Fractions (Mathematics)' });
  await page.getByLabel('Questions', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Generate worksheet', exact: true }).click();

  await expect(page).toHaveURL(/\/worksheets\/\d+$/);
  await expect(page.locator('.print-sheet')).toBeVisible();
  await expect(page.locator('.answer-key')).toHaveCount(4);

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Worksheet approved. It is ready to print.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move to draft' })).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.answer-key').first()).toBeHidden();
  await expect(page.locator('.worksheet-toolbar')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.answer-key').first()).toBeVisible();
});

test('administrator can search users and inspect the audit trail', async ({ page }) => {
  await signIn(page, 'admin', /\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible();

  await page.getByPlaceholder('Search name or email').fill('learner@guruji.demo');
  await page.getByRole('button', { name: 'Search' }).click();

  const learnerRow = page.getByRole('row', { name: /Demo Learner/ });
  await expect(learnerRow).toBeVisible();
  await expect(learnerRow.getByRole('combobox', { name: 'Role: Demo Learner' })).toHaveValue('LEARNER');

  await learnerRow.getByRole('button', { name: 'Reset password' }).click();
  await page.getByRole('dialog').getByLabel('New password').fill('ResetLearner123!');
  await page.getByRole('dialog').getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText(/Password reset\. All their sessions were signed out\./)).toBeVisible();

  await page.getByRole('tab', { name: 'Audit trail' }).click();
  await expect(page.getByRole('tab', { name: 'Audit trail' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('main')).toContainText(/Sign in|login|auth|No audit events yet/);
});

test('the installed shell opens offline after a first visit', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: FRONTEND_URL });
  const page = await context.newPage();

  await page.goto('/learn');
  await expect(page.getByRole('heading', { level: 1, name: 'Lessons' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.goto('/learn');
  await expect(page.getByRole('heading', { level: 1, name: 'Lessons' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

  await context.setOffline(false);
  await context.close();
});
