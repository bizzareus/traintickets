import { test, expect } from '@playwright/test';

test.describe('Seat Status & Coach Map', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/seat-status');
    // Wait for hydration and basic UI to be ready
    await expect(page.getByText('Train number / name')).toBeVisible();
  });

  test('Test 1: Successful Map Generation', async ({ page }) => {
    // Search and select train
    const trainInput = page.getByRole('combobox', { name: /train/i }).first();
    await trainInput.fill('12958');
    
    // Wait for autocomplete to appear and click it
    const suggestion = page.getByRole('listitem').filter({ hasText: 'SWRAN J RAJDHANI' });
    await expect(suggestion).toBeVisible({ timeout: 15000 });
    await suggestion.click();

    // The Date picker might default to today, let's just make sure it's filled or fill it
    // JourneyDatePicker sets a default date (usually today or tomorrow). We don't strictly need to type it if it's auto-filled.
    // If it's not auto-filled, we'd do it here. The component sets default date to tomorrow.

    // Select Boarding station
    const boardingInput = page.getByRole('combobox', { name: /boarding/i });
    await boardingInput.fill('NDLS');
    const ndlsSuggestion = page.getByRole('listitem').filter({ hasText: 'NEW DELHI' });
    await expect(ndlsSuggestion).toBeVisible({ timeout: 15000 });
    await ndlsSuggestion.click();

    // Select the first available coach instead of hardcoded 'B1'
    await page.locator('select').selectOption({ index: 1 });

    // Click Check berths
    await page.locator('#seatStatusCheckBtn').click();

    // Wait for the new list-based UI to load
    await expect(page.getByRole('button', { name: /Close results/i })).toBeVisible({ timeout: 15000 });
  });

  test('Test 2: Validation of Empty/Invalid Inputs', async ({ page }) => {
    // Try to click Check berths immediately
    const checkBtn = page.locator('#seatStatusCheckBtn');
    
    // The button is disabled until all required fields are filled.
    await expect(checkBtn).toBeDisabled();
    
    // Fill only train
    const trainInput = page.getByRole('combobox', { name: /train/i }).first();
    await trainInput.fill('12958');
    await page.getByRole('listitem').filter({ hasText: 'SWRAN J RAJDHANI' }).click();
    
    // Still disabled because boarding station and coach aren't filled
    await expect(checkBtn).toBeDisabled();
  });

  test('Test 3: Train Not Found / Autocomplete Fails', async ({ page }) => {
    const trainInput = page.getByRole('combobox', { name: /train/i }).first();
    await trainInput.fill('99999');
    
    // Suggestion dropdown should not contain any matches, or might show error.
    // In our component, if no results, it just shows nothing or empty list.
    // We just verify that "99999 - " does not appear as a suggestion
    await expect(page.getByRole('listitem').filter({ hasText: '99999' })).not.toBeVisible();
    
    // Check btn should be disabled since we didn't pick a valid train
    await expect(page.locator('#seatStatusCheckBtn')).toBeDisabled();
  });

  test('Test 4: API Timeout / Flaky Network Handling', async ({ page }) => {
    // Intercept API call to simulate failure
    await page.route('**/api/irctc/train-composition', route => route.abort('failed'));
    await page.route('**/api/irctc/vacantBerth', route => route.abort('failed'));
    await page.route('**/api/irctc/coachComposition', route => route.abort('failed'));

    // Fill form
    const trainInput = page.getByRole('combobox', { name: /train/i }).first();
    await trainInput.fill('12958');
    await page.getByRole('listitem').filter({ hasText: 'SWRAN J RAJDHANI' }).click();

    const boardingInput = page.getByRole('combobox', { name: /boarding/i });
    await boardingInput.fill('NDLS');
    await page.getByRole('listitem').filter({ hasText: 'NEW DELHI' }).click();

    // Since the API request for coaches failed, the select dropdown won't even render.
    // Instead, an error message about loading coaches should be visible.
    await expect(page.getByText(/error|failed/i).first()).toBeVisible({ timeout: 15000 });
  });
});
