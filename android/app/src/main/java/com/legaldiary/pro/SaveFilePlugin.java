package com.legaldiary.pro;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Lets the user pick a place (Downloads, Documents, ...) with Android's own
 * "Save as" screen and copies a file from the app cache into it.
 * No storage permission is needed.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    private File resolveSource(String path) {
        if (path == null) return null;
        try {
            String p = Uri.parse(path).getPath();
            if (p == null) return null;
            File f = new File(p).getCanonicalFile();
            String cache = getContext().getCacheDir().getCanonicalPath() + File.separator;
            if (!f.getPath().startsWith(cache)) return null;
            if (!f.isFile()) return null;
            return f;
        } catch (IOException e) {
            return null;
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name");
        String path = call.getString("path");
        String mime = call.getString("mime");
        if (name == null || name.isEmpty() || path == null || path.isEmpty()) {
            call.reject("Missing file name or path");
            return;
        }
        if (mime == null || mime.isEmpty()) {
            mime = "application/octet-stream";
        }
        if (resolveSource(path) == null) {
            call.reject("The file to save was not found in the app cache");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "saveResult");
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("saved", false);
            call.resolve(cancelled);
            return;
        }
        Uri target = data.getData();
        File src = resolveSource(call.getString("path"));
        if (src == null) {
            call.reject("The file to save was not found in the app cache");
            return;
        }
        try (InputStream in = new FileInputStream(src);
             OutputStream out = getContext().getContentResolver().openOutputStream(target, "wt")) {
            if (out == null) {
                throw new IOException("Cannot open the chosen location");
            }
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
            }
            out.flush();
        } catch (Exception e) {
            call.reject("Could not write the file: " + e.getMessage());
            return;
        }
        JSObject ok = new JSObject();
        ok.put("saved", true);
        ok.put("uri", target.toString());
        call.resolve(ok);
    }
}
// end of SaveFilePlugin.java
