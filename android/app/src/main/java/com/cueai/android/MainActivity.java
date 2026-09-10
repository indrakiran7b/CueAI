package com.cueai.android;

import android.os.Bundle;

import com.cueai.android.overlay.OverlayPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OverlayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
