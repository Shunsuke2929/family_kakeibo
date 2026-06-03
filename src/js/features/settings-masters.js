(function registerKakeiboSettingsMastersFeature(global) {
  function getCategoryMetaFieldLabel(field) {
    const labels = {
      bucket: "費目の性格",
      budgetMode: "見る単位",
      settlementScope: "対象",
      budgetGroupKey: "予算グループ",
      sortOrder: "表示順",
    };
    return labels[field] || field;
  }

  function getCategoryMetaValueDisplay(ctx, field, value) {
    const { DASHBOARD_GROUP_LABELS = {} } = ctx;
    const raw = String(value ?? "").trim();
    const fallback = raw || "未設定";
    const valueMaps = {
      bucket: {
        core_variable: "毎月のやりくり費",
        fixed_household: "固定費",
        special_annual: "年の特別費",
        car_variable: "車まわりの変動費",
        uncategorized: "未分類",
      },
      budgetMode: {
        monthly: "毎月",
        annual: "年単位",
        none: "予算対象外",
      },
      settlementScope: {
        family: "家計共有",
        husband: "夫個人",
        wife: "妻個人",
        child: "子供",
      },
    };
    if (field === "budgetGroupKey") {
      return {
        primary: DASHBOARD_GROUP_LABELS[raw] || (raw ? "個別管理" : "未設定"),
        secondary: raw,
      };
    }
    const primary = valueMaps[field]?.[raw] || fallback;
    return {
      primary,
      secondary: raw && primary !== raw ? raw : "",
    };
  }

  function renderMasters(ctx) {
    const {
      els,
      state,
      escapeHtml,
      getCategoryMasterEntries,
      DEFAULT_CATEGORIES = [],
      PAYMENT_METHODS = [],
      DEFAULT_OTHER_PAYMENT_METHODS = [],
    } = ctx;
    const categoryEntries = getCategoryMasterEntries();
    els.categoryMasterList.innerHTML = categoryEntries
      .filter((entry) => entry.active !== false)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .map((entry) => `
        <span class="pill">${escapeHtml(entry.label)}${DEFAULT_CATEGORIES.includes(entry.label) ? "" : `<button type="button" data-remove-category="${escapeHtml(entry.code)}">×</button>`}</span>
      `).join("");
    if (els.categoryMasterMetaToggle) {
      els.categoryMasterMetaToggle.textContent = state.categoryMetaPanelExpanded ? "カテゴリ詳細を閉じる" : "カテゴリ詳細をまとめて表示";
      els.categoryMasterMetaToggle.setAttribute("aria-expanded", state.categoryMetaPanelExpanded ? "true" : "false");
    }
    if (els.categoryMasterMetaList) {
      els.categoryMasterMetaList.classList.toggle("hidden", !state.categoryMetaPanelExpanded);
      els.categoryMasterMetaList.innerHTML = state.categoryMetaPanelExpanded ? categoryEntries.map((entry) => `
        <article class="category-meta-card ${entry.active === false ? "inactive" : ""} expanded">
          <div class="category-meta-head">
            <div class="category-meta-title">
              <strong>${escapeHtml(entry.label)}</strong>
              <span class="pill subtle category-code-pill">${escapeHtml(entry.code)}</span>
            </div>
          </div>
          <div class="category-meta-grid">
            ${[
              ["bucket", entry.bucket],
              ["budgetMode", entry.budgetMode],
              ["settlementScope", entry.settlementScope],
              ["budgetGroupKey", entry.budgetGroupKey || ""],
              ["sortOrder", String(entry.sortOrder ?? "")],
            ].map(([field, value]) => {
              const display = getCategoryMetaValueDisplay(ctx, field, value);
              return `
                <span>
                  <strong>${escapeHtml(getCategoryMetaFieldLabel(field))}</strong>
                  <small>${escapeHtml(display.primary)}</small>
                  ${display.secondary ? `<em class="category-meta-code">${escapeHtml(display.secondary)}</em>` : ""}
                </span>
              `;
            }).join("")}
          </div>
        </article>
      `).join("") : "";
    }
    els.categoryMasterMetaToggle?.replaceWith(els.categoryMasterMetaToggle.cloneNode(true));
    els.categoryMasterMetaToggle = document.getElementById("categoryMasterMetaToggle");
    els.categoryMasterMetaToggle?.addEventListener("click", () => {
      state.categoryMetaPanelExpanded = !state.categoryMetaPanelExpanded;
      renderMasters(ctx);
    });

    els.paymentMethodMasterList.innerHTML = PAYMENT_METHODS.map((method) => `
      <span class="pill">${escapeHtml(method.label)}</span>
    `).join("");

    if (els.otherPaymentMethodMasterList) {
      els.otherPaymentMethodMasterList.innerHTML = state.otherPaymentMethods.map((method, index) => `
        <span class="pill">${escapeHtml(method)}${DEFAULT_OTHER_PAYMENT_METHODS.includes(method) ? "" : `<button type="button" data-remove-other-payment="${index}">×</button>`}</span>
      `).join("");
    }

    Array.from(document.querySelectorAll("[data-remove-category]")).forEach((button) => {
      button.addEventListener("click", () => {
        Promise.resolve(removeCategory(ctx, String(button.dataset.removeCategory || ""))).catch((error) => {
          console.error("Failed to remove category", error);
        });
      });
    });
    Array.from(document.querySelectorAll("[data-remove-other-payment]")).forEach((button) => {
      button.addEventListener("click", () => {
        Promise.resolve(removeOtherPaymentMethod(ctx, Number(button.dataset.removeOtherPayment))).catch((error) => {
          console.error("Failed to remove other payment method", error);
        });
      });
    });
  }

  async function addCategory(ctx) {
    const {
      state,
      normalizeCategoryLabel,
      getCategoryMasterEntries,
      buildFallbackCategoryMetaFromLabel,
      getMigratedCategoryMasterConfig,
      getSelectableCategoryLabels,
      persist,
      renderSelectOptions,
      canUseSharedStorage,
      saveSharedSettingsFields,
      showSyncToast,
    } = ctx;
    const next = window.prompt("追加するカテゴリ名を入力してください");
    if (!next) return;
    const value = normalizeCategoryLabel(next.trim());
    if (!value) return;
    if (state.categories.includes(value)) {
      window.alert("同名カテゴリが既に存在します。");
      return;
    }
    const nextEntry = buildFallbackCategoryMetaFromLabel(
      value,
      Math.max(0, ...getCategoryMasterEntries().map((entry) => Number(entry.sortOrder || 0))) + 10
    );
    state.categoryMasterConfig = getMigratedCategoryMasterConfig({
      ...state.categoryMasterConfig,
      categories: [...getCategoryMasterEntries(), nextEntry],
    }, [...state.categories, value]);
    state.categories = getSelectableCategoryLabels(state.categoryMasterConfig, [...state.categories, value]);
    persist({ skipRemote: true });
    renderSelectOptions();
    renderMasters(ctx);
    if (canUseSharedStorage()) {
      const result = await saveSharedSettingsFields({
        categories: state.categories,
        categoryMasterConfig: state.categoryMasterConfig,
      });
      showSyncToast(
        result?.ok ? "カテゴリ設定を共有へ反映しました。" : "カテゴリ設定の共有反映に失敗しました。",
        result?.ok ? "success" : "error",
        { duration: result?.ok ? 2200 : 3200 }
      );
    }
  }

  async function removeCategory(ctx, code) {
    const {
      state,
      DEFAULT_CATEGORIES = [],
      getCategoryMetaByCode,
      canUseSharedStorage,
      ensureAllExpensesLoaded,
      getMigratedCategoryMasterConfig,
      getCategoryMasterEntries,
      getSelectableCategoryLabels,
      persist,
      renderSelectOptions,
    } = ctx;
    const entry = getCategoryMetaByCode(code);
    const category = entry?.label || "";
    if (!category || DEFAULT_CATEGORIES.includes(category)) return;
    if (canUseSharedStorage() && !state.expensesLoaded) {
      const loaded = await ensureAllExpensesLoaded({ silent: true });
      if (!loaded) {
        window.alert("カテゴリ使用状況の確認に失敗しました。時間を置いて再度お試しください。");
        return;
      }
    }
    const used = state.expenses.some((item) => item.category === category);
    if (used) {
      window.alert("このカテゴリは既存データで使用中のため削除できません。");
      return;
    }
    state.categoryMasterConfig = getMigratedCategoryMasterConfig({
      ...state.categoryMasterConfig,
      categories: getCategoryMasterEntries().filter((item) => item.code !== code),
    }, state.categories.filter((item) => item !== category));
    state.categories = getSelectableCategoryLabels(state.categoryMasterConfig, state.categories.filter((item) => item !== category));
    persist({ skipRemote: true });
    renderSelectOptions();
    renderMasters(ctx);
    if (canUseSharedStorage()) {
      const result = await ctx.saveSharedSettingsFields({
        categories: state.categories,
        categoryMasterConfig: state.categoryMasterConfig,
      });
      ctx.showSyncToast(
        result?.ok ? "カテゴリ設定を共有へ反映しました。" : "カテゴリ設定の共有反映に失敗しました。",
        result?.ok ? "success" : "error",
        { duration: result?.ok ? 2200 : 3200 }
      );
    }
  }

  async function addOtherPaymentMethod(ctx) {
    const {
      state,
      normalizeOtherPaymentMethodLabel,
      mergeOtherPaymentMethods,
      persist,
      renderSelectOptions,
      canUseSharedStorage,
      saveSharedSettingsFields,
      showSyncToast,
    } = ctx;
    const next = window.prompt("追加するその他支払い手段を入力してください");
    if (!next) return;
    const value = normalizeOtherPaymentMethodLabel(next);
    if (!value) return;
    if (state.otherPaymentMethods.includes(value)) {
      window.alert("同名の支払い手段候補が既に存在します。");
      return;
    }
    state.otherPaymentMethods.push(value);
    state.otherPaymentMethods = mergeOtherPaymentMethods(state.otherPaymentMethods);
    persist({ skipRemote: true });
    renderSelectOptions();
    renderMasters(ctx);
    if (canUseSharedStorage()) {
      const result = await saveSharedSettingsFields({
        otherPaymentMethods: state.otherPaymentMethods,
      });
      showSyncToast(
        result?.ok ? "支払い手段候補を共有へ反映しました。" : "支払い手段候補の共有反映に失敗しました。",
        result?.ok ? "success" : "error",
        { duration: result?.ok ? 2200 : 3200 }
      );
    }
  }

  async function removeOtherPaymentMethod(ctx, index) {
    const {
      state,
      DEFAULT_OTHER_PAYMENT_METHODS = [],
      canUseSharedStorage,
      ensureAllExpensesLoaded,
      normalizeOtherPaymentMethodLabel,
      mergeOtherPaymentMethods,
      persist,
      renderSelectOptions,
    } = ctx;
    const method = state.otherPaymentMethods[index];
    if (!method || DEFAULT_OTHER_PAYMENT_METHODS.includes(method)) return;
    if (canUseSharedStorage() && !state.expensesLoaded) {
      const loaded = await ensureAllExpensesLoaded({ silent: true });
      if (!loaded) {
        window.alert("支払い手段候補の使用状況確認に失敗しました。時間を置いて再度お試しください。");
        return;
      }
    }
    const used = state.expenses.some((item) => normalizeOtherPaymentMethodLabel(item.otherPaymentMethod) === method);
    if (used) {
      window.alert("この支払い手段候補は既存データで使用中のため削除できません。");
      return;
    }
    state.otherPaymentMethods.splice(index, 1);
    state.otherPaymentMethods = mergeOtherPaymentMethods(state.otherPaymentMethods);
    persist({ skipRemote: true });
    renderSelectOptions();
    renderMasters(ctx);
    if (canUseSharedStorage()) {
      const result = await ctx.saveSharedSettingsFields({
        otherPaymentMethods: state.otherPaymentMethods,
      });
      ctx.showSyncToast(
        result?.ok ? "支払い手段候補を共有へ反映しました。" : "支払い手段候補の共有反映に失敗しました。",
        result?.ok ? "success" : "error",
        { duration: result?.ok ? 2200 : 3200 }
      );
    }
  }

  global.KakeiboSettingsMastersFeature = {
    renderMasters,
    addCategory,
    addOtherPaymentMethod,
  };
})(window);
