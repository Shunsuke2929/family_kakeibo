(function registerKakeiboMonthlyFixedFeature(global) {
  function getMonthlyFixedStats(ctx, configValue = null) {
    const { state, normalizeRecurringTemplateConfig } = ctx;
    const templates = normalizeRecurringTemplateConfig(configValue ?? state.recurringTemplateConfig).templates;
    const activeTemplates = templates.filter((t) => t.active !== false);
    const zeroAmountTemplates = activeTemplates.filter((t) => !Number(t.amount));
    return {
      total: templates.length,
      active: activeTemplates.length,
      zeroAmount: zeroAmountTemplates.length,
    };
  }

  function buildMonthlyFixedStatusSummaryText(ctx, stats) {
    const { state, formatDateTimeDisplay } = ctx;
    if (!stats.total) {
      return "登録されている月次定常費はまだありません。";
    }
    const parts = [
      `登録数 ${stats.total}件`,
      `有効 ${stats.active}件`,
    ];
    if (stats.zeroAmount) parts.push(`金額未設定 ${stats.zeroAmount}件`);
    if (state.monthlyFixedLastSavedAt) {
      parts.push(`最終保存 ${formatDateTimeDisplay(state.monthlyFixedLastSavedAt)}`);
    }
    return parts.join(" / ");
  }

  function renderMonthlyFixedStatusSummary(ctx) {
    const { els } = ctx;
    if (!els.monthlyFixedStatusSummary) return;
    els.monthlyFixedStatusSummary.textContent = buildMonthlyFixedStatusSummaryText(ctx, getMonthlyFixedStats(ctx));
  }

  function getCategoryOptionsHtml(ctx, selected = "") {
    const { getSelectableCategoryLabels, state, normalizeCategoryLabel, getPreferredCategoryFallback, escapeHtml } = ctx;
    let labels = [];
    try {
      labels = getSelectableCategoryLabels(state.categoryMasterConfig, state.categories);
    } catch (error) {
      console.error("Failed to build category options", error);
    }
    const selectedLabel = normalizeCategoryLabel(selected) || String(selected || "").trim();
    const nextLabels = Array.isArray(labels) ? labels.filter(Boolean) : [];
    if (selectedLabel && !nextLabels.includes(selectedLabel)) nextLabels.unshift(selectedLabel);
    if (!nextLabels.length) nextLabels.push(getPreferredCategoryFallback());
    return Array.from(new Set(nextLabels)).map((label) => (
      `<option value="${escapeHtml(label)}"${label === selectedLabel ? " selected" : ""}>${escapeHtml(label)}</option>`
    )).join("");
  }

  function getPaymentOptionsHtml(ctx, selected = "") {
    const { PAYMENT_METHODS = [], escapeHtml } = ctx;
    const options = Array.isArray(PAYMENT_METHODS) && PAYMENT_METHODS.length
      ? PAYMENT_METHODS.slice()
      : [
        { value: "husband_card", label: "夫カード" },
        { value: "wife_card", label: "妻カード" },
        { value: "husband_other", label: "夫その他" },
        { value: "wife_other", label: "妻その他" },
      ];
    const normalizedSelected = String(selected || "").trim();
    if (normalizedSelected && !options.some((item) => item.value === normalizedSelected)) {
      options.unshift({ value: normalizedSelected, label: normalizedSelected });
    }
    return options.map((item) => (
      `<option value="${escapeHtml(item.value)}"${item.value === normalizedSelected ? " selected" : ""}>${escapeHtml(item.label)}</option>`
    )).join("");
  }

  function getPayerOptionsHtml(ctx, selected = "") {
    const { PAYER_LABELS = { husband: "夫", wife: "妻" }, escapeHtml } = ctx;
    const normalizedSelected = selected === "wife" ? "wife" : "husband";
    return Object.entries(PAYER_LABELS).map(([value, label]) => (
      `<option value="${escapeHtml(value)}"${value === normalizedSelected ? " selected" : ""}>${escapeHtml(label)}</option>`
    )).join("");
  }

  function getPersonalExpenseOptionsHtml(ctx, selected = "") {
    const { PERSONAL_EXPENSE_LABELS = { family: "家計費", husband: "夫", wife: "妻", child: "子供" }, escapeHtml } = ctx;
    const normalizedSelected = ["family", "husband", "wife", "child"].includes(selected) ? selected : "family";
    return Object.entries(PERSONAL_EXPENSE_LABELS).map(([value, label]) => (
      `<option value="${escapeHtml(value)}"${value === normalizedSelected ? " selected" : ""}>${escapeHtml(label)}</option>`
    )).join("");
  }

  function buildMonthlyFixedCardMarkup(ctx, template, index) {
    const { normalizeRecurringTemplateEntry, escapeHtml } = ctx;
    const safeTemplate = normalizeRecurringTemplateEntry(template, index);
    return `
      <article class="recurring-template-card" data-template-id="${escapeHtml(safeTemplate.id)}">
        <div class="recurring-template-head">
          <strong>${escapeHtml(safeTemplate.label || `定常費${index + 1}`)}</strong>
          <button class="ghost-button compact" type="button" data-remove-template-id="${escapeHtml(safeTemplate.id)}">削除</button>
        </div>
        <div class="recurring-template-grid">
          <label class="input-group">
            <span>名称</span>
            <input type="text" data-template-field="label" value="${escapeHtml(safeTemplate.label || "")}" />
          </label>
          <label class="input-group">
            <span>店名</span>
            <input type="text" data-template-field="storeName" value="${escapeHtml(safeTemplate.storeName || "")}" />
          </label>
          <label class="input-group">
            <span>カテゴリ</span>
            <select data-template-field="category">${getCategoryOptionsHtml(ctx, safeTemplate.category)}</select>
          </label>
          <label class="input-group">
            <span>金額（減額はマイナス）</span>
            <input type="number" step="1" data-template-field="amount" value="${escapeHtml(String(safeTemplate.amount || 0))}" />
          </label>
          <label class="input-group">
            <span>支払者</span>
            <select data-template-field="payer">${getPayerOptionsHtml(ctx, safeTemplate.payer)}</select>
          </label>
          <label class="input-group">
            <span>支払い手段</span>
            <select data-template-field="paymentMethod">${getPaymentOptionsHtml(ctx, safeTemplate.paymentMethod)}</select>
          </label>
          <label class="input-group">
            <span>負担区分</span>
            <select data-template-field="personalExpense">${getPersonalExpenseOptionsHtml(ctx, safeTemplate.personalExpense)}</select>
          </label>
          <label class="input-group">
            <span>引き落とし日</span>
            <input type="number" min="1" max="31" step="1" data-template-field="dayOfMonth" value="${escapeHtml(String(safeTemplate.dayOfMonth || 27))}" />
          </label>
        </div>
        <label class="toggle-row settlement-toggle-row">
          <input type="checkbox" data-template-field="active"${safeTemplate.active !== false ? " checked" : ""} />
          <span>この定常費を有効にする</span>
        </label>
        <label class="input-group">
          <span>メモ</span>
          <textarea rows="2" maxlength="500" data-template-field="memo">${escapeHtml(safeTemplate.memo || "")}</textarea>
        </label>
      </article>
    `;
  }

  function collectMonthlyFixedFromInputs(ctx) {
    const { state, els, normalizeRecurringTemplateConfig, normalizeRecurringTemplateEntry } = ctx;
    const existingTemplates = normalizeRecurringTemplateConfig(state.recurringTemplateConfig).templates;
    if (!els.monthlyFixedList) return existingTemplates;
    const cards = Array.from(els.monthlyFixedList.querySelectorAll("[data-template-id]"));
    if (!cards.length) return [];
    return cards.map((card, index) => normalizeRecurringTemplateEntry({
      id: card.getAttribute("data-template-id") || "",
      label: card.querySelector("[data-template-field='label']")?.value || "",
      storeName: card.querySelector("[data-template-field='storeName']")?.value || "",
      category: card.querySelector("[data-template-field='category']")?.value || "",
      amount: Number(card.querySelector("[data-template-field='amount']")?.value || 0),
      payer: card.querySelector("[data-template-field='payer']")?.value || "husband",
      paymentMethod: card.querySelector("[data-template-field='paymentMethod']")?.value || "",
      personalExpense: card.querySelector("[data-template-field='personalExpense']")?.value || "family",
      frequency: "monthly",
      month: "01",
      dayOfMonth: Number(card.querySelector("[data-template-field='dayOfMonth']")?.value || 27),
      active: Boolean(card.querySelector("[data-template-field='active']")?.checked),
      memo: card.querySelector("[data-template-field='memo']")?.value || "",
    }, index));
  }

  function getMonthlyFixedDraftConfig(ctx) {
    const { state, normalizeRecurringTemplateConfig } = ctx;
    return normalizeRecurringTemplateConfig({
      ...state.recurringTemplateConfig,
      templates: collectMonthlyFixedFromInputs(ctx),
    });
  }

  function clampDay(dayOfMonth, monthKey, getDaysInMonth) {
    const amount = Number(dayOfMonth) || 1;
    return Math.min(getDaysInMonth(monthKey), Math.max(1, Math.round(amount)));
  }

  function buildCandidate(ctx, template, monthKey) {
    const {
      getDaysInMonth,
      normalizeCategoryLabel,
      getPreferredCategoryFallback,
      normalizePaymentMethodCode,
      normalizeOtherPaymentMethodLabel,
    } = ctx;
    const day = clampDay(template.dayOfMonth, monthKey, getDaysInMonth);
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    return {
      id: `${template.id}-${monthKey}`,
      monthKey,
      date,
      templateId: template.id,
      templateLabel: template.label || template.storeName || "定常費",
      label: template.label || template.storeName || "定常費",
      storeName: template.storeName || template.label || "定常費",
      amount: Number(template.amount || 0),
      category: normalizeCategoryLabel(template.category) || getPreferredCategoryFallback(),
      payer: template.payer === "wife" ? "wife" : "husband",
      paymentMethod: normalizePaymentMethodCode(template.paymentMethod || "husband_card", template.payer === "wife" ? "wife" : "husband"),
      otherPaymentMethod: template.otherPaymentMethod || "",
      personalExpense: ["family", "husband", "wife", "child"].includes(template.personalExpense) ? template.personalExpense : "family",
      memo: String(template.memo || "").trim(),
      status: "new",
      statusLabel: "新規候補",
      reason: "",
      duplicateExpenseId: "",
      duplicateExpenseLabel: "",
    };
  }

  function findExistingExpense(ctx, candidate) {
    const { state, toYearMonth, normalizeCategoryLabel, normalizePayerCode } = ctx;
    const storeLike = String(candidate.storeName || "").trim();
    const templateLike = String(candidate.templateLabel || "").trim();
    return state.expenses.find((item) => {
      if (toYearMonth(item?.date) !== candidate.monthKey) return false;
      if ((normalizeCategoryLabel(item?.category) || "") !== candidate.category) return false;
      if ((Number(item?.amount) || 0) !== candidate.amount) return false;
      if (normalizePayerCode(item?.payer) !== candidate.payer) return false;
      const itemStore = String(item?.storeName || "").trim();
      if (String(item?.sourceTemplateId || "").trim() && String(item.sourceTemplateId).trim() === candidate.templateId) return true;
      if (String(item?.sourceTemplateLabel || "").trim() && String(item.sourceTemplateLabel).trim() === templateLike) return true;
      return Boolean(itemStore) && (itemStore === storeLike || itemStore === templateLike);
    }) || null;
  }

  function validateCandidate(candidate) {
    const errors = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(candidate?.date || "").trim())) {
      errors.push("予定日を入れてください");
    }
    if (!String(candidate?.storeName || "").trim()) {
      errors.push("内容を入れてください");
    }
    if (!Number(candidate?.amount)) {
      errors.push("金額を入れてください");
    }
    if (!String(candidate?.category || "").trim()) {
      errors.push("カテゴリを選んでください");
    }
    if (!String(candidate?.paymentMethod || "").trim()) {
      errors.push("支払い手段を選んでください");
    }
    return errors;
  }

  function getCandidateStatus(ctx, candidate) {
    const validationErrors = validateCandidate(candidate);
    if (validationErrors.length) {
      return {
        status: "skip",
        statusLabel: "要確認",
        reason: `確認: ${validationErrors.join(" / ")}。`,
        validationErrors,
      };
    }
    const existing = findExistingExpense(ctx, candidate);
    if (existing) {
      return {
        status: "existing",
        statusLabel: "既存あり",
        reason: `${existing.date || candidate.date} / ${existing.storeName || "既存支出"} がすでに登録されています。`,
        duplicateExpenseId: existing.id || "",
        duplicateExpenseLabel: `${existing.date || candidate.date} / ${existing.storeName || "既存支出"}`,
        validationErrors: [],
      };
    }
    return { status: "new", statusLabel: "新規候補", reason: "未登録です。", validationErrors: [] };
  }

  function buildExpenseFromCandidate(ctx, candidate) {
    const {
      shouldShowFamilyCardWarning,
      joinTextPartsWithinLimit,
      MEMO_MAX_LENGTH,
      normalizeExpense,
      getBillingTargetFromPaymentMethod,
      state,
    } = ctx;
    const now = new Date().toISOString();
    const isFamilyCard = shouldShowFamilyCardWarning(candidate.payer, candidate.paymentMethod);
    const memo = joinTextPartsWithinLimit(
      [
        candidate.memo || "",
        `定常費: ${candidate.templateLabel || candidate.storeName || "定常費"}`,
      ],
      MEMO_MAX_LENGTH
    );
    return normalizeExpense({
      id: crypto.randomUUID(),
      serialCode: "",
      date: candidate.date,
      storeName: candidate.storeName || candidate.templateLabel || "定常費",
      amount: candidate.amount,
      grossAmount: candidate.amount,
      pointCredit: 0,
      category: candidate.category,
      payer: candidate.payer,
      paymentMethod: candidate.paymentMethod,
      otherPaymentMethod: candidate.otherPaymentMethod || "",
      billingTarget: isFamilyCard ? "husband_card" : getBillingTargetFromPaymentMethod(candidate.paymentMethod),
      isFamilyCard,
      memo,
      createdAt: now,
      updatedAt: now,
      createdBy: state.currentUser?.email || "",
      personalExpense: candidate.personalExpense || "family",
      sourceType: "monthly_fixed",
      sourceTemplateId: candidate.templateId,
      sourceTemplateLabel: candidate.templateLabel || candidate.storeName || "定常費",
    });
  }

  function renderMonthlyFixedSettings(ctx) {
    const { els, state, normalizeRecurringTemplateConfig } = ctx;
    if (!els.monthlyFixedList) return;
    renderMonthlyFixedStatusSummary(ctx);
    const templates = normalizeRecurringTemplateConfig(state.recurringTemplateConfig).templates;
    if (!templates.length) {
      els.monthlyFixedList.innerHTML = '<div class="expense-card"><span class="muted">登録されている月次定常費はありません。</span></div>';
      return;
    }
    els.monthlyFixedList.innerHTML = templates.map((template, index) => buildMonthlyFixedCardMarkup(ctx, template, index)).join("");
    els.monthlyFixedList.querySelectorAll("[data-remove-template-id]").forEach((button) => {
      button.addEventListener("click", () => {
        removeMonthlyFixed(ctx, String(button.dataset.removeTemplateId || ""));
      });
    });
  }

  function addMonthlyFixed(ctx) {
    const { state, normalizeRecurringTemplateConfig, normalizeRecurringTemplateEntry, getPreferredCategoryFallback, setMessageState, els, persist } = ctx;
    const templates = normalizeRecurringTemplateConfig(state.recurringTemplateConfig).templates;
    state.recurringTemplateConfig = normalizeRecurringTemplateConfig({
      ...state.recurringTemplateConfig,
      templates: [...templates, normalizeRecurringTemplateEntry({
        id: crypto.randomUUID(),
        label: `定常費${templates.length + 1}`,
        category: getPreferredCategoryFallback(),
        amount: 0,
        payer: "husband",
        paymentMethod: "husband_card",
        personalExpense: "family",
        frequency: "monthly",
        month: "01",
        dayOfMonth: 27,
        active: true,
      }, templates.length)],
    });
    renderMonthlyFixedSettings(ctx);
    setMessageState(els.monthlyFixedMessage, "追加しました。内容を入力し「定常費の設定を保存」を押してください。", "muted");
    persist({ skipRemote: true });
  }

  function removeMonthlyFixed(ctx, templateId) {
    const { state, normalizeRecurringTemplateConfig, persist } = ctx;
    state.recurringTemplateConfig = normalizeRecurringTemplateConfig({
      ...state.recurringTemplateConfig,
      templates: normalizeRecurringTemplateConfig(state.recurringTemplateConfig).templates.filter((item) => item.id !== templateId),
    });
    renderMonthlyFixedSettings(ctx);
    persist({ skipRemote: true });
  }

  async function saveMonthlyFixedConfig(ctx) {
    const { state, normalizeRecurringTemplateConfig, setMessageState, els, persist, canUseSharedStorage, saveSharedSettingsFields } = ctx;
    state.recurringTemplateConfig = normalizeRecurringTemplateConfig({
      ...state.recurringTemplateConfig,
      templates: collectMonthlyFixedFromInputs(ctx),
    });
    renderMonthlyFixedSettings(ctx);
    setMessageState(els.monthlyFixedMessage, "保存しています...", "pending");
    persist({ skipRemote: true });
    state.monthlyFixedLastSavedAt = new Date().toISOString();
    const statusSummary = buildMonthlyFixedStatusSummaryText(ctx, getMonthlyFixedStats(ctx));
    renderMonthlyFixedStatusSummary(ctx);
    if (!canUseSharedStorage()) {
      setMessageState(els.monthlyFixedMessage, `${statusSummary} / ローカルに保存しました。ログイン後に共有設定へ反映できます。`, "warning");
      return;
    }
    try {
      const result = await saveSharedSettingsFields({
        recurringTemplateConfig: state.recurringTemplateConfig,
      });
      if (!result?.ok) throw result?.error || new Error("shared settings save failed");
      setMessageState(els.monthlyFixedMessage, `保存しました。${statusSummary}`, "success");
    } catch (error) {
      console.error("Failed to save monthly fixed config", error);
      setMessageState(els.monthlyFixedMessage, "保存に失敗しました。", "error");
    }
  }

  function collectCandidatesFromInputs(ctx) {
    const { els, state, currentMonth, normalizePayerCode, normalizeCategoryLabel, getPreferredCategoryFallback, normalizePaymentMethodCode, toYearMonth } = ctx;
    if (!els.monthlyFixedCandidateList) {
      return Array.isArray(state.monthlyFixedCandidates) ? state.monthlyFixedCandidates : [];
    }
    const cards = Array.from(els.monthlyFixedCandidateList.querySelectorAll("[data-candidate-id]"));
    const existingCandidates = Array.isArray(state.monthlyFixedCandidates) ? state.monthlyFixedCandidates : [];
    if (!cards.length) return existingCandidates;
    return cards.map((card, index) => {
      const candidateId = String(card.getAttribute("data-candidate-id") || "").trim();
      const base = existingCandidates.find((item) => String(item?.id || "").trim() === candidateId) || existingCandidates[index] || {};
      const payer = normalizePayerCode(card.querySelector('[data-recurring-candidate-field="payer"]')?.value || base.payer || "husband");
      const rawPaymentMethod = card.querySelector('[data-recurring-candidate-field="paymentMethod"]')?.value || base.paymentMethod || "husband_card";
      const rawAmount = card.querySelector('[data-recurring-candidate-field="amount"]')?.value;
      const rawCategory = card.querySelector('[data-recurring-candidate-field="category"]')?.value || base.category || getPreferredCategoryFallback();
      const rawPersonalExpense = card.querySelector('[data-recurring-candidate-field="personalExpense"]')?.value || base.personalExpense || "family";
      const rawDate = card.querySelector('[data-recurring-candidate-field="date"]')?.value || base.date || `${state.monthlyFixedCandidateMonth || currentMonth()}-01`;
      const rawStoreName = card.querySelector('[data-recurring-candidate-field="storeName"]')?.value || base.storeName || base.templateLabel || "定常費";
      const rawMemo = card.querySelector('[data-recurring-candidate-field="memo"]')?.value || base.memo || "";
      const amount = Number(String(rawAmount ?? base.amount ?? 0).replace(/,/g, "")) || 0;
      return {
        ...base,
        id: candidateId || base.id || crypto.randomUUID(),
        monthKey: toYearMonth(rawDate) || base.monthKey || state.monthlyFixedCandidateMonth || currentMonth(),
        date: rawDate,
        storeName: String(rawStoreName || "").trim() || base.storeName || base.templateLabel || "定常費",
        amount,
        category: normalizeCategoryLabel(rawCategory) || getPreferredCategoryFallback(),
        payer,
        paymentMethod: normalizePaymentMethodCode(rawPaymentMethod, payer),
        personalExpense: ["family", "husband", "wife", "child"].includes(rawPersonalExpense) ? rawPersonalExpense : "family",
        memo: String(rawMemo || "").trim(),
      };
    });
  }

  function renderMonthlyFixedCandidateSection(ctx) {
    const { els, state, currentMonth, formatYearMonthLabel, escapeHtml } = ctx;
    if (!els.monthlyFixedCandidateMonth || !els.monthlyFixedCandidateSummary || !els.monthlyFixedCandidateList || !els.monthlyFixedCandidateSaveButton) return;
    const monthKey = state.monthlyFixedCandidateMonth || currentMonth();
    els.monthlyFixedCandidateMonth.value = monthKey;
    const candidates = Array.isArray(state.monthlyFixedCandidates) ? state.monthlyFixedCandidates : [];
    const newCount = candidates.filter((item) => item.status === "new").length;
    const existingCount = candidates.filter((item) => item.status === "existing").length;
    if (!candidates.length) {
      els.monthlyFixedCandidateSummary.textContent = "";
      els.monthlyFixedCandidateList.innerHTML = '<div class="expense-card"><span class="muted">「未登録分を確認」を押すと、ここに候補が表示されます。</span></div>';
      els.monthlyFixedCandidateSaveButton.disabled = true;
      return;
    }
    els.monthlyFixedCandidateSummary.textContent = `${formatYearMonthLabel(monthKey)} の候補: 新規登録可能 ${newCount}件 / 既存登録あり ${existingCount}件`;
    els.monthlyFixedCandidateList.innerHTML = candidates.map((candidate, index) => {
      const isChecked = candidate.status === "new";
      const paymentMethodValue = String(candidate.paymentMethod || "");
      const validationErrors = Array.isArray(candidate.validationErrors) ? candidate.validationErrors : [];
      const validationHtml = validationErrors.length
        ? `<ul class="recurring-candidate-issues">${validationErrors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`
        : "";
      return `
        <article class="recurring-candidate-card status-${escapeHtml(candidate.status || "new")}${validationErrors.length ? " has-error" : ""}" data-candidate-id="${escapeHtml(candidate.id)}">
          <div class="recurring-candidate-head">
            <label class="recurring-candidate-check">
              <input type="checkbox" data-recurring-candidate-select="${escapeHtml(candidate.id)}"${isChecked ? " checked" : ""}${candidate.status !== "new" ? " disabled" : ""} />
              <div>
                <strong>${escapeHtml(candidate.templateLabel || `定常費${index + 1}`)}</strong>
                <small>${escapeHtml(candidate.date)} / ${escapeHtml(candidate.storeName || candidate.label || "定常費")}</small>
              </div>
            </label>
            <span class="badge recurring-candidate-status">${escapeHtml(candidate.statusLabel || "新規候補")}</span>
          </div>
          <div class="recurring-candidate-edit-grid">
            <label class="input-group compact">
              <span>予定日</span>
              <input type="date" data-recurring-candidate-field="date" value="${escapeHtml(candidate.date || "")}" />
            </label>
            <label class="input-group compact">
              <span>内容</span>
              <input type="text" data-recurring-candidate-field="storeName" maxlength="120" value="${escapeHtml(candidate.storeName || candidate.label || "")}" />
            </label>
            <label class="input-group compact">
              <span>金額</span>
              <input type="number" inputmode="decimal" step="1" data-recurring-candidate-field="amount" value="${escapeHtml(String(Number(candidate.amount || 0)))}" />
            </label>
            <label class="input-group compact">
              <span>カテゴリ</span>
              <select data-recurring-candidate-field="category">${getCategoryOptionsHtml(ctx, candidate.category || "")}</select>
            </label>
            <label class="input-group compact">
              <span>支払者</span>
              <select data-recurring-candidate-field="payer">${getPayerOptionsHtml(ctx, candidate.payer || "husband")}</select>
            </label>
            <label class="input-group compact">
              <span>支払い手段</span>
              <select data-recurring-candidate-field="paymentMethod">${getPaymentOptionsHtml(ctx, paymentMethodValue)}</select>
            </label>
            <label class="input-group compact">
              <span>負担区分</span>
              <select data-recurring-candidate-field="personalExpense">${getPersonalExpenseOptionsHtml(ctx, candidate.personalExpense || "family")}</select>
            </label>
            <label class="input-group compact recurring-candidate-memo">
              <span>メモ</span>
              <input type="text" data-recurring-candidate-field="memo" maxlength="300" value="${escapeHtml(candidate.memo || "")}" placeholder="補足" />
            </label>
          </div>
          <p class="muted small">${escapeHtml(candidate.reason || "")}</p>
          ${validationHtml}
        </article>
      `;
    }).join("");
    els.monthlyFixedCandidateSaveButton.disabled = newCount === 0;
  }

  async function generateMonthlyFixedCandidates(ctx, forcedMonth = "") {
    const { els, state, currentMonth, canUseSharedStorage, ensureAllExpensesLoaded, normalizeRecurringTemplateConfig, formatYearMonthLabel } = ctx;
    const monthKey = forcedMonth || els.monthlyFixedCandidateMonth?.value || currentMonth();
    state.monthlyFixedCandidateMonth = monthKey;
    if (els.monthlyFixedCandidateMonth) els.monthlyFixedCandidateMonth.value = monthKey;
    ctx.setMessageState?.(els.monthlyFixedCandidateMessage, "候補を作成しています...", "pending");
    try {
      if (canUseSharedStorage()) {
        await ensureAllExpensesLoaded({ silent: true });
      }
      state.recurringTemplateConfig = getMonthlyFixedDraftConfig(ctx);
      const allTemplates = normalizeRecurringTemplateConfig(state.recurringTemplateConfig).templates;
      const activeTemplates = allTemplates.filter((t) => t.active !== false);
      if (!allTemplates.length) {
        state.monthlyFixedCandidates = [];
        renderMonthlyFixedSettings(ctx);
        renderMonthlyFixedCandidateSection(ctx);
        ctx.setMessageState?.(els.monthlyFixedCandidateMessage, "登録されている定常費がありません。まず定常費を追加して保存してください。", "warning");
        return;
      }
      if (!activeTemplates.length) {
        state.monthlyFixedCandidates = [];
        renderMonthlyFixedSettings(ctx);
        renderMonthlyFixedCandidateSection(ctx);
        ctx.setMessageState?.(els.monthlyFixedCandidateMessage, "有効な定常費がありません。", "warning");
        return;
      }
      const candidates = activeTemplates.map((template) => {
        const candidate = buildCandidate(ctx, template, monthKey);
        return {
          ...candidate,
          ...getCandidateStatus(ctx, candidate),
        };
      });
      state.monthlyFixedCandidates = candidates;
      renderMonthlyFixedSettings(ctx);
      renderMonthlyFixedCandidateSection(ctx);
      const newCount = candidates.filter((c) => c.status === "new").length;
      ctx.setMessageState?.(
        els.monthlyFixedCandidateMessage,
        candidates.length
          ? `${formatYearMonthLabel(monthKey)} の候補を作成しました。新規登録可能 ${newCount}件です。`
          : "候補はありませんでした。",
        newCount ? "success" : "warning"
      );
    } catch (error) {
      console.error("Failed to generate monthly fixed candidates", error);
      state.monthlyFixedCandidates = [];
      renderMonthlyFixedCandidateSection(ctx);
      ctx.setMessageState?.(els.monthlyFixedCandidateMessage, "候補の作成に失敗しました。", "error");
    }
  }

  async function saveSelectedMonthlyFixedCandidates(ctx) {
    const { els, state, currentMonth, canUseSharedStorage, showSyncToast, saveSharedRecord, persist, upsertExpenseListRecord, ensureAllExpensesLoaded, loadExpenseOverviewFromBackend, renderAll } = ctx;
    if (!els.monthlyFixedCandidateList) return;
    const selectedIds = Array.from(els.monthlyFixedCandidateList.querySelectorAll("[data-recurring-candidate-select]:checked"))
      .map((input) => String(input.getAttribute("data-recurring-candidate-select") || "").trim())
      .filter(Boolean);
    if (!selectedIds.length) {
      ctx.setMessageState?.(els.monthlyFixedCandidateMessage, "登録する候補を選んでください。", "warning");
      return;
    }
    const refreshedCandidates = collectCandidatesFromInputs(ctx).map((candidate) => ({
      ...candidate,
      ...getCandidateStatus(ctx, candidate),
    }));
    state.monthlyFixedCandidates = refreshedCandidates;
    const selectedCandidates = refreshedCandidates.filter((candidate) => selectedIds.includes(candidate.id) && candidate.status === "new");
    if (!selectedCandidates.length) {
      renderMonthlyFixedCandidateSection(ctx);
      ctx.setMessageState?.(els.monthlyFixedCandidateMessage, "登録できる新規候補が選ばれていません。", "warning");
      return;
    }
    const ok = window.confirm(`${selectedCandidates.length}件の定常費を支出として保存します。よろしいですか？`);
    if (!ok) return;
    ctx.setMessageState?.(els.monthlyFixedCandidateMessage, "支出として保存しています...", "pending");
    try {
      if (canUseSharedStorage()) {
        showSyncToast("共有データへ反映中です...", "pending", { sticky: true });
        for (const candidate of selectedCandidates) {
          const draft = buildExpenseFromCandidate(ctx, candidate);
          const result = await saveSharedRecord("expenses", draft, { action: "create" });
          if (!result.ok) throw new Error("shared expense save failed");
        }
        showSyncToast(`${selectedCandidates.length}件を登録しました。`, "success");
      } else {
        selectedCandidates.forEach((candidate) => {
          const draft = buildExpenseFromCandidate(ctx, candidate);
          state.expenses.unshift(draft);
          upsertExpenseListRecord(draft);
        });
        persist({ skipRemote: true });
        showSyncToast(`${selectedCandidates.length}件を登録しました。`, "success");
      }
      await ensureAllExpensesLoaded({ silent: true });
      loadExpenseOverviewFromBackend({ silent: true }).catch(() => {});
      await generateMonthlyFixedCandidates(ctx, state.monthlyFixedCandidateMonth || currentMonth());
      renderAll();
      ctx.setMessageState?.(
        els.monthlyFixedCandidateMessage,
        `${selectedCandidates.length}件を支出として登録しました。`,
        "success"
      );
    } catch (error) {
      console.error("Failed to save monthly fixed candidates", error);
      showSyncToast("登録に失敗しました。", "error");
      ctx.setMessageState?.(els.monthlyFixedCandidateMessage, "保存に失敗しました。", "error");
    }
  }

  function bindActions(ctx) {
    const { els } = ctx;
    if (els.addMonthlyFixedButton) {
      els.addMonthlyFixedButton.onclick = () => addMonthlyFixed(ctx);
    }
    if (els.saveMonthlyFixedButton) {
      els.saveMonthlyFixedButton.onclick = () => saveMonthlyFixedConfig(ctx);
    }
    if (els.monthlyFixedGenerateButton) {
      els.monthlyFixedGenerateButton.onclick = () => generateMonthlyFixedCandidates(ctx);
    }
    if (els.monthlyFixedCandidateSaveButton) {
      els.monthlyFixedCandidateSaveButton.onclick = () => saveSelectedMonthlyFixedCandidates(ctx);
    }
  }

  global.KakeiboMonthlyFixedFeature = {
    renderMonthlyFixedSettings,
    generateMonthlyFixedCandidates,
    bindActions,
  };
})(window);
