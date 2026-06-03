(function registerKakeiboSettingsFeature(global) {
  function getSettingsMastersFeature(globalScope = global) {
    return globalScope.KakeiboSettingsMastersFeature || null;
  }

  function getMonthlyFixedFeature(globalScope = global) {
    return globalScope.KakeiboMonthlyFixedFeature || null;
  }

  function getUpdateHistoryFeature(globalScope = global) {
    return globalScope.KakeiboUpdateHistoryFeature || null;
  }

  function renderExportYearOptions(ctx) {
    const { els, collectExportYears, currentYear, escapeHtml } = ctx;
    if (!els.exportYear) return;
    const current = els.exportYear.value;
    const years = collectExportYears();
    els.exportYear.innerHTML = ['<option value="">全期間</option>']
      .concat(years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}年</option>`))
      .join("");
    if (current && years.includes(current)) {
      els.exportYear.value = current;
    } else if (years.includes(currentYear())) {
      els.exportYear.value = currentYear();
    }
  }

  function safeRenderSettingsSection(ctx, name, renderFn, onError = null) {
    try {
      renderFn();
      return true;
    } catch (error) {
      console.error(`Failed to render settings section: ${name}`, error);
      if (typeof onError === "function") {
        try {
          onError(error);
        } catch (fallbackError) {
          console.error(`Failed to render fallback for settings section: ${name}`, fallbackError);
        }
      }
      return false;
    }
  }

  function renderSettlementOverrideOverview(ctx, rows, rules) {
    const { els, escapeHtml, formatCurrency, formatYearMonthLabel } = ctx;
    if (!els.settlementOverrideOverview) return;
    const baseHusband = Number(rules?.monthlyContribution?.husband || 0);
    const baseWife = Number(rules?.monthlyContribution?.wife || 0);
    const baseTotal = baseHusband + baseWife;
    if (!rows.length) {
      els.settlementOverrideOverview.innerHTML = `
        <div class="settlement-overview-card">
          <span>通常の月額</span>
          <strong>${escapeHtml(formatCurrency(baseTotal))}</strong>
          <small>夫 ${escapeHtml(formatCurrency(baseHusband))} / 妻 ${escapeHtml(formatCurrency(baseWife))}</small>
        </div>
      `;
      return;
    }
    els.settlementOverrideOverview.innerHTML = `
      <div class="settlement-overview-card emphasis">
        <span>上書き月</span>
        <strong>${escapeHtml(String(rows.length))}件</strong>
        <small>通常月 ${escapeHtml(formatCurrency(baseTotal))} との差を確認できます</small>
      </div>
      ${rows.map(([monthKey, row]) => {
        const husband = Number(row?.husband || 0);
        const wife = Number(row?.wife || 0);
        const total = husband + wife;
        const delta = total - baseTotal;
        const deltaText = delta === 0 ? "通常月と同額" : `${delta > 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}`;
        return `
          <div class="settlement-overview-card">
            <span>${escapeHtml(formatYearMonthLabel(monthKey))}</span>
            <strong>${escapeHtml(formatCurrency(total))}</strong>
            <small>夫 ${escapeHtml(formatCurrency(husband))} / 妻 ${escapeHtml(formatCurrency(wife))} / ${escapeHtml(deltaText)}</small>
          </div>
        `;
      }).join("")}
    `;
  }

  function renderSettlementOverrideList(ctx, overrides = {}, rules = {}) {
    const { els, escapeHtml, formatCurrency } = ctx;
    if (!els.settlementOverrideList) return;
    const rows = Object.entries(overrides || {})
      .filter(([monthKey]) => /^\d{4}-\d{2}$/.test(monthKey || ""))
      .sort(([a], [b]) => a.localeCompare(b));
    renderSettlementOverrideOverview(ctx, rows, rules);
    if (!rows.length) {
      els.settlementOverrideList.innerHTML = '<div class="expense-card"><span class="muted">月別の目標拠出上書きはまだありません。</span></div>';
      return;
    }
    els.settlementOverrideList.innerHTML = rows.map(([monthKey, row]) => `
      <div class="settlement-override-row" data-settlement-override-month="${escapeHtml(monthKey)}">
        <label class="input-group">
          <span>対象月</span>
          <input type="month" data-settlement-override-field="month" value="${escapeHtml(monthKey)}" />
        </label>
        <label class="input-group">
          <span>夫</span>
          <input type="number" min="0" step="1000" data-settlement-override-field="husband" value="${escapeHtml(String(Number(row?.husband || 0)))}" />
        </label>
        <label class="input-group">
          <span>妻</span>
          <input type="number" min="0" step="1000" data-settlement-override-field="wife" value="${escapeHtml(String(Number(row?.wife || 0)))}" />
        </label>
        <div class="settlement-inline-total">
          <span>合計</span>
          <strong>${escapeHtml(formatCurrency(Number(row?.husband || 0) + Number(row?.wife || 0)))}</strong>
        </div>
        <div class="settlement-override-actions">
          <button class="ghost-button compact" type="button" data-remove-settlement-override="${escapeHtml(monthKey)}">削除</button>
        </div>
      </div>
    `).join("");
    els.settlementOverrideList.querySelectorAll("[data-remove-settlement-override]").forEach((button) => {
      button.addEventListener("click", () => {
        removeSettlementOverrideRow(ctx, String(button.getAttribute("data-remove-settlement-override") || ""));
      });
    });
  }

  function collectSettlementMonthlyOverridesFromInputs(ctx) {
    const { els } = ctx;
    if (!els.settlementOverrideList) return {};
    const rows = {};
    Array.from(els.settlementOverrideList.querySelectorAll("[data-settlement-override-month]")).forEach((row) => {
      const monthKey = String(row.querySelector("[data-settlement-override-field='month']")?.value || "").trim();
      if (!/^\d{4}-\d{2}$/.test(monthKey)) return;
      rows[monthKey] = {
        husband: Math.max(Number(row.querySelector("[data-settlement-override-field='husband']")?.value || 0), 0),
        wife: Math.max(Number(row.querySelector("[data-settlement-override-field='wife']")?.value || 0), 0),
      };
    });
    return rows;
  }

  function getHouseholdPoolOpeningBalanceYears(ctx, openingBalances = {}) {
    const { currentYear, collectTimelineYears } = ctx;
    const years = new Set([currentYear()]);
    if (typeof collectTimelineYears === "function") {
      collectTimelineYears().forEach((year) => years.add(year));
    }
    Object.keys(openingBalances || {}).forEach((yearKey) => {
      if (/^\d{4}$/.test(String(yearKey || ""))) years.add(String(yearKey));
    });
    return [...years].filter((year) => /^\d{4}$/.test(String(year || ""))).sort((a, b) => b.localeCompare(a));
  }

  function renderHouseholdPoolOpeningBalanceList(ctx, openingBalances = {}) {
    const { els, escapeHtml, currentYear, formatCurrency } = ctx;
    if (!els.householdPoolOpeningBalanceList) return;
    const years = getHouseholdPoolOpeningBalanceYears(ctx, openingBalances);
    const previousSelected = stateSelectedOpeningBalanceYear(ctx);
    const selectedYear = years.includes(previousSelected) ? previousSelected : years.includes(currentYear()) ? currentYear() : years[0];
    ctx.state.settingsOpeningBalanceYear = selectedYear;
    if (els.householdPoolOpeningBalanceYear) {
      els.householdPoolOpeningBalanceYear.innerHTML = years
        .map((yearKey) => `<option value="${escapeHtml(yearKey)}">${escapeHtml(yearKey)}年</option>`)
        .join("");
      els.householdPoolOpeningBalanceYear.value = selectedYear;
      els.householdPoolOpeningBalanceYear.onchange = () => {
        ctx.state.householdPoolConfig = ctx.normalizeHouseholdPoolConfig({
          ...ctx.normalizeHouseholdPoolConfig(ctx.state.householdPoolConfig),
          openingBalances: collectHouseholdPoolOpeningBalancesFromInputs(ctx),
        });
        ctx.state.settingsOpeningBalanceYear = String(els.householdPoolOpeningBalanceYear.value || currentYear());
        renderHouseholdPoolOpeningBalanceList(ctx, ctx.state.householdPoolConfig.openingBalances || {});
        ctx.persist({ skipRemote: true });
      };
    }
    const selectedRow = openingBalances?.[selectedYear] || { husband: 0, wife: 0 };
    const total = Number(selectedRow?.husband || 0) + Number(selectedRow?.wife || 0);
    const overviewRows = Object.entries(openingBalances || {})
      .filter(([yearKey]) => /^\d{4}$/.test(String(yearKey || "")))
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([yearKey, row]) => {
        const rowTotal = Number(row?.husband || 0) + Number(row?.wife || 0);
        return `<span class="pill subtle">${escapeHtml(yearKey)}年 ${escapeHtml(formatCurrency(rowTotal))}</span>`;
      })
      .join("");
    els.householdPoolOpeningBalanceList.innerHTML = `
      <div class="settlement-opening-overview">${overviewRows || '<span class="muted small">保存済みの年初残高はまだありません。</span>'}</div>
      <div class="settlement-override-row" data-household-pool-opening-year="${escapeHtml(selectedYear)}">
        <label class="input-group">
          <span>夫預かり</span>
          <input type="number" min="0" step="1000" data-household-pool-field="husband" value="${escapeHtml(String(Number(selectedRow?.husband || 0)))}" />
        </label>
        <label class="input-group">
          <span>妻預かり</span>
          <input type="number" min="0" step="1000" data-household-pool-field="wife" value="${escapeHtml(String(Number(selectedRow?.wife || 0)))}" />
        </label>
        <div class="settlement-inline-total">
          <span>${escapeHtml(selectedYear)}年 年初合計</span>
          <strong>${escapeHtml(formatCurrency(total))}</strong>
        </div>
        <div class="settlement-override-actions">
          <button class="ghost-button compact" type="button" data-remove-household-pool-year="${escapeHtml(selectedYear)}">この年を削除</button>
        </div>
      </div>
    `;
    els.householdPoolOpeningBalanceList.querySelectorAll("[data-remove-household-pool-year]").forEach((button) => {
      button.addEventListener("click", () => {
        removeHouseholdPoolOpeningBalanceRow(ctx, String(button.getAttribute("data-remove-household-pool-year") || ""));
      });
    });
  }

  function collectHouseholdPoolOpeningBalancesFromInputs(ctx) {
    const { els, normalizeHouseholdPoolConfig, state } = ctx;
    if (!els.householdPoolOpeningBalanceList) return {};
    const rows = { ...(normalizeHouseholdPoolConfig(state.householdPoolConfig).openingBalances || {}) };
    Array.from(els.householdPoolOpeningBalanceList.querySelectorAll("[data-household-pool-opening-year]")).forEach((row) => {
      const yearKey = String(row.getAttribute("data-household-pool-opening-year") || els.householdPoolOpeningBalanceYear?.value || "").trim();
      if (!/^\d{4}$/.test(yearKey)) return;
      rows[yearKey] = {
        husband: Math.max(Number(row.querySelector("[data-household-pool-field='husband']")?.value || 0), 0),
        wife: Math.max(Number(row.querySelector("[data-household-pool-field='wife']")?.value || 0), 0),
      };
    });
    return rows;
  }

  function stateSelectedOpeningBalanceYear(ctx) {
    const { els, state } = ctx;
    return String(state.settingsOpeningBalanceYear || els.householdPoolOpeningBalanceYear?.value || "").trim();
  }

  function renderSettlementRuleForm(ctx) {
    const { els, state, normalizeSettlementRules, normalizeHouseholdPoolConfig } = ctx;
    const rules = normalizeSettlementRules(state.settlementRules);
    const householdPoolConfig = normalizeHouseholdPoolConfig(state.householdPoolConfig);
    if (els.settlementMonthlyHusband) els.settlementMonthlyHusband.value = String(rules.monthlyContribution.husband || 0);
    if (els.settlementMonthlyWife) els.settlementMonthlyWife.value = String(rules.monthlyContribution.wife || 0);
    if (els.settlementBonusHusband06) els.settlementBonusHusband06.value = String(rules.bonusContribution.husband["06"] || 0);
    if (els.settlementBonusHusband12) els.settlementBonusHusband12.value = String(rules.bonusContribution.husband["12"] || 0);
    if (els.settlementBonusWife06) els.settlementBonusWife06.value = String(rules.bonusContribution.wife["06"] || 0);
    if (els.settlementBonusWife12) els.settlementBonusWife12.value = String(rules.bonusContribution.wife["12"] || 0);
    renderSettlementOverrideList(ctx, rules.monthlyOverrides || {}, rules);
    renderHouseholdPoolOpeningBalanceList(ctx, householdPoolConfig.openingBalances || {});
    if (els.settlementFamilyCardOwner) els.settlementFamilyCardOwner.value = rules.familyCardOwner === "wife" ? "wife" : "husband";
    if (els.settlementIncludeTransfers) els.settlementIncludeTransfers.checked = rules.includeTransfersInSettlement !== false;
    if (els.settlementNotes) els.settlementNotes.value = rules.notes || "";
  }

  function collectSettlementRulesFromInputs(ctx) {
    const { els, normalizeSettlementRules } = ctx;
    return normalizeSettlementRules({
      version: 1,
      monthlyContribution: {
        husband: Number(els.settlementMonthlyHusband?.value || 0),
        wife: Number(els.settlementMonthlyWife?.value || 0),
      },
      bonusContribution: {
        husband: {
          "06": Number(els.settlementBonusHusband06?.value || 0),
          "12": Number(els.settlementBonusHusband12?.value || 0),
        },
        wife: {
          "06": Number(els.settlementBonusWife06?.value || 0),
          "12": Number(els.settlementBonusWife12?.value || 0),
        },
      },
      monthlyOverrides: collectSettlementMonthlyOverridesFromInputs(ctx),
      familyCardOwner: els.settlementFamilyCardOwner?.value === "wife" ? "wife" : "husband",
      includeTransfersInSettlement: Boolean(els.settlementIncludeTransfers?.checked),
      notes: els.settlementNotes?.value || "",
    });
  }

  function collectHouseholdPoolConfigFromInputs(ctx) {
    const { normalizeHouseholdPoolConfig } = ctx;
    return normalizeHouseholdPoolConfig({
      version: 1,
      openingBalances: collectHouseholdPoolOpeningBalancesFromInputs(ctx),
    });
  }

  function addSettlementOverrideRow(ctx) {
    const { state, currentMonth, normalizeSettlementRules, persist } = ctx;
    const rules = normalizeSettlementRules(state.settlementRules);
    const monthKey = currentMonth();
    const nextOverrides = {
      ...rules.monthlyOverrides,
      [monthKey]: rules.monthlyOverrides?.[monthKey] || {
        husband: Number(rules.monthlyContribution?.husband || 0),
        wife: Number(rules.monthlyContribution?.wife || 0),
      },
    };
    state.settlementRules = normalizeSettlementRules({
      ...rules,
      monthlyOverrides: nextOverrides,
    });
    renderSettlementRuleForm(ctx);
    persist({ skipRemote: true });
  }

  function removeSettlementOverrideRow(ctx, monthKey) {
    const { state, normalizeSettlementRules, persist } = ctx;
    const rules = normalizeSettlementRules(state.settlementRules);
    const nextOverrides = { ...rules.monthlyOverrides };
    delete nextOverrides[monthKey];
    state.settlementRules = normalizeSettlementRules({
      ...rules,
      monthlyOverrides: nextOverrides,
    });
    renderSettlementRuleForm(ctx);
    persist({ skipRemote: true });
  }

  function addHouseholdPoolOpeningBalanceRow(ctx) {
    const { state, currentYear, normalizeHouseholdPoolConfig, persist } = ctx;
    const config = normalizeHouseholdPoolConfig(state.householdPoolConfig);
    const openingBalances = { ...config.openingBalances };
    let yearKey = currentYear();
    while (openingBalances[yearKey]) {
      yearKey = String(Number(yearKey) + 1);
    }
    openingBalances[yearKey] = { husband: 0, wife: 0 };
    state.settingsOpeningBalanceYear = yearKey;
    state.householdPoolConfig = normalizeHouseholdPoolConfig({
      ...config,
      openingBalances,
    });
    renderSettlementRuleForm(ctx);
    persist({ skipRemote: true });
  }

  function removeHouseholdPoolOpeningBalanceRow(ctx, yearKey) {
    const { state, normalizeHouseholdPoolConfig, persist } = ctx;
    const config = normalizeHouseholdPoolConfig(state.householdPoolConfig);
    const openingBalances = { ...config.openingBalances };
    delete openingBalances[yearKey];
    state.settingsOpeningBalanceYear = currentYear();
    state.householdPoolConfig = normalizeHouseholdPoolConfig({
      ...config,
      openingBalances,
    });
    renderSettlementRuleForm(ctx);
    persist({ skipRemote: true });
  }

  async function saveSettlementRules(ctx) {
    const { state, els, setMessageState, persist, canUseSharedStorage, saveSharedSettingsFields, renderSummary } = ctx;
    state.settlementRules = collectSettlementRulesFromInputs(ctx);
    state.householdPoolConfig = collectHouseholdPoolConfigFromInputs(ctx);
    renderSettlementRuleForm(ctx);
    setMessageState(els.settlementRulesMessage, "家計財布ルールを保存しています...", "pending");
    persist({ skipRemote: true });
    if (!canUseSharedStorage()) {
      setMessageState(els.settlementRulesMessage, "ローカルに保存しました。Googleログイン後に共有設定へ反映できます。", "warning");
      renderSummary();
      return;
    }
    try {
      const result = await saveSharedSettingsFields({
        settlementRules: state.settlementRules,
        householdPoolConfig: state.householdPoolConfig,
      });
      if (!result?.ok) throw result?.error || new Error("shared settings save failed");
      setMessageState(els.settlementRulesMessage, "家計財布ルールを保存しました。", "success");
      renderSummary();
    } catch (error) {
      console.error("Failed to save settlement rules", error);
      setMessageState(els.settlementRulesMessage, "家計財布ルールの保存に失敗しました。", "error");
    }
  }

  function renderMasters(ctx) {
    return getSettingsMastersFeature()?.renderMasters?.(ctx);
  }

  function addCategory(ctx) {
    return getSettingsMastersFeature()?.addCategory?.(ctx);
  }

  function addOtherPaymentMethod(ctx) {
    return getSettingsMastersFeature()?.addOtherPaymentMethod?.(ctx);
  }

  function renderMonthlyFixedSettings(ctx) {
    return getMonthlyFixedFeature()?.renderMonthlyFixedSettings?.(ctx);
  }

  function bindSettingsActionButtons(ctx) {
    const { els, setText } = ctx;
    if (els.settlementRulesSaveButton) {
      els.settlementRulesSaveButton.onclick = () => saveSettlementRules(ctx);
    }
    if (els.addSettlementOverrideButton) {
      els.addSettlementOverrideButton.onclick = () => addSettlementOverrideRow(ctx);
    }
    if (els.addHouseholdPoolOpeningBalanceButton) {
      els.addHouseholdPoolOpeningBalanceButton.onclick = () => addHouseholdPoolOpeningBalanceRow(ctx);
    }
    if (els.addCategoryButton) {
      els.addCategoryButton.onclick = () => {
        Promise.resolve(addCategory(ctx)).catch((error) => {
          console.error("Failed to add category", error);
        });
      };
    }
    if (els.addOtherPaymentMethodButton) {
      els.addOtherPaymentMethodButton.onclick = () => {
        Promise.resolve(addOtherPaymentMethod(ctx)).catch((error) => {
          console.error("Failed to add other payment method", error);
        });
      };
    }
    const monthlyFixed = getMonthlyFixedFeature();
    if (monthlyFixed && typeof monthlyFixed.bindActions === "function") {
      monthlyFixed.bindActions(ctx);
    }
  }

  function renderUpdateHistorySection(ctx) {
    const feature = getUpdateHistoryFeature();
    if (typeof feature?.renderUpdateHistory === "function") {
      return feature.renderUpdateHistory(ctx);
    }
    throw new Error("KakeiboUpdateHistoryFeature.renderUpdateHistory is not available");
  }

  function renderSettingsTabContent(ctx) {
    const { els } = ctx;
    safeRenderSettingsSection(ctx, "masters", () => renderMasters(ctx));
    safeRenderSettingsSection(ctx, "settlementRules", () => renderSettlementRuleForm(ctx));
    safeRenderSettingsSection(ctx, "monthlyFixed", () => renderMonthlyFixedSettings(ctx));
    safeRenderSettingsSection(ctx, "exportYears", () => renderExportYearOptions(ctx));
    safeRenderSettingsSection(ctx, "updateHistory", () => renderUpdateHistorySection(ctx), () => {
      if (els.updateHistoryList) {
        els.updateHistoryList.innerHTML = '<p class="muted small">アップデート履歴の表示で問題が起きました。画面を再読み込みして再度お試しください。</p>';
      }
    });
    bindSettingsActionButtons(ctx);
  }

  global.KakeiboSettingsFeature = {
    bindSettingsActionButtons,
    renderSettingsTabContent,
    renderExportYearOptions,
  };
})(window);
