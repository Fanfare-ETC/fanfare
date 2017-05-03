package edu.cmu.etc.fanfare.playbook;

import android.app.Activity;
import android.app.Dialog;
import android.app.DialogFragment;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.os.Bundle;
import android.support.v4.content.ContextCompat;
import android.support.v7.app.AlertDialog;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.SparseArray;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;
import java.util.Queue;

public class PredictionFragment extends WebViewFragment {
    private static final String TAG = PredictionFragment.class.getSimpleName();

    private static final String PREF_NAME = "prediction";
    private static final String PREF_KEY_GAME_STATE = "gameState";
    private static final String PREF_KEY_FIRST_LOAD = "firstLoad";

    private static final SparseArray<String> PLAYBOOK_EVENTS = new SparseArray<String>();

    private JSONObject mGameState;
    private boolean mIsAttached;
    private Queue<JSONObject> mPendingEvents = new LinkedList<>();

    private AlertDialog mCorrectDialog;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SharedPreferences prefs = getActivity().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);

        if (prefs.getBoolean(PREF_KEY_FIRST_LOAD, true)) {
            showTutorial();
            prefs.edit().putBoolean(PREF_KEY_FIRST_LOAD, false).apply();
        }

        // We use SharedPreference because the savedInstanceState doesn't work
        // if the fragment doesn't have an ID.
        try {
            String gameState = prefs.getString(PREF_KEY_GAME_STATE, null);
            if (gameState != null) {
                Log.d(TAG, "Restoring game state from bundle: " + gameState);
                mGameState = new JSONObject(gameState);
            } else {
                Log.d(TAG, "Game state doesn't exist, creating initial state");
                mGameState = createInitialGameState();
            }
        } catch (JSONException e) {
            e.printStackTrace();
        }

        // Populate the events.
        PLAYBOOK_EVENTS.append(0, "SHUTOUT_INNING");
        PLAYBOOK_EVENTS.append(1, "RUN_SCORED");
        PLAYBOOK_EVENTS.append(2, "FLY_OUT");
        PLAYBOOK_EVENTS.append(3, "TRIPLE_PLAY");
        PLAYBOOK_EVENTS.append(4, "DOUBLE_PLAY");
        PLAYBOOK_EVENTS.append(5, "GROUND_OUT");
        PLAYBOOK_EVENTS.append(6, "STEAL");
        PLAYBOOK_EVENTS.append(7, "PICK_OFF");
        PLAYBOOK_EVENTS.append(8, "WALK");
        PLAYBOOK_EVENTS.append(9, "BLOCKED_RUN");
        PLAYBOOK_EVENTS.append(10, "STRIKEOUT");
        PLAYBOOK_EVENTS.append(11, "HIT_BY_PITCH");
        PLAYBOOK_EVENTS.append(12, "HOME_RUN");
        PLAYBOOK_EVENTS.append(13, "PITCH_COUNT_16");
        PLAYBOOK_EVENTS.append(14, "PITCH_COUNT_17");
        PLAYBOOK_EVENTS.append(15, "SINGLE");
        PLAYBOOK_EVENTS.append(16, "DOUBLE");
        PLAYBOOK_EVENTS.append(17, "TRIPLE");
        PLAYBOOK_EVENTS.append(18, "BATTER_COUNT_4");
        PLAYBOOK_EVENTS.append(19, "BATTER_COUNT_5");
        PLAYBOOK_EVENTS.append(20, "MOST_FIELDED_BY_LEFT");
        PLAYBOOK_EVENTS.append(21, "MOST_FIELDED_BY_RIGHT");
        PLAYBOOK_EVENTS.append(22, "MOST_FIELDED_BY_INFIELDERS");
        PLAYBOOK_EVENTS.append(23, "MOST_FIELDED_BY_CENTER");
        PLAYBOOK_EVENTS.append(24, "UNKNOWN");

        // Declare that we have an options menu.
        setHasOptionsMenu(true);

        // Mark ourselves as running.
        mIsAttached = true;
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        super.onCreateView(inflater, container, savedInstanceState);
        WebView webView = getWebView();

        if (isWebViewCompatible()) {
            webView.addJavascriptInterface(new JavaScriptInterface(), "PlaybookBridge");
            webView.loadUrl("file:///android_asset/prediction/index.html");
        }

        return webView;
    }

    @Override
    public void onDetach() {
        super.onDetach();
        mIsAttached = false;
    }

    @Override
    public void onPause() {
        super.onPause();

        // Save game state to preferences.
        SharedPreferences prefs = getActivity().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(PREF_KEY_GAME_STATE, mGameState.toString()).apply();
        Log.d(TAG, "Saved gameState to preferences");
    }

    @Override
    public void onCreateOptionsMenu(Menu menu, MenuInflater inflater) {
        super.onCreateOptionsMenu(menu, inflater);
        inflater.inflate(R.menu.menu_prediction, menu);
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        switch (item.getItemId()) {
            case R.id.menu_prediction_tutorial:
                showTutorial();
                return true;
            default:
                return super.onOptionsItemSelected(item);
        }
    }

    @Override
    public void onWebSocketMessageReceived(Activity context, JSONObject s) {
        super.onWebSocketMessageReceived(context, s);
        try {
            if (!mIsAttached) {
                if (s.has("event")) {
                    String event = s.getString("event");
                    if (event.equals("server:playsCreated")) {
                        handlePlaysCreated(context, s);
                    }
                }
                Log.d(TAG, "Received event while fragment is not attached, adding to queue");
                mPendingEvents.add(s);
            }
        } catch (JSONException e) {
            e.printStackTrace();
        }
    }

    private JSONObject createInitialGameState() throws JSONException {
        JSONObject state = new JSONObject();
        JSONArray balls = new JSONArray();
        for (int i = 0; i < 5; i++) {
            JSONObject ball = new JSONObject();
            ball.put("selectedTarget", null);
        }

        state.put("stage", "INITIAL");
        state.put("score", 0);
        state.put("balls", balls);
        return state;
    }

    private void sendMessage(final JSONObject jsonObject) {
        String quoted = JSONObject.quote(jsonObject.toString());
        StringBuilder builder = new StringBuilder();
        String js = builder
                .append("window.dispatchEvent(\n")
                .append("new MessageEvent('message', { data: JSON.parse(")
                .append(quoted)
                .append(") })\n")
                .append(");")
                .toString();
        Log.d(TAG, js);
        getWebView().evaluateJavascript(js, null);
    }

    private void handlePlaysCreated(final Activity context, JSONObject s) throws JSONException {
        // If mGameState is null, we are not even in the app, so ignore.
        if (mGameState == null) {
            return;
        }

        JSONArray data = s.getJSONArray("data");
        List<String> events = new ArrayList<>();
        for (int i = 0; i < data.length(); i++) {
            events.add(PLAYBOOK_EVENTS.valueAt(data.getInt(i)));
        }

        // Add it to the game state.
        Log.d(TAG, "Creating plays: " + events.toString());
        JSONArray balls = mGameState.getJSONArray("balls");
        for (String event : events) {
            for (int i = 0; i < balls.length(); i++) {
                JSONObject ball = balls.getJSONObject(i);
                String selectedTarget = ball.getString("selectedTarget");
                if (selectedTarget != null && event.equals(selectedTarget)) {
                    showCorrectDialog(context);
                }
            }
        }
    }

    private void showCorrectDialog(final Activity context) {
        final Intent intent = new Intent(context, AppActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra(AppActivity.INTENT_EXTRA_DRAWER_ITEM, DrawerItemAdapter.DRAWER_ITEM_PREDICTION);

        context.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (mCorrectDialog == null) {
                    mCorrectDialog = new AlertDialog.Builder(context)
                            .setTitle("Bravo!")
                            .setMessage("You got a prediction right.")
                            .setPositiveButton("Check it out!", new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface dialog, int which) {
                                    dialog.dismiss();
                                    context.startActivity(intent);
                                }
                            })
                            .setNegativeButton("Dismiss", new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface dialog, int which) {
                                    dialog.dismiss();
                                }
                            })
                            .create();
                }

                if (!mCorrectDialog.isShowing()) {
                    mCorrectDialog.show();
                }
            }
        });
    }

    private void showTutorial() {
        DialogFragment dialog = (DialogFragment) DialogFragment.instantiate(getActivity(), TutorialDialogFragment.class.getName());
        dialog.show(getFragmentManager(), null);
    }

    public static class TutorialDialogFragment extends DialogFragment {
        @Override
        public Dialog onCreateDialog(Bundle savedInstanceState) {
            Typeface typeface = Typeface.createFromAsset(getActivity().getAssets(), "nova_excblack.otf");
            TextView title = new TextView(getActivity());
            title.setText("Prediction".toUpperCase());
            title.setTextSize(36);
            title.setTypeface(typeface);
            title.setGravity(Gravity.CENTER);

            return new AlertDialog.Builder(getActivity())
                    .setCustomTitle(title)
                    .setMessage("Play this between each half-inning. We'll notify you when your predictions come true.")
                    .setCancelable(false)
                    .setPositiveButton("Got it!", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            dismiss();
                        }
                    })
                    .create();
        }
    }

    private class JavaScriptInterface {
        @JavascriptInterface
        public String getAPIUrl() {
            return "ws://" + BuildConfig.PLAYBOOK_API_HOST + ":" +
                    BuildConfig.PLAYBOOK_API_PORT;
        }

        @JavascriptInterface
        public String getSectionAPIUrl() {
            return "http://" + BuildConfig.PLAYBOOK_SECTION_API_HOST + ":" +
                    BuildConfig.PLAYBOOK_SECTION_API_PORT;
        }

        @JavascriptInterface
        public String getPlayerID() {
            return PlaybookApplication.getPlayerID();
        }

        @JavascriptInterface
        public void notifyGameState(String state) {
            try {
                Log.d(TAG, "Received game state: " + state);
                mGameState = new JSONObject(state);
            } catch (JSONException e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void notifyLoaded() {
            Log.d(TAG, "The JavaScript world has arrived");
            getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        JSONObject jsonObject = new JSONObject();
                        jsonObject.put("action", "RESTORE_GAME_STATE");
                        jsonObject.put("payload", mGameState.toString());
                        PredictionFragment.this.sendMessage(jsonObject);

                        // Send down any pending events that were received when we weren't in
                        // the foreground.
                        while (!mPendingEvents.isEmpty()) {
                            jsonObject = new JSONObject();
                            jsonObject.put("action", "HANDLE_MESSAGE");
                            jsonObject.put("payload", mPendingEvents.poll());
                            PredictionFragment.this.sendMessage(jsonObject);
                        }

                    } catch (JSONException e) {
                        e.printStackTrace();
                    }
                }
            });
        }

        @JavascriptInterface
        public void goToLeaderboard() {
            Intent intent = new Intent(getActivity(), AppActivity.class);
            intent.putExtra(AppActivity.INTENT_EXTRA_DRAWER_ITEM, DrawerItemAdapter.DRAWER_ITEM_LEADERBOARD);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
        }

        @JavascriptInterface
        public void goToCollection() {
            Intent intent = new Intent(getActivity(), AppActivity.class);
            intent.putExtra(AppActivity.INTENT_EXTRA_DRAWER_ITEM, DrawerItemAdapter.DRAWER_ITEM_COLLECTION);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
        }
    }
}
