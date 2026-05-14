package br.com.thiaguinho.assinadordigital;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;

public class NativePdfBridge {
    private final Context context;

    public NativePdfBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    private byte[] decodeBase64Pdf(String input) throws Exception {
        if (input == null) throw new Exception("PDF vazio.");
        String data = input.trim();
        int comma = data.indexOf(',');
        if (comma >= 0) data = data.substring(comma + 1);
        return Base64.decode(data, Base64.DEFAULT);
    }

    private File writeTempPdf(byte[] bytes) throws Exception {
        File file = File.createTempFile("assinador_pdf_", ".pdf", context.getCacheDir());
        FileOutputStream out = new FileOutputStream(file);
        out.write(bytes);
        out.flush();
        out.close();
        return file;
    }

    @JavascriptInterface
    public String getPdfInfo(String base64Pdf) {
        File file = null;
        ParcelFileDescriptor fd = null;
        PdfRenderer renderer = null;
        try {
            file = writeTempPdf(decodeBase64Pdf(base64Pdf));
            fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
            renderer = new PdfRenderer(fd);
            JSONObject root = new JSONObject();
            JSONArray pages = new JSONArray();
            int count = renderer.getPageCount();
            for (int i = 0; i < count; i++) {
                PdfRenderer.Page page = renderer.openPage(i);
                JSONObject pageJson = new JSONObject();
                pageJson.put("index", i);
                pageJson.put("width", page.getWidth());
                pageJson.put("height", page.getHeight());
                pages.put(pageJson);
                page.close();
            }
            root.put("ok", true);
            root.put("pageCount", count);
            root.put("pages", pages);
            return root.toString();
        } catch (Exception e) {
            try {
                JSONObject error = new JSONObject();
                error.put("ok", false);
                error.put("message", e.getMessage() == null ? e.toString() : e.getMessage());
                return error.toString();
            } catch (Exception ignored) {
                return "{\"ok\":false,\"message\":\"Falha nativa ao ler PDF.\"}";
            }
        } finally {
            try { if (renderer != null) renderer.close(); } catch (Exception ignored) {}
            try { if (fd != null) fd.close(); } catch (Exception ignored) {}
            try { if (file != null) file.delete(); } catch (Exception ignored) {}
        }
    }

    @JavascriptInterface
    public String renderPage(String base64Pdf, int pageIndex, int requestedWidth) {
        File file = null;
        ParcelFileDescriptor fd = null;
        PdfRenderer renderer = null;
        PdfRenderer.Page page = null;
        try {
            file = writeTempPdf(decodeBase64Pdf(base64Pdf));
            fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
            renderer = new PdfRenderer(fd);
            int count = renderer.getPageCount();
            if (count <= 0) throw new Exception("PDF sem páginas.");
            int safeIndex = Math.max(0, Math.min(pageIndex, count - 1));
            page = renderer.openPage(safeIndex);

            int pdfW = Math.max(1, page.getWidth());
            int pdfH = Math.max(1, page.getHeight());
            int targetW = requestedWidth > 0 ? requestedWidth : pdfW;
            targetW = Math.max(320, Math.min(targetW, 1800));
            float scale = targetW / (float) pdfW;
            int targetH = Math.max(1, Math.round(pdfH * scale));

            Bitmap bitmap = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            canvas.drawColor(Color.WHITE);
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
            bitmap.recycle();

            JSONObject root = new JSONObject();
            root.put("ok", true);
            root.put("pageIndex", safeIndex);
            root.put("pageCount", count);
            root.put("pdfWidth", pdfW);
            root.put("pdfHeight", pdfH);
            root.put("width", targetW);
            root.put("height", targetH);
            root.put("dataUrl", "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            return root.toString();
        } catch (Exception e) {
            try {
                JSONObject error = new JSONObject();
                error.put("ok", false);
                error.put("message", e.getMessage() == null ? e.toString() : e.getMessage());
                return error.toString();
            } catch (Exception ignored) {
                return "{\"ok\":false,\"message\":\"Falha nativa ao renderizar PDF.\"}";
            }
        } finally {
            try { if (page != null) page.close(); } catch (Exception ignored) {}
            try { if (renderer != null) renderer.close(); } catch (Exception ignored) {}
            try { if (fd != null) fd.close(); } catch (Exception ignored) {}
            try { if (file != null) file.delete(); } catch (Exception ignored) {}
        }
    }
}
