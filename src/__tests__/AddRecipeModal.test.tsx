import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddRecipeModal } from '../components/AddRecipeModal';
import { parseIngredient } from '../domain/ingredientParser';
import * as photoOcr from '../domain/photoOcr';
import * as firebaseClient from '../firebase/firebaseClient';
import * as firebaseVision from '../firebase/firebaseVision';

describe('AddRecipeModal — multi-page recipe photos & Gemini Vision feedback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('uploads multiple recipe pages and scans all pages together with Gemini 4 Hydrogen when an API key is saved', async () => {
    vi.spyOn(firebaseClient, 'isFirebaseAppCheckConfigured').mockReturnValue(false);
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

  it('uses Firebase AI Logic with Gemini 4 Hydrogen when Firebase and App Check are configured', async () => {
    vi.spyOn(firebaseClient, 'isFirebaseAppCheckConfigured').mockReturnValue(true);
    vi.spyOn(photoOcr, 'preprocessPhotoForOcr').mockImplementation(async (dataUrl) => ({
      displayDataUrl: dataUrl,
      ocrDataUrl: dataUrl,
    }));

    const firebaseVisionSpy = vi
      .spyOn(firebaseVision, 'extractRecipeWithFirebaseAi')
      .mockResolvedValue({
        id: 'rec_fb_vision',
        title: 'Cardamom Morning Buns',
        servings: 12,
        prepMinutes: 45,
        ingredients: [parseIngredient('3 cups bread flour')],
        steps: ['Mix dough and proof.', 'Shape with cardamom sugar and bake.'],
        notes: '',
        sourceType: 'photo',
        createdAt: '2026-11-26T00:00:00Z',
        updatedAt: '2026-11-26T00:00:00Z',
      });

    const user = userEvent.setup();
    render(<AddRecipeModal firebaseEnabled onClose={vi.fn()} onAddRecipes={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: /photo/i }));
    expect(screen.getByText(/gemini 4 hydrogen vision ready/i)).toBeInTheDocument();

    const page1 = new File(['bunpage1'], 'buns1.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText(/upload recipe photo/i), page1);

    await waitFor(() => {
      expect(firebaseVisionSpy).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByLabelText(/recipe name/i)).toHaveValue('Cardamom Morning Buns');
  });

  it('explains clearly when Firebase AI needs App Check instead of silently hiding why local OCR ran', async () => {
    vi.spyOn(firebaseClient, 'isFirebaseAppCheckConfigured').mockReturnValue(false);
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

  it('creates a recipe from a picture of a finished dish with an optional hint', async () => {
    vi.spyOn(firebaseClient, 'isFirebaseAppCheckConfigured').mockReturnValue(true);
    vi.spyOn(photoOcr, 'preprocessPhotoForOcr').mockImplementation(async (dataUrl) => ({
      displayDataUrl: dataUrl,
      ocrDataUrl: dataUrl,
    }));

    const firebaseVisionSpy = vi
      .spyOn(firebaseVision, 'extractRecipeWithFirebaseAi')
      .mockResolvedValue({
        id: 'rec_dish_1',
        title: 'Crispy Honey Glazed Salmon Bites',
        servings: 4,
        prepMinutes: 20,
        ingredients: [parseIngredient('1 lb salmon fillets'), parseIngredient('2 tbsp honey')],
        steps: ['Cube and sear salmon until crisp.', 'Toss in warm honey garlic glaze.'],
        notes: 'Serve over jasmine rice.',
        sourceType: 'photo',
        createdAt: '2026-11-27T00:00:00Z',
        updatedAt: '2026-11-27T00:00:00Z',
      });

    const user = userEvent.setup();
    render(<AddRecipeModal firebaseEnabled onClose={vi.fn()} onAddRecipes={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: /photo/i }));
    await user.click(screen.getByRole('button', { name: /dish photo/i }));

    await user.type(screen.getByLabelText(/dish hint/i), 'gluten-free');

    const dishFile = new File(['dishphoto'], 'salmon-plate.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText(/upload dish photo/i), dishFile);

    await waitFor(() => {
      expect(firebaseVisionSpy).toHaveBeenCalledTimes(1);
    });

    expect(firebaseVisionSpy.mock.calls[0][1]).toEqual({
      mode: 'dish',
      hint: 'gluten-free',
    });
    expect(screen.getByLabelText(/recipe name/i)).toHaveValue('Crispy Honey Glazed Salmon Bites');
    expect(screen.getByRole('button', { name: /recreate recipe/i })).toBeInTheDocument();
  });
});
