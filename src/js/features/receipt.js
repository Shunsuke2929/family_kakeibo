(function registerKakeiboReceiptFeature(global) {
  function getLegacyPendingReceiptUploads(ctx) {
    const { state } = ctx;
    return (Array.isArray(state.pendingReceiptUploads) ? state.pendingReceiptUploads : [])
      .filter((item) => !String(item?.storageAssetId || "").trim());
  }

  function hasLegacyPendingReceiptUploads(ctx) {
    return getLegacyPendingReceiptUploads(ctx).length > 0;
  }

  function setReceiptFlowStatus(ctx, partial = {}) {
    const { state } = ctx;
    state.receiptFlowStatus = {
      ...state.receiptFlowStatus,
      ...partial,
    };
    renderReceiptFlowStatus(ctx);
  }

  function renderReceiptFlowStatus(ctx) {
    const { state, els } = ctx;
    if (!els.receiptWorkflowStatus) return;
    const hasReceiptContext = Boolean(state.receiptDraft.file || state.receiptQueue.length || state.pendingReceiptUploads.length);
    if (!hasReceiptContext) {
      els.receiptWorkflowStatus.classList.add("hidden");
      els.receiptWorkflowStatus.textContent = "";
      return;
    }
    const parts = [];
    if (state.aiAnalyzeBusy && state.aiAnalyzeMode === "image") {
      parts.push("AI解析中");
    } else if (state.receiptDraft.aiResult && state.receiptDraft.aiSource === "image") {
      parts.push("AI候補取得済み");
    } else if (state.receiptDraft.file || state.receiptQueue.length) {
      parts.push("解析の準備完了");
    }
    if (state.receiptDraft.storageStatus === "uploading" || state.receiptFlowStatus.drive === "checking") {
      parts.push("画像保存中");
    } else if (state.receiptDraft.storageAssetId && state.receiptDraft.storageStatus === "stored") {
      parts.push("画像を保存しました");
    } else if (state.receiptDraft.storageStatus === "failed") {
      parts.push("画像保存失敗");
    }
    if (state.receiptDraft.uploadStatus === "storage_saved") {
      parts.push("画像を保存しました");
    } else if (state.receiptDraft.uploadStatus === "pending") {
      parts.push("Drive保存待ち");
    } else if (state.receiptDraft.uploadStatus === "success") {
      parts.push("Drive保存完了");
    } else if (state.receiptDraft.uploadStatus === "storage_fallback") {
      parts.push("保存完了");
    } else if (state.receiptDraft.uploadStatus === "failed") {
      parts.push("再送待ち");
    }
    const legacyPendingCount = getLegacyPendingReceiptUploads(ctx).length;
    if (legacyPendingCount) {
      parts.push(`未送信レシートの再送待ち ${legacyPendingCount}件`);
    }
    const fallbackMessage = legacyPendingCount
      ? "送信待ちのレシートがあります。画像は残っているので、あとから再送できます。"
      : "画像やPDFを最大3ファイルまで選び、Gemini AI解析で内容を読み取ります。";
    els.receiptWorkflowStatus.classList.remove("hidden");
    els.receiptWorkflowStatus.textContent = parts.length
      ? `${parts.join(" / ")} - ${state.receiptFlowStatus.message || fallbackMessage}`
      : (state.receiptFlowStatus.message || fallbackMessage);
  }

  function renderPendingReceiptUploadQueue(ctx) {
    const { state, els, escapeHtml, truncateText } = ctx;
    if (!els.receiptPendingUploadPanel || !els.receiptPendingUploadSummary || !els.receiptPendingUploadMessage || !els.receiptPendingUploadList) return;
    const legacyJobs = getLegacyPendingReceiptUploads(ctx);
    if (!legacyJobs.length) {
      els.receiptPendingUploadPanel.classList.add("hidden");
      els.receiptPendingUploadList.innerHTML = "";
      els.receiptPendingUploadSummary.textContent = "0件";
      els.receiptPendingUploadMessage.textContent = "旧方式で保留になっているレシートはありません。";
      if (els.retryPendingReceiptUploadsButton) els.retryPendingReceiptUploadsButton.disabled = true;
      return;
    }
    const needsAuthCount = legacyJobs.filter((job) => job.status === "needs_auth").length;
    const retryableCount = legacyJobs.filter((job) => job.status === "retryable_error" || job.status === "failed").length;
    els.receiptPendingUploadPanel.classList.remove("hidden");
    els.receiptPendingUploadSummary.textContent = `${legacyJobs.length}件`;
    if (els.retryPendingReceiptUploadsButton) els.retryPendingReceiptUploadsButton.disabled = legacyJobs.length === 0;
    els.receiptPendingUploadMessage.textContent = legacyJobs.length
      ? (needsAuthCount > 0
        ? `旧方式のDrive確認待ち ${needsAuthCount}件 / 再送待ち ${retryableCount}件`
        : `旧方式の再送待ち ${retryableCount || legacyJobs.length}件。保存済み明細へあとから反映します。`)
      : "旧方式の未処理レシートはありません。";
    els.receiptPendingUploadList.innerHTML = legacyJobs.map((job) => {
      const statusLabel = job.status === "needs_auth"
        ? "Drive要確認"
        : job.status === "uploading"
          ? "保存中"
          : job.status === "queued"
            ? "保存待ち"
            : "再送待ち";
      const errorLine = job.lastError ? `<small class="muted">${escapeHtml(job.lastError)}</small>` : "";
      return `
        <div class="pending-receipt-upload-item">
          <div>
            <strong>${escapeHtml(truncateText(job.fileName || "レシート画像", 40))}</strong>
            <small class="muted">旧方式 / ${escapeHtml(job.recordIds.length)}件の明細にひも付け予定</small>
            ${errorLine}
          </div>
          <span class="status-pill status-${job.status === "needs_auth" ? "watch" : job.status === "uploading" ? "idle" : "warning"}">${statusLabel}</span>
        </div>
      `;
    }).join("");
  }

  function openReceiptInput(ctx, source) {
    const { els } = ctx;
    if (source === "camera") {
      els.receiptCameraFile?.click();
      return;
    }
    els.receiptFile?.click();
  }

  function toggleReceiptMoreActions(ctx) {
    const { els } = ctx;
    if (!els.receiptMoreActions) return;
    const willShow = els.receiptMoreActions.classList.contains("hidden");
    els.receiptMoreActions.classList.toggle("hidden", !willShow);
    if (els.receiptMoreToggle) {
      els.receiptMoreToggle.textContent = willShow ? "追加エリアを閉じる" : "ファイルを追加する";
    }
  }

  function scheduleAutoReceiptAnalyze(ctx) {
    const {
      state,
      clearReceiptAutoAnalyzeTimer,
      setReceiptAutoAnalyzeTimer,
      setReceiptAutoAnalyzeQueued,
      analyzeReceipt,
    } = ctx;
    clearReceiptAutoAnalyzeTimer();
    setReceiptAutoAnalyzeTimer(window.setTimeout(async () => {
      if (!state.receiptDraft.file) return;
      if (state.aiAnalyzeBusy && state.aiAnalyzeMode === "image") {
        setReceiptAutoAnalyzeQueued(true);
        return;
      }
      try {
        await analyzeReceipt({ automatic: true, source: "auto-selection" });
      } catch (error) {
        console.warn("Auto receipt analysis failed:", error);
      }
    }, 280));
  }

  function startReceiptImageAutomation(ctx, options = {}) {
    const { els, setText } = ctx;
    const message = String(options.message || "").trim();
    if (message) {
      setText(els.receiptMessage, message);
      setReceiptFlowStatus(ctx, { analyze: "queued", drive: "checking", message });
    }
    scheduleReceiptDrivePreflight(ctx);
    scheduleAutoReceiptAnalyze(ctx);
  }

  function scheduleReceiptDrivePreflight(ctx) {
    const {
      state,
      clearReceiptDrivePreflightTimer,
      setReceiptDrivePreflightTimer,
      ensureReceiptAssetStored,
    } = ctx;
    clearReceiptDrivePreflightTimer();
    state.receiptFlowStatus.drive = "checking";
    renderReceiptFlowStatus(ctx);
    setReceiptDrivePreflightTimer(window.setTimeout(async () => {
      if (!(state.receiptDraft.file || state.receiptQueue.length)) return;
      if (!state.currentUser) {
        setReceiptFlowStatus(ctx, {
          drive: "needs_auth",
          message: "画像はGoogle接続完了後に保存されます。選択はこのまま続けられます。",
        });
        return;
      }
      setReceiptFlowStatus(ctx, {
        drive: "checking",
        message: state.receiptFlowStatus.message || "画像を保存しています...",
      });
      const ready = await ensureReceiptAssetStored();
      if (ready) {
        setReceiptFlowStatus(ctx, {
          drive: "ready",
          message: "画像を保存しました。Driveへ保存する時は設定画面から同期できます。",
        });
      } else {
        setReceiptFlowStatus(ctx, {
          drive: "needs_auth",
          message: "画像の保存に失敗しました。内容は残りますが、画像を確実に残すには再度お試しください。",
        });
      }
    }, 180));
  }

  async function resumePendingReceiptUploads(ctx, options = {}) {
    const {
      state,
      getReceiptPendingUploadResumePromise,
      setReceiptPendingUploadResumePromise,
      processPendingReceiptUploadJob,
      getPendingReceiptUploadMeta,
    } = ctx;
    if (!state.currentUser || !state.pendingReceiptUploads.length) return false;
    const existingPromise = getReceiptPendingUploadResumePromise();
    if (existingPromise) return existingPromise;
    const interactive = options.interactive === true;
    const resumePromise = (async () => {
      const jobs = interactive
        ? [...state.pendingReceiptUploads]
        : state.pendingReceiptUploads.filter((job) => !String(job?.storageAssetId || "").trim());
      let anyAttempted = false;
      for (const job of jobs) {
        if (!getPendingReceiptUploadMeta(job.jobId)) continue;
        anyAttempted = true;
        // eslint-disable-next-line no-await-in-loop
        await processPendingReceiptUploadJob(job.jobId, {
          interactive,
          silent: options.silent === true,
        });
      }
      return anyAttempted;
    })();
    setReceiptPendingUploadResumePromise(resumePromise);
    try {
      return await resumePromise;
    } finally {
      setReceiptPendingUploadResumePromise(null);
    }
  }

  async function retryPendingReceiptUploads(ctx, options = {}) {
    const { state, showSyncToast } = ctx;
    if (!state.pendingReceiptUploads.length) {
      showSyncToast("未処理のレシートはありません。", "success", { duration: 2200 });
      return;
    }
    setReceiptFlowStatus(ctx, {
      drive: "checking",
      message: "未送信のレシートを再送しています。画像は保存されていますので、そのままお待ちください。",
    });
    await resumePendingReceiptUploads(ctx, {
      interactive: options.interactive === true,
      silent: false,
    });
  }

  global.KakeiboReceiptFeature = {
    getLegacyPendingReceiptUploads,
    hasLegacyPendingReceiptUploads,
    setReceiptFlowStatus,
    renderReceiptFlowStatus,
    renderPendingReceiptUploadQueue,
    openReceiptInput,
    toggleReceiptMoreActions,
    scheduleAutoReceiptAnalyze,
    startReceiptImageAutomation,
    scheduleReceiptDrivePreflight,
    resumePendingReceiptUploads,
    retryPendingReceiptUploads,
  };
})(window);
