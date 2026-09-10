package com.cueai.android.overlay;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import com.cueai.android.MainActivity;
import com.cueai.android.R;

import java.util.concurrent.Executor;
import java.util.function.Consumer;

/**
 * Floating CueAI overlay.
 *
 * Presenter Privacy Mode: Android cannot exclude a third-party overlay from
 * MediaProjection while keeping it visible (FLAG_SECURE blacks the Meet share).
 * Instead, when privacy is on and screen sharing/recording is detected, we
 * temporarily remove the overlay from the display so entire-screen share stays
 * clean — then restore it when sharing stops.
 */
public class OverlayService extends Service {
    public static final String ACTION_START = "com.cueai.android.overlay.START";
    public static final String ACTION_STOP = "com.cueai.android.overlay.STOP";
    public static final String ACTION_SET_PRIVACY = "com.cueai.android.overlay.SET_PRIVACY";
    public static final String ACTION_HIDE_FOR_SHARE = "com.cueai.android.overlay.HIDE_FOR_SHARE";
    public static final String ACTION_SHOW = "com.cueai.android.overlay.SHOW";
    public static final String ACTION_PEEK = "com.cueai.android.overlay.PEEK";
    public static final String EXTRA_PRIVACY = "privacyOn";
    public static final String EXTRA_HOST = "host";

    private static final String CHANNEL_ID = "cueai_overlay";
    private static final int NOTIFICATION_ID = 4201;
    private static final long PEEK_MS = 8000L;
    /** With Privacy on, hide from display after a short intro so Meet Present stays clear. */
    private static final long PRIVACY_AUTO_HIDE_MS = 2500L;

    private static volatile boolean running = false;
    private static volatile boolean minimized = false;
    private static volatile boolean privacyOn = true;
    private static volatile boolean screenRecordingVisible = false;
    private static volatile boolean hiddenForShare = false;
    private static volatile boolean manualHide = false;
    /** Only auto-hide after a NOT_VISIBLE → VISIBLE transition (avoids false positives on start). */
    private static volatile boolean autoHideArmed = false;
    private static volatile OverlayPlugin pluginRef;

    private WindowManager windowManager;
    private View panelView;
    private View bubbleView;
    private WindowManager.LayoutParams panelParams;
    private WindowManager.LayoutParams bubbleParams;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Consumer<Integer> recordingCallback;
    private final Executor mainExecutor = runnable -> handler.post(runnable);

    private TextView answerText;
    private TextView transcriptSpeaker;
    private TextView transcriptText;
    private TextView captureBanner;
    private TextView privacyBtn;
    private TextView modeAssist;
    private TextView modeSuggest;
    private TextView modeFollowup;
    private TextView modeRecap;
    private EditText askInput;
    private View bubblePrivacyBadge;

    private int transcriptIndex = 0;
    private String activeMode = "assist";
    private String lang = "EN";
    private String latestAnswer = "";

    private final String[][] transcriptLines = new String[][]{
            {"Priya", "Can you walk us through how CueAI handles screen context during a live demo?"},
            {"You", "Absolutely — we use on-device OCR with Presenter Privacy Mode so shared content stays private."},
            {"Marcus", "And what’s the difference between Assist and Suggest during a call?"}
    };

    private final Runnable transcriptTicker = new Runnable() {
        @Override
        public void run() {
            if (!running || panelView == null || minimized || hiddenForShare) {
                handler.postDelayed(this, 4200);
                return;
            }
            transcriptIndex = (transcriptIndex + 1) % transcriptLines.length;
            updateTranscript();
            handler.postDelayed(this, 4200);
        }
    };

    private final Runnable endPeekRunnable = () -> {
        if (running && shouldHideForShare()) {
            applyShareVisibility();
            refreshNotification();
            emitState();
        }
    };

