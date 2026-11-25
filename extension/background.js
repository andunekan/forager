// Open Forager cleanly in Chrome or Brave's native Side Panel when clicking the extension icon
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Ignore on older Chrome versions
  });
}
