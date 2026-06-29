(() => {
  "use strict";

  const normalize = (value) => value.trim().toLocaleLowerCase("ja-JP");

  const syncPressedButtons = (buttons, activeValue, datasetKey, activeClass) => {
    buttons.forEach((button) => {
      const isActive = button.dataset[datasetKey] === activeValue;
      button.classList.toggle(activeClass, isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  const initTitleSearch = () => {
    const titleCards = Array.from(document.querySelectorAll("[data-title-card]"));
    if (titleCards.length === 0) {
      return;
    }

    const searchInput = document.querySelector("[data-title-search]");
    const statusButtons = Array.from(document.querySelectorAll("[data-title-status]"));
    const titleCount = document.querySelector("[data-title-count]");
    const emptyState = document.querySelector("[data-title-empty]");
    const state = { status: "all" };

    const applyTitleFilters = () => {
      const keyword = normalize(searchInput?.value ?? "");
      let shown = 0;

      titleCards.forEach((card) => {
        const statusMatches = state.status === "all" || card.dataset.status === state.status;
        const text = normalize(`${card.textContent} ${card.dataset.status ?? ""} ${card.dataset.searchKeywords ?? ""}`);
        const keywordMatches = keyword === "" || text.includes(keyword);
        const isShown = statusMatches && keywordMatches;

        card.hidden = !isShown;
        if (isShown) shown += 1;
      });

      if (titleCount) {
        titleCount.textContent = `作品 ${shown} / ${titleCards.length} 件`;
      }
      if (emptyState) {
        emptyState.hidden = shown !== 0;
      }
    };

    statusButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.status = button.dataset.titleStatus;
        syncPressedButtons(statusButtons, state.status, "titleStatus", "is-highlighted");
        applyTitleFilters();
      });
    });

    searchInput?.addEventListener("input", applyTitleFilters);
    syncPressedButtons(statusButtons, state.status, "titleStatus", "is-highlighted");
    applyTitleFilters();
  };

  const initCollabFilters = () => {
    const cards = Array.from(document.querySelectorAll(".collab-card-rich[data-status='published']"));
    if (cards.length === 0) {
      return;
    }

    const keywordInput = document.querySelector("[data-filter-keyword]");
    const visibleCount = document.querySelector("[data-visible-count]");
    const emptyState = document.querySelector("[data-filter-empty]");
    const resetButton = document.querySelector("[data-filter-reset]");
    const state = { partner: "all", category: "all" };

    const getGroupChips = (groupName) => Array.from(document.querySelectorAll(`[data-filter-group="${groupName}"] .filter-chip`));
    const syncChipGroup = (groupName, value) => {
      syncPressedButtons(getGroupChips(groupName), value, "filterValue", "is-active");
    };

    const applyFilters = () => {
      const keyword = normalize(keywordInput?.value ?? "");
      let shown = 0;

      cards.forEach((card) => {
        const partnerMatches = state.partner === "all" || card.dataset.partner === state.partner;
        const categories = (card.dataset.category ?? "").split(/\s+/);
        const categoryMatches = state.category === "all" || categories.includes(state.category);
        const text = normalize(`${card.textContent} ${card.dataset.partner} ${card.dataset.category} ${card.dataset.searchKeywords ?? ""}`);
        const keywordMatches = keyword === "" || text.includes(keyword);
        const isShown = partnerMatches && categoryMatches && keywordMatches;

        card.hidden = !isShown;
        if (isShown) shown += 1;
      });

      if (visibleCount) {
        visibleCount.textContent = `公開済み ${shown} / ${cards.length} 件`;
      }
      if (emptyState) {
        emptyState.hidden = shown !== 0;
      }
    };

    getGroupChips("partner").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.partner = chip.dataset.filterValue;
        syncChipGroup("partner", state.partner);
        applyFilters();
      });
    });

    getGroupChips("category").forEach((chip) => {
      chip.addEventListener("click", () => {
        state.category = chip.dataset.filterValue;
        syncChipGroup("category", state.category);
        applyFilters();
      });
    });

    keywordInput?.addEventListener("input", applyFilters);
    resetButton?.addEventListener("click", () => {
      state.partner = "all";
      state.category = "all";
      if (keywordInput) {
        keywordInput.value = "";
      }
      syncChipGroup("partner", state.partner);
      syncChipGroup("category", state.category);
      applyFilters();
    });

    applyFilters();
  };

  const init = () => {
    initTitleSearch();
    initCollabFilters();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
