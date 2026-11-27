import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddRecipeModal } from '../components/AddRecipeModal';
import { parseIngredient } from '../domain/ingredientParser';
import * as photoOcr from '../domain/photoOcr';

describe('AddRecipeModal — multi-page recipe photos & Gemini Vision feedback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('uploads multiple recipe pages and scans all pages together with Gemini 4 Hydrogen when an API key is saved', async () => {
    window.localStorage.setItem('forager.geminiApiKey.v1', JSON.stringify('test-key-123'));

    vi.spyOn(photoOcr, 'preprocessPhotoForOcr').mockImplementation(async (dataUrl) => ({
      displayDataUrl: dataUrl,
      ocrDataUrl: dataUrl,
    }));

    const visionSpy = vi.spyOn(photoOcr, 'extractRecipeWithGeminiVision').mockResolvedValue({
      id: 'rec_multi',
      title: 'Two-Page Apple Galette',
      servings: 6,
      prepMinutes: 50,
      ingredients: [parseIngredient('4 honeycrisp apples')],
      steps: ['Roll dough from page 1.', 'Arrange apples from page 2 and bake.'],
      notes: 'Serve with vanilla ice cream.',
      sourceType: 'photo',
      createdAt: '2026-11-26T00:00:00Z',
      updatedAt: '2026-11-26T00:00:00Z',
    });

    const user = userEvent.setup();
    render(<AddRecipeModal onClose={vi.fn()} onAddRecipes={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: /photo/i }));

    const page1 = new File(['page1bytes'], 'page1.jpg', { type: 'image/jpeg' });
    const page2 = new File(['page2bytes'], 'page2.jpg', { type: 'image/jpeg' });

    const uploadInput = screen.getByLabelText(/upload recipe photo/i);
    await user.upload(uploadInput, [page1, page2]);

    await waitFor(() => {
      expect(visionSpy).toHaveBeenCalledTimes(1);
    });

    const sentUrls = visionSpy.mock.calls[0][0];
    expect(Array.isArray(sentUrls)).toBe(true);
    expect(sentUrls).toHaveLength(2);

    const pageList = screen.getByRole('list', { name: /recipe photo pages/i });
    expect(within(pageList).getByRole('button', { name: /view page 1/i })).toBeInTheDocument();
    expect(within(pageList).getByRole('button', { name: /view page 2/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan 2 pages/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/recipe name/i)).toHaveValue('Two-Page Apple Galette');

    // Removing page 2 updates the strip to a single page
    await user.click(within(pageList).getByRole('button', { name: /remove page 2/i }));
    expect(within(pageList).queryByRole('button', { name: /view page 2/i })).not.toBeInTheDocument();
  });

  it('explains clearly when Firebase AI needs App Check instead of silently hiding why local OCR ran', async () => {
    const user = userEvent.setup();
    render(
      <AddRecipeModal
        firebaseEnabled
        firebaseUser={{
          uid: 'u1',
          displayName: 'Alex',
          email: 'alex@example.com',
          photoURL: null,
        }}
        onClose={vi.fn()}
        onAddRecipes={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /photo/i }));

    // Banner clearly surfaces App Check requirement and still lets user add a Gemini API key
    expect(screen.getByText(/needs app check/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add key/i }));
    expect(screen.getByLabelText(/gemini api key/i)).toBeInTheDocument();
  });
});
