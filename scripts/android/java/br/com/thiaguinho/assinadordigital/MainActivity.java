package br.com.thiaguinho.assinadordigital;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            WebView webView = getBridge().getWebView();
            webView.getSettings().setAllowFileAccess(true);
            webView.getSettings().setAllowContentAccess(true);
            webView.addJavascriptInterface(new NativePdfBridge(this), "NativePdfBridge");
        } catch (Exception e) {
            android.util.Log.e("AssinadorDigital", "Falha ao instalar NativePdfBridge", e);
        }
    }
}
