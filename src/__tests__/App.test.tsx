import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';

describe('Forager App — End-to-End User Flows', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('displays the recipe library and allows transforming a recipe (substitute the dairy) and editing notes', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Lemon Herb Orzo with Asparagus'));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /substitute dairy/i }));

    expect(within(dialog).getAllByText(/nutritional yeast/i).length).toBeGreaterThanOrEqual(2);

    const notesBox = within(dialog).getByLabelText(/notes/i);
    await user.clear(notesBox);
    await user.type(notesBox, 'Extra lemon zest makes it sing');
    expect(notesBox).toHaveValue('Extra lemon zest makes it sing');
  });

  it('adds a new recipe and immediately updates the List tab when planned for this week', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Capture initial List tab count
    const listTabBefore = screen.getByRole('button', { name: /^list/i });
    const countBefore = parseInt(listTabBefore.textContent?.match(/\d+/)?.[0] ?? '0', 10);

    await user.click(screen.getByRole('button', { name: /^add$/i }));
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/recipe name/i), 'Roasted Squash Soup');
    await user.type(
      within(dialog).getByLabelText(/ingredients/i),
      '1 butternut squash\n2 tbsp maple syrup\n1 tsp ground nutmeg',
    );
    await user.click(within(dialog).getByRole('button', { name: /save recipe/i }));

    // List tab count should immediately increase with the newly added recipe's ingredients
    const listTabAfter = screen.getByRole('button', { name: /^list/i });
    const countAfter = parseInt(listTabAfter.textContent?.match(/\d+/)?.[0] ?? '0', 10);
    expect(countAfter).toBeGreaterThan(countBefore);

    // Navigating to List shows the new ingredients
    await user.click(listTabAfter);
    expect(screen.getByText(/butternut squash/i)).toBeInTheDocument();
  });

  it('imports recipes from a CSV spreadsheet via the Add modal', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /^add$/i }));
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('tab', { name: /spreadsheet/i }));

    const csvContent =
      'Title,Servings,Prep Minutes,Ingredients,Instructions,Notes\n' +
      '"Peach Burrata Salad",2,10,"2 ripe peaches; 4 oz burrata; 2 cups arugula","Slice peaches and arrange over arugula","Summer staple"';

    const file = new File([csvContent], 'recipes.csv', { type: 'text/csv' });
    const fileInput = within(dialog).getByLabelText(/upload spreadsheet/i);
    await user.upload(fileInput, file);

    await user.click(within(dialog).getByRole('button', { name: /import 1 recipe/i }));

    expect(screen.getByText('Peach Burrata Salad')).toBeInTheDocument();
  });

  it('uses one meal per day in Week mode, adjusts servings & recipe, and opens Walmart Pickup cart batches', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Switch to Week planning mode
    await user.click(screen.getByRole('button', { name: /^week/i }));

    // Should NOT render breakfast/lunch slot clutter
    expect(screen.queryByText(/^breakfast$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^lunch$/i)).not.toBeInTheDocument();

    // Increase servings on an existing planned meal
    const increaseBtns = screen.getAllByRole('button', { name: /increase servings/i });
    await user.click(increaseBtns[0]);

    // Adjust a specific planned meal (make Monday meal dairy-free)
    const adjustBtns = screen.getAllByRole('button', { name: /^adjust$/i });
    await user.click(adjustBtns[0]);
    const adjustDialog = screen.getByRole('dialog');
    await user.click(within(adjustDialog).getByRole('button', { name: /substitute dairy/i }));
    await user.click(within(adjustDialog).getByRole('button', { name: /save adjustments/i }));

    // Switch to Grocery List mode
    await user.click(screen.getByRole('button', { name: /^list/i }));

    expect(screen.getByText(/orzo pasta/i)).toBeInTheDocument();
    expect(screen.getByText(/nutritional yeast/i)).toBeInTheDocument();

    // Open Walmart Grocery Cart builder — defaults to Pickup and batches >10 items
    await user.click(screen.getByRole('button', { name: /walmart/i }));
    const cartDialog = screen.getByRole('dialog');

    const pickupBtn = within(cartDialog).getByRole('button', { name: /^pickup$/i });
    expect(pickupBtn).toHaveAttribute('aria-pressed', 'true');

    const cartLinks = within(cartDialog).getAllByRole('link', { name: /pickup cart/i });
    expect(cartLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of cartLinks) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.walmart\.com\/sc\/cart\/addToCart\?items=/);
      expect(link.getAttribute('href')).toContain('fulfillmentIntent=PICKUP');
    }
  });

  it('imports past Walmart orders inside the Walmart Cart sheet and uses them to match specialty items', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Go to List and add a specialty ingredient not in the default catalog
    await user.click(screen.getByRole('button', { name: /^list/i }));
    const extraInput = screen.getByLabelText(/add extra grocery item/i);
    await user.type(extraInput, '(1 1/4 ounce) package dried italian salad dressing mix');
    await user.click(screen.getByRole('button', { name: /^add item$/i }));

    // Open Walmart Cart modal and switch to Past orders tab
    await user.click(screen.getByRole('button', { name: /walmart/i }));
    const cartDialog = screen.getByRole('dialog');
    await user.click(within(cartDialog).getByRole('tab', { name: /past orders/i }));

    const orderCsv =
      'Product Name,Item ID,Quantity\n' +
      '"Good Seasons Italian Salad Dressing & Recipe Mix, 0.7 oz",10291641,4\n' +
      '"Kerrygold Pure Irish Unsalted Butter, 8 oz",17777211,3';

    const file = new File([orderCsv], 'walmart-orders.csv', { type: 'text/csv' });
    await user.upload(within(cartDialog).getByLabelText(/upload walmart order/i), file);

    // Switch back to Cart tab and confirm the specialty item matched from personal history
    await user.click(within(cartDialog).getByRole('tab', { name: /^cart/i }));
    expect(
      within(cartDialog).getByText(/Good Seasons Italian Salad Dressing/i),
    ).toBeInTheDocument();
    expect(within(cartDialog).getAllByText(/from your orders/i).length).toBeGreaterThanOrEqual(1);
  });
});
