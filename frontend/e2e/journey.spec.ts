import {test,expect} from 'playwright/test';
test('home links to learning',async({page})=>{await page.goto('/');await expect(page.getByText('Start learning')).toBeVisible();await page.getByText('Start learning').click();await expect(page).toHaveURL(/learn/)})
