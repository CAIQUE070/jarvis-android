package com.caique.jarvis;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String EDGE_USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            + "AppleWebKit/537.36 (KHTML, like Gecko) "
            + "Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Capacitor creates the WebView during super.onCreate(). Reload it with
        // Edge's user agent so the app can use the exact same neural voice as
        // the PC version without ever invoking Android's built-in TTS voices.
        getBridge()
            .getWebView()
            .getSettings()
            .setUserAgentString(EDGE_USER_AGENT);
        getBridge().getWebView().reload();
    }
}

