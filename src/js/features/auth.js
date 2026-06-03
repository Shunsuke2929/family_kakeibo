(function registerKakeiboAuthFeature(global) {
  function syncAuthUI(ctx) {
    const { state, els, setText, userLabels = {}, updateConnectionStatusUI, updatePushNotificationUI } = ctx;
    const isLoggedIn = Boolean(state.currentUser);
    const shouldShowStartup = !isLoggedIn && state.authCheckInProgress;
    const shouldShowLoginCard = !isLoggedIn && !state.authCheckInProgress;
    els.startupView?.classList.toggle("hidden", !shouldShowStartup);
    els.loginView?.classList.toggle("hidden", !shouldShowLoginCard);
    els.appView?.classList.toggle("hidden", !isLoggedIn);
    els.logoutButton?.classList.toggle("hidden", !isLoggedIn);
    if (isLoggedIn) {
      const name = userLabels[state.currentUser.email] || state.currentUser.name || state.currentUser.email;
      els.userName.textContent = `${name}で利用中`;
      els.userMeta.textContent = "Google";
      setText(els.loginMessage, "");
    } else if (state.authCheckInProgress && state.lastGoogleUser) {
      const name = userLabels[state.lastGoogleUser.email] || state.lastGoogleUser.name || state.lastGoogleUser.email;
      els.userName.textContent = `${name}を確認中`;
      els.userMeta.textContent = "Google";
      setText(els.loginMessage, `${name} の Google 接続を確認しています。ログイン確認が終わるまで、そのままお待ちください。`);
    } else if (state.lastGoogleUser) {
      const name = userLabels[state.lastGoogleUser.email] || state.lastGoogleUser.name || state.lastGoogleUser.email;
      els.userName.textContent = `${name}は再接続待ち`;
      els.userMeta.textContent = "Google";
      if (state.authSessionDiagnostics?.cookiePresent === false) {
        setText(els.loginMessage, `${name} を前回利用しましたが、この端末のログイン保持が見つかりませんでした。自動再接続を試し、うまくいかない時だけ Google ボタンで続けてください。`);
      } else {
        setText(els.loginMessage, `${name} を前回利用しました。今は未接続です。共有データや Drive を使う時は、下の Google ボタンを押して再接続してください。`);
      }
    } else {
      els.userName.textContent = "Google未接続";
      els.userMeta.textContent = "Google";
      setText(els.loginMessage, "共有データを表示するには Google 接続が必要です。下の Google ボタンからログインしてください。");
    }
    updateConnectionStatusUI();
    updatePushNotificationUI();
  }

    function setupGoogleLogin(ctx) {
      const {
        config,
        state,
        els,
        setText,
        handleGoogleCredential,
        attemptAutoGoogleSignIn,
        syncAuthUI: syncAuthUIFn,
      } = ctx;
    const clientId = config.auth?.googleClientId;
    if (!clientId) {
      state.authCheckInProgress = false;
      syncAuthUIFn();
      setText(els.loginMessage, "config.js に Google Client ID を設定すると、本番のGoogleログインを利用できます。");
      return;
    }

    try {
      if (
        typeof google?.accounts?.id?.initialize !== "function"
        || typeof google?.accounts?.id?.renderButton !== "function"
      ) {
        throw new Error("google identity client not ready");
      }
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => handleGoogleCredential(response),
        auto_select: true,
        itp_support: true,
        use_fedcm_for_prompt: true,
        cancel_on_tap_outside: false,
      });
        google.accounts.id.renderButton(els.googleLoginContainer, {
          theme: "outline",
          size: "large",
          width: Math.min(window.innerWidth - 72, 360),
          text: "signin_with",
          shape: "pill",
        });
        syncAuthUIFn();
        if (!state.currentUser && state.lastGoogleUser && !state.rememberedSession?.sessionId) {
          attemptAutoGoogleSignIn({
            silent: true,
          });
        }
      } catch (error) {
      console.error(error);
      state.authCheckInProgress = false;
      syncAuthUIFn();
      if (!state.lastGoogleUser) {
        setText(els.loginMessage, "Google接続の準備が少し遅れています。必要な時にもう一度お試しください。");
      }
    }
  }

  function attemptAutoGoogleSignIn(ctx, options = {}) {
    const {
      state,
      els,
      userLabels = {},
      autoLoginUiTimeoutMs,
      autoLoginSilentTimeoutMs,
      setText,
      syncAuthUI: syncAuthUIFn,
      clearAutoLoginUiTimer,
      clearAutoLoginRevealTimer,
      setAutoLoginUiTimer,
      setAutoLoginRevealTimer,
    } = ctx;
    const force = Boolean(options.force);
    const silent = Boolean(options.silent);
    if (state.currentUser || (!force && state.autoLoginAttempted) || !window.google?.accounts?.id?.prompt) {
      return;
    }
    state.autoLoginAttempted = true;
    state.authCheckInProgress = true;
    syncAuthUIFn();
    const label = state.lastGoogleUser
      ? (userLabels[state.lastGoogleUser.email] || state.lastGoogleUser.name || state.lastGoogleUser.email)
      : "Googleアカウント";
    clearAutoLoginUiTimer();
    clearAutoLoginRevealTimer();
    if (silent) {
      setAutoLoginUiTimer(window.setTimeout(() => {
        if (state.currentUser) return;
        state.authCheckInProgress = false;
        syncAuthUIFn();
      }, autoLoginSilentTimeoutMs));
    }
    if (!silent) {
      setText(els.loginMessage, "");
      setAutoLoginUiTimer(window.setTimeout(() => {
        if (state.currentUser) return;
        clearAutoLoginRevealTimer();
        setAutoLoginRevealTimer(window.setTimeout(() => {
          if (state.currentUser) return;
          state.authCheckInProgress = false;
          syncAuthUIFn();
          setText(els.loginMessage, `${label} としてログインできませんでした。Google ログインを押して続けてください。`);
        }, 900));
      }, autoLoginUiTimeoutMs));
    }
    try {
      google.accounts.id.prompt((notification) => {
        if (!notification) return;
        const notDisplayed = typeof notification.isNotDisplayed === "function" && notification.isNotDisplayed();
        const skipped = typeof notification.isSkippedMoment === "function" && notification.isSkippedMoment();
        const dismissed = typeof notification.isDismissedMoment === "function" && notification.isDismissedMoment();
        if (notDisplayed || skipped || dismissed) {
          clearAutoLoginUiTimer();
          clearAutoLoginRevealTimer();
          state.authCheckInProgress = false;
          syncAuthUIFn();
          if (silent) {
            return;
          }
          clearAutoLoginUiTimer();
          clearAutoLoginRevealTimer();
          setAutoLoginRevealTimer(window.setTimeout(() => {
            if (state.currentUser) return;
            state.authCheckInProgress = false;
            syncAuthUIFn();
            setText(els.loginMessage, `${label} としてログインできませんでした。下の Google ボタンを押して続けてください。`);
          }, 900));
        }
      });
    } catch (error) {
      console.error(error);
      clearAutoLoginUiTimer();
      clearAutoLoginRevealTimer();
      state.authCheckInProgress = false;
      syncAuthUIFn();
      if (!silent) {
        setText(els.loginMessage, "Google セッションの自動確認に失敗しました。");
      }
    }
  }

  async function handleGoogleCredential(ctx, response) {
    const {
      state,
      els,
      userLabels = {},
      sessionIdTokenKey,
      setText,
      syncAuthUI: syncAuthUIFn,
      clearAutoLoginUiTimer,
        clearAutoLoginRevealTimer,
        resolveGoogleCredentialWaiters,
        establishBackendSession,
        applyAuthenticatedUser,
        saveRememberedSessionStorage,
        invalidateSessionRestore,
        clearIdTokenRefreshTimer,
        persist,
      runPostLoginBootstrap,
      getPassiveDriveFolderId,
      updateConnectionStatusUI,
      resetForm,
      resetTransferForm,
      resetChildForm,
      renderAll,
      hasLegacyPendingReceiptUploads,
      resumePendingReceiptUploads,
      refreshPushNotificationStatus,
      maybeNotifyAppVersionUpdate,
    } = ctx;
    try {
        clearAutoLoginUiTimer();
        clearAutoLoginRevealTimer();
        state.authCheckInProgress = false;
        invalidateSessionRestore();
        const previousEmail = state.currentUser?.email || "";
        const payload = JSON.parse(atob(response.credential.split(".")[1]));
      const sessionPayload = await establishBackendSession(response.credential);
      const sessionUser = sessionPayload?.user || {};
      const userEmail = String(sessionUser.email || payload.email || "").trim().toLowerCase();
      const userName = sessionUser.name || payload.name || userLabels[userEmail] || userEmail;
      clearIdTokenRefreshTimer();
      applyAuthenticatedUser({
        email: userEmail,
        name: userName,
        provider: "google",
      }, {
        authMode: sessionPayload?.session?.authMethod || "cookie_session",
        sessionId: String(sessionPayload?.session?.sessionId || "").trim(),
        expiresAt: String(sessionPayload?.session?.expiresAt || "").trim(),
      });
      saveRememberedSessionStorage({
        sessionId: String(sessionPayload?.session?.sessionId || "").trim(),
        expiresAt: String(sessionPayload?.session?.expiresAt || "").trim(),
        email: userEmail,
        name: userName,
        authMethod: String(sessionPayload?.session?.authMethod || "cookie_session").trim() || "cookie_session",
        savedAt: new Date().toISOString(),
      });
      state.autoLoginAttempted = true;
      state.authCheckInProgress = false;
      sessionStorage.removeItem(sessionIdTokenKey);
      persist({ skipRemote: true });
      syncAuthUIFn();
      resolveGoogleCredentialWaiters(true);
      await runPostLoginBootstrap({
        silent: previousEmail === userEmail,
        includePeripheral: false,
      });
      state.authCheckInProgress = false;
      state.driveStatus = {
        ...state.driveStatus,
        google: "ready",
        drive: "unknown",
        folder: getPassiveDriveFolderId() ? "configured" : "missing",
        message: "Drive は必要になった時か設定画面で確認します。",
      };
      syncAuthUIFn();
      updateConnectionStatusUI();
      if (previousEmail !== userEmail) {
        resetForm();
        resetTransferForm();
        resetChildForm();
      }
      renderAll();
      if (hasLegacyPendingReceiptUploads()) {
        resumePendingReceiptUploads({ interactive: false, silent: true }).catch(() => {});
      }
      await refreshPushNotificationStatus({ forceConfig: true }).catch(() => {});
      await maybeNotifyAppVersionUpdate();
      setText(els.loginMessage, "");
    } catch (error) {
      console.error(error);
      state.authCheckInProgress = false;
      resolveGoogleCredentialWaiters(false);
      syncAuthUIFn();
      setText(els.loginMessage, "Googleログイン処理に失敗しました。");
    }
  }

  global.KakeiboAuthFeature = {
    syncAuthUI,
    setupGoogleLogin,
    attemptAutoGoogleSignIn,
    handleGoogleCredential,
  };
})(window);
