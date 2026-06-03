package YOUR_ANDROID_PACKAGE_NAME;

import android.net.Uri;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

public class KakeiboLauncherActivity extends LauncherActivity {
    private static final String SOURCE_PARAM = "source";
    private static final String SOURCE_VALUE = "android-twa";

    @Override
    protected Uri getLaunchingUrl() {
        Uri launchUrl = Uri.parse(getString(R.string.launch_url));
        Uri incoming = getIntent() != null ? getIntent().getData() : null;

        if (incoming != null && isTrustedHost(incoming, launchUrl)) {
            return withSourceParam(incoming);
        }
        return withSourceParam(launchUrl);
    }

    private boolean isTrustedHost(Uri incoming, Uri launchUrl) {
        if (incoming == null || launchUrl == null) return false;
        String expectedScheme = String.valueOf(launchUrl.getScheme()).trim().toLowerCase();
        String expectedHost = String.valueOf(launchUrl.getHost()).trim().toLowerCase();
        String actualScheme = String.valueOf(incoming.getScheme()).trim().toLowerCase();
        String actualHost = String.valueOf(incoming.getHost()).trim().toLowerCase();
        return !expectedScheme.isEmpty()
            && !expectedHost.isEmpty()
            && expectedScheme.equals(actualScheme)
            && expectedHost.equals(actualHost);
    }

    private Uri withSourceParam(Uri uri) {
        if (uri == null) return Uri.parse(getString(R.string.launch_url));
        if (uri.getQueryParameter(SOURCE_PARAM) != null) {
            return uri;
        }
        return uri.buildUpon()
            .appendQueryParameter(SOURCE_PARAM, SOURCE_VALUE)
            .build();
    }
}