    /** Meet Present often does not fire a one-shot callback — poll OS recording state. */
    private final Runnable sharePollRunnable = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            boolean was = screenRecordingVisible;
            refreshRecordingStateFromOs();
            if (autoHideArmed && privacyOn) {
                if (screenRecordingVisible && !hiddenForShare) {
                    applyShareVisibility();
                    refreshNotification();
                    emitState();
                } else if (!screenRecordingVisible && was && hiddenForShare && !manualHide) {
                    applyShareVisibility();
                    refreshNotification();
                    emitState();
                }
            }
            handler.postDelayed(this, 1500);
        }
    };

    /**
     * Privacy Mode safe default: remove overlay from the display so entire-screen
     * Meet Present cannot capture it (and no FLAG_SECURE black box).
     */
    private final Runnable privacyAutoHideRunnable = () -> {
        if (!running || !privacyOn) return;
        manualHide = true;
        applyShareVisibility();
        refreshNotification();
        emitState();
    };

    public static void setPlugin(OverlayPlugin plugin) {
        pluginRef = plugin;
    }

    public static boolean isRunning() {
        return running;
    }

    public static boolean isMinimized() {
        return minimized;
    }

    public static boolean isPrivacyOn() {
        return privacyOn;
    }

    public static boolean isHiddenForShare() {
        return hiddenForShare;
    }

    public static boolean canDrawOverlays(Context context) {
        return Settings.canDrawOverlays(context);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        createNotificationChannel();
        registerRecordingCallback();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopOverlay();
            return START_NOT_STICKY;
        }

        if (ACTION_SET_PRIVACY.equals(action)) {
            privacyOn = intent.getBooleanExtra(EXTRA_PRIVACY, true);
            if (!privacyOn) {
                manualHide = false;
                handler.removeCallbacks(privacyAutoHideRunnable);
            } else {
                schedulePrivacyAutoHide();
            }
            applyPrivacyUi();
            applyShareVisibility();
            refreshNotification();
            emitState();
            return START_STICKY;
        }

        if (ACTION_HIDE_FOR_SHARE.equals(action)) {
            manualHide = true;
            applyShareVisibility();
            refreshNotification();
            emitState();
            return START_STICKY;
        }

        if (ACTION_SHOW.equals(action)) {
            forceShowOverlay();
            return START_STICKY;
        }

        if (ACTION_PEEK.equals(action)) {
            peekWhileSharing();
            return START_STICKY;
        }

        // Fresh start: always show the floating panel first.
        privacyOn = intent.getBooleanExtra(EXTRA_PRIVACY, true);
        manualHide = false;
        hiddenForShare = false;
        autoHideArmed = false;
        startForeground(NOTIFICATION_ID, buildNotification());

        if (!canDrawOverlays(this)) {
            stopSelf();
            running = false;
            emitState();
            return START_NOT_STICKY;
        }

        if (panelView == null) {
            showPanel();
        } else {
            applyPrivacyUi();
            attachOverlayViews(false);
        }

        running = true;
        minimized = false;
        hiddenForShare = false;
        refreshNotification();
        emitState();
        handler.removeCallbacks(transcriptTicker);
        handler.postDelayed(transcriptTicker, 4200);
        // Arm auto-hide, then immediately honor an already-active share/recording.
        handler.postDelayed(() -> {
            autoHideArmed = true;
            refreshRecordingStateFromOs();
            if (privacyOn && screenRecordingVisible) {
                applyShareVisibility();
                refreshNotification();
                emitState();
            }
        }, 1200);
        handler.removeCallbacks(sharePollRunnable);
        handler.postDelayed(sharePollRunnable, 1800);
        // Privacy on: do not rely on Meet detection — hide from display after a short intro.
        schedulePrivacyAutoHide();
        return START_STICKY;
    }

    private void schedulePrivacyAutoHide() {
        handler.removeCallbacks(privacyAutoHideRunnable);
        if (!privacyOn) return;
        handler.postDelayed(privacyAutoHideRunnable, PRIVACY_AUTO_HIDE_MS);
    }

    private void registerRecordingCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || windowManager == null) {
            return;
        }
        recordingCallback = state -> handler.post(() -> {
            boolean wasVisible = screenRecordingVisible;
            screenRecordingVisible = state == WindowManager.SCREEN_RECORDING_STATE_VISIBLE;

            if (!screenRecordingVisible) {
                if (!manualHide && running && hiddenForShare) {
                    applyShareVisibility();
                    refreshNotification();
                    emitState();
                }
                return;
            }

            // Hide whenever share/recording is active (not only rising edge).
            if (autoHideArmed && privacyOn && screenRecordingVisible) {
                applyShareVisibility();
                refreshNotification();
                emitState();
            } else if (!wasVisible) {
                // keep state for when we arm
            }
        });
        try {
            int current = windowManager.addScreenRecordingCallback(mainExecutor, recordingCallback);
            screenRecordingVisible = current == WindowManager.SCREEN_RECORDING_STATE_VISIBLE;
        } catch (Exception ignored) {
            recordingCallback = null;
            screenRecordingVisible = false;
        }
    }

    /** Re-query OS recording flag (Meet Present is flaky with one-shot callbacks). */
    private void refreshRecordingStateFromOs() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || windowManager == null) {
            return;
        }
        if (recordingCallback == null) {
            registerRecordingCallback();
            return;
        }
        try {
            windowManager.removeScreenRecordingCallback(recordingCallback);
            int current = windowManager.addScreenRecordingCallback(mainExecutor, recordingCallback);
            screenRecordingVisible = current == WindowManager.SCREEN_RECORDING_STATE_VISIBLE;
        } catch (Exception ignored) {
            // keep last known screenRecordingVisible
        }
    }

    private void unregisterRecordingCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || windowManager == null || recordingCallback == null) {
            return;
        }
        try {
            windowManager.removeScreenRecordingCallback(recordingCallback);
        } catch (Exception ignored) {
        }
        recordingCallback = null;
    }

    private boolean shouldHideForShare() {
        if (!privacyOn) return false;
        if (manualHide) return true;
        // Auto-hide only when armed and OS reports an active share/recording.
        return autoHideArmed && screenRecordingVisible;
    }

    private void forceShowOverlay() {
        handler.removeCallbacks(privacyAutoHideRunnable);
        manualHide = false;
        hiddenForShare = false;
        handler.removeCallbacks(endPeekRunnable);
        if (panelView == null) {
            showPanel();
        }
        attachOverlayViews(false);
        refreshNotification();
        emitState();
        // If Privacy stays on, hide again soon so an accidental Show during Present doesn't leak.
        if (privacyOn) {
            schedulePrivacyAutoHide();
        }
    }

    private void applyShareVisibility() {
        boolean hide = shouldHideForShare();
        if (hide) {
            handler.removeCallbacks(endPeekRunnable);
            detachOverlayViews();
            hiddenForShare = true;
            minimized = false;
        } else {
            hiddenForShare = false;
            if (running || panelView != null) {
                attachOverlayViews(false);
            }
        }
    }

    private void peekWhileSharing() {
        if (!running && panelView == null) return;
        running = true;
        manualHide = false;
        hiddenForShare = false;
        attachOverlayViews(false);
        refreshNotification();
        emitState();
        handler.removeCallbacks(endPeekRunnable);
        // Re-hide only if still actually sharing / manual hide requested again.
        handler.postDelayed(() -> {
            if (running && (screenRecordingVisible || manualHide) && privacyOn) {
                manualHide = screenRecordingVisible || manualHide;
                applyShareVisibility();
                refreshNotification();
                emitState();
            }
        }, PEEK_MS);
    }

    private void detachOverlayViews() {
        try {
            if (panelView != null && panelView.getParent() != null) {
                windowManager.removeView(panelView);
            }
            if (bubbleView != null && bubbleView.getParent() != null) {
                windowManager.removeView(bubbleView);
            }
        } catch (Exception ignored) {
        }
    }

    private void attachOverlayViews(boolean asBubble) {
        if (panelView == null || bubbleView == null || windowManager == null) return;
        try {
            if (asBubble) {
                if (panelView.getParent() != null) windowManager.removeView(panelView);
                if (bubbleView.getParent() == null) windowManager.addView(bubbleView, bubbleParams);
                minimized = true;
            } else {
                if (bubbleView.getParent() != null) windowManager.removeView(bubbleView);
                if (panelView.getParent() == null) windowManager.addView(panelView, panelParams);
                minimized = false;
            }
        } catch (Exception ignored) {
        }
    }

    private void showPanel() {
        LayoutInflater inflater = LayoutInflater.from(this);
        panelView = inflater.inflate(R.layout.overlay_panel, null);
        bubbleView = inflater.inflate(R.layout.overlay_bubble, null);

        bindPanelViews();
        bindBubbleViews();
        setMode("assist");
        applyPrivacyUi();

        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        panelParams = new WindowManager.LayoutParams(
                dp(340),
                WindowManager.LayoutParams.WRAP_CONTENT,
                overlayType,
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                PixelFormat.TRANSLUCENT
        );
        panelParams.gravity = Gravity.TOP | Gravity.START;
        panelParams.x = dp(18);
        panelParams.y = dp(120);

        bubbleParams = new WindowManager.LayoutParams(
                dp(58),
                dp(58),
                overlayType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
        );
        bubbleParams.gravity = Gravity.TOP | Gravity.START;
        bubbleParams.x = dp(300);
        bubbleParams.y = dp(520);

        enableDrag(panelView.findViewById(R.id.overlay_header), panelParams, panelView, true);
        enableDrag(bubbleView, bubbleParams, bubbleView, false);

        // Always attach on create — share-hide is applied separately after start.
        try {
            windowManager.addView(panelView, panelParams);
            hiddenForShare = false;
        } catch (Exception e) {
            // Permission revoked or WM rejected the view.
            hiddenForShare = true;
        }
    }

    private void bindPanelViews() {
        answerText = panelView.findViewById(R.id.answer_text);
        transcriptSpeaker = panelView.findViewById(R.id.transcript_speaker);
        transcriptText = panelView.findViewById(R.id.transcript_text);
        captureBanner = panelView.findViewById(R.id.capture_banner);
        privacyBtn = panelView.findViewById(R.id.btn_privacy);
        modeAssist = panelView.findViewById(R.id.mode_assist);
        modeSuggest = panelView.findViewById(R.id.mode_suggest);
        modeFollowup = panelView.findViewById(R.id.mode_followup);
        modeRecap = panelView.findViewById(R.id.mode_recap);
        askInput = panelView.findViewById(R.id.ask_input);
        TextView btnMinimize = panelView.findViewById(R.id.btn_minimize);
        TextView btnWhatToSay = panelView.findViewById(R.id.btn_what_to_say);
        TextView btnLang = panelView.findViewById(R.id.btn_lang);
        TextView btnSend = panelView.findViewById(R.id.btn_send);
        TextView btnHideShare = panelView.findViewById(R.id.btn_hide_share);

        privacyBtn.setOnClickListener(v -> {
            privacyOn = !privacyOn;
            if (!privacyOn) {
                manualHide = false;
                handler.removeCallbacks(privacyAutoHideRunnable);
            } else {
                schedulePrivacyAutoHide();
            }
            applyPrivacyUi();
            applyShareVisibility();
            refreshNotification();
            emitState();
        });

        btnMinimize.setOnClickListener(v -> minimizeToBubble());
        btnWhatToSay.setOnClickListener(v -> setMode("suggest"));
        modeAssist.setOnClickListener(v -> setMode("assist"));
        modeSuggest.setOnClickListener(v -> setMode("suggest"));
        modeFollowup.setOnClickListener(v -> setMode("followup"));
        modeRecap.setOnClickListener(v -> setMode("recap"));
        if (btnHideShare != null) {
            btnHideShare.setOnClickListener(v -> {
                manualHide = true;
                applyShareVisibility();
                refreshNotification();
                emitState();
            });
        }

        btnLang.setOnClickListener(v -> {
            if ("EN".equals(lang)) lang = "ES";
            else if ("ES".equals(lang)) lang = "HI";
            else lang = "EN";
            btnLang.setText(lang);
        });

        btnSend.setOnClickListener(v -> runQuery());
        askInput.setOnEditorActionListener((tv, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                runQuery();
                return true;
            }
            return false;
        });

        askInput.setOnFocusChangeListener((v, hasFocus) -> {
            if (panelParams == null || panelView == null || panelView.getParent() == null) return;
            if (hasFocus) {
                panelParams.flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;
            } else {
                panelParams.flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH;
            }
            windowManager.updateViewLayout(panelView, panelParams);
        });
    }

    private void bindBubbleViews() {
        bubblePrivacyBadge = bubbleView.findViewById(R.id.bubble_privacy_badge);
    }

    private void setMode(String mode) {
        activeMode = mode;
        modeAssist.setSelected("assist".equals(mode));
        modeSuggest.setSelected("suggest".equals(mode));
        modeFollowup.setSelected("followup".equals(mode));
        modeRecap.setSelected("recap".equals(mode));
        String reply = replyFor(mode);
        latestAnswer = reply;
        answerText.setText(reply);
        refreshNotification();
    }

    private String replyFor(String mode) {
        switch (mode) {
            case "suggest":
                return "Try saying: “We keep visual context on-device, and Presenter Privacy Mode ensures the assistant never appears in your shared screen — so demos stay clean for everyone else.”";
            case "followup":
                return "Good follow-ups:\n• Is transcription processed on-device or in the cloud?\n• Can privacy mode be enforced by admin policy?\n• How does RAG respect document ACLs?";
            case "recap":
                return "So far: Priya asked about screen context; you explained on-device OCR + privacy mode. Marcus wants Assist vs Suggest clarified next.";
            case "assist":
            default:
                return "Screen context is captured locally with OCR/vision cues. Presenter Privacy Mode hides the CueAI overlay from screen share and recordings while still feeding you answers privately.";
        }
    }

    private void runQuery() {
        String q = askInput.getText() != null ? askInput.getText().toString().trim() : "";
        if (q.isEmpty()) {
            setMode("assist");
            return;
        }
        String reply =
                "Based on your meeting and knowledge base:\n\n“" + q + "”\n\nCueAI recommends anchoring on Presenter Privacy Mode so this separate overlay window is excluded from Zoom / Meet / Teams screen share while still assisting you privately.";
        latestAnswer = reply;
        answerText.setText(reply);
        askInput.setText("");
        askInput.clearFocus();
        refreshNotification();
    }

    private void updateTranscript() {
        if (transcriptSpeaker == null || transcriptText == null) return;
        transcriptSpeaker.setText(transcriptLines[transcriptIndex][0]);
        transcriptText.setText(transcriptLines[transcriptIndex][1]);
    }

    private void applyPrivacyUi() {
        if (privacyBtn != null) {
            privacyBtn.setText(privacyOn ? R.string.overlay_privacy_on : R.string.overlay_privacy_off);
            privacyBtn.setBackgroundResource(privacyOn ? R.drawable.overlay_privacy_on : R.drawable.overlay_privacy_off);
            privacyBtn.setTextColor(getColor(privacyOn ? R.color.cue_teal_bright : R.color.cue_danger));
        }
        if (captureBanner != null) {
            captureBanner.setText(privacyOn ? R.string.overlay_hidden_banner : R.string.overlay_visible_banner);
            captureBanner.setBackgroundResource(privacyOn ? R.drawable.overlay_privacy_on : R.drawable.overlay_privacy_off);
            captureBanner.setTextColor(getColor(privacyOn ? R.color.cue_teal_bright : R.color.cue_danger));
        }
        if (bubblePrivacyBadge != null) {
            bubblePrivacyBadge.setVisibility(privacyOn ? View.VISIBLE : View.GONE);
        }
    }

    private void minimizeToBubble() {
        if (panelView == null || bubbleView == null || hiddenForShare) return;
        if (panelView.getParent() != null) {
            bubbleParams.x = panelParams.x + dp(260);
            bubbleParams.y = panelParams.y + dp(20);
            windowManager.removeView(panelView);
        }
        if (bubbleView.getParent() == null) {
            windowManager.addView(bubbleView, bubbleParams);
        }
        minimized = true;
        emitState();
    }

    private void expandFromBubble() {
        if (panelView == null || bubbleView == null || hiddenForShare) return;
        if (bubbleView.getParent() != null) {
            panelParams.x = Math.max(dp(8), bubbleParams.x - dp(200));
            panelParams.y = Math.max(dp(40), bubbleParams.y - dp(20));
            windowManager.removeView(bubbleView);
        }
        if (panelView.getParent() == null) {
            windowManager.addView(panelView, panelParams);
        }
        minimized = false;
        emitState();
    }

    private void enableDrag(View handle, WindowManager.LayoutParams params, View target, boolean panel) {
        handle.setOnTouchListener(new View.OnTouchListener() {
            private int startX;
            private int startY;
            private float touchX;
            private float touchY;
            private boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = params.x;
                        startY = params.y;
                        touchX = event.getRawX();
                        touchY = event.getRawY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = Math.round(event.getRawX() - touchX);
                        int dy = Math.round(event.getRawY() - touchY);
                        if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
                        params.x = Math.max(0, startX + dx);
                        params.y = Math.max(0, startY + dy);
                        if (target.getParent() != null) {
                            windowManager.updateViewLayout(target, params);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!panel && !moved) {
                            expandFromBubble();
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });
    }

    private void stopOverlay() {
        handler.removeCallbacks(transcriptTicker);
        handler.removeCallbacks(endPeekRunnable);
        handler.removeCallbacks(sharePollRunnable);
        handler.removeCallbacks(privacyAutoHideRunnable);
        unregisterRecordingCallback();
        detachOverlayViews();
        panelView = null;
        bubbleView = null;
        running = false;
        minimized = false;
        hiddenForShare = false;
        manualHide = false;
        screenRecordingVisible = false;
        autoHideArmed = false;
        emitState();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void emitState() {
        OverlayPlugin plugin = pluginRef;
        if (plugin != null) {
            String state;
            if (!running) state = "stopped";
            else if (hiddenForShare) state = "hidden";
            else if (minimized) state = "minimized";
            else state = "running";
            plugin.emitOverlayState(state, privacyOn, hiddenForShare);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.overlay_channel_name),
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(getString(R.string.overlay_channel_desc));
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private void refreshNotification() {
        if (!running) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(
                this, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, OverlayService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(
                this, 1, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(openPi)
                .addAction(0, getString(R.string.overlay_stop), stopPi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true);

        if (hiddenForShare) {
            builder.setContentTitle(getString(R.string.overlay_hidden_notification_title))
                    .setContentText(getString(R.string.overlay_hidden_notification_text));
            if (latestAnswer != null && !latestAnswer.isEmpty()) {
                builder.setStyle(new NotificationCompat.BigTextStyle().bigText(latestAnswer));
            }
            Intent showIntent = new Intent(this, OverlayService.class);
            showIntent.setAction(ACTION_SHOW);
            PendingIntent showPi = PendingIntent.getService(
                    this, 4, showIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            builder.addAction(0, getString(R.string.overlay_show), showPi);

            Intent peekIntent = new Intent(this, OverlayService.class);
            peekIntent.setAction(ACTION_PEEK);
            PendingIntent peekPi = PendingIntent.getService(
                    this, 2, peekIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            builder.addAction(0, getString(R.string.overlay_peek), peekPi);
        } else {
            builder.setContentTitle(getString(R.string.overlay_notification_title))
                    .setContentText(getString(R.string.overlay_notification_text));
            if (privacyOn) {
                Intent hideIntent = new Intent(this, OverlayService.class);
                hideIntent.setAction(ACTION_HIDE_FOR_SHARE);
                PendingIntent hidePi = PendingIntent.getService(
                        this, 3, hideIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                builder.addAction(0, getString(R.string.overlay_hide_for_share), hidePi);
            }
        }

        return builder.build();
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(transcriptTicker);
        handler.removeCallbacks(endPeekRunnable);
        handler.removeCallbacks(sharePollRunnable);
        handler.removeCallbacks(privacyAutoHideRunnable);
        unregisterRecordingCallback();
        detachOverlayViews();
        running = false;
        minimized = false;
        hiddenForShare = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
