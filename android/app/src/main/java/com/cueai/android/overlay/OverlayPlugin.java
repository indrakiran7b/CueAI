package com.cueai.android.overlay;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CueOverlay")
public class OverlayPlugin extends Plugin {

    @Override
    public void load() {
        OverlayService.setPlugin(this);
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", OverlayService.canDrawOverlays(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (OverlayService.canDrawOverlays(getContext())) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }

        Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);

        JSObject ret = new JSObject();
        ret.put("granted", false);
        ret.put("openedSettings", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!OverlayService.canDrawOverlays(getContext())) {
            call.reject("Display over other apps permission is required.");
            return;
        }

        boolean privacyOn = call.getBoolean("privacyOn", true);
        String host = call.getString("host", "meet");

        Intent intent = new Intent(getContext(), OverlayService.class);
        intent.setAction(OverlayService.ACTION_START);
        intent.putExtra(OverlayService.EXTRA_PRIVACY, privacyOn);
        intent.putExtra(OverlayService.EXTRA_HOST, host);

        ContextCompat.startForegroundService(getContext(), intent);

        if (getActivity() != null) {
            getActivity().moveTaskToBack(true);
        }

        JSObject ret = new JSObject();
        ret.put("running", true);
        ret.put("privacyOn", privacyOn);
        ret.put("hiddenForShare", OverlayService.isHiddenForShare());
        call.resolve(ret);
        emitOverlayState("running", privacyOn, OverlayService.isHiddenForShare());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), OverlayService.class);
        intent.setAction(OverlayService.ACTION_STOP);
        getContext().startService(intent);

        JSObject ret = new JSObject();
        ret.put("running", false);
        ret.put("hiddenForShare", false);
        call.resolve(ret);
        emitOverlayState("stopped", OverlayService.isPrivacyOn(), false);
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", OverlayService.isRunning());
        ret.put("minimized", OverlayService.isMinimized());
        ret.put("privacyOn", OverlayService.isPrivacyOn());
        ret.put("hiddenForShare", OverlayService.isHiddenForShare());
        call.resolve(ret);
    }

    @PluginMethod
    public void setPrivacy(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        Intent intent = new Intent(getContext(), OverlayService.class);
        intent.setAction(OverlayService.ACTION_SET_PRIVACY);
        intent.putExtra(OverlayService.EXTRA_PRIVACY, enabled);
        getContext().startService(intent);

        JSObject ret = new JSObject();
        ret.put("privacyOn", enabled);
        ret.put("hiddenForShare", OverlayService.isHiddenForShare());
        call.resolve(ret);
    }

    @PluginMethod
    public void hideForShare(PluginCall call) {
        Intent intent = new Intent(getContext(), OverlayService.class);
        intent.setAction(OverlayService.ACTION_HIDE_FOR_SHARE);
        getContext().startService(intent);
        JSObject ret = new JSObject();
        ret.put("hiddenForShare", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void show(PluginCall call) {
        Intent intent = new Intent(getContext(), OverlayService.class);
        intent.setAction(OverlayService.ACTION_SHOW);
        getContext().startService(intent);
        JSObject ret = new JSObject();
        ret.put("hiddenForShare", false);
        call.resolve(ret);
    }

    public void emitOverlayState(String state, boolean privacyOn, boolean hiddenForShare) {
        JSObject data = new JSObject();
        data.put("state", state);
        data.put("privacyOn", privacyOn);
        data.put("hiddenForShare", hiddenForShare);
        notifyListeners("overlayState", data);
    }
}
