import * as vscode from 'vscode';
import * as path from 'path';
import type { ExtToWebMsg } from './types';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'citygmlViewer.gmlPreview',
      new GmlEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Button in the viewer tab title bar → switch to text editor
  context.subscriptions.push(
    vscode.commands.registerCommand('citygmlViewer.openAsText', async () => {
      const uri = getActiveGmlUri();
      if (uri) {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
      }
    })
  );

  // Button in the text editor title bar (for .gml files) → switch to viewer
  context.subscriptions.push(
    vscode.commands.registerCommand('citygmlViewer.openAsViewer', async () => {
      const uri = getActiveGmlUri();
      if (uri) {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'citygmlViewer.gmlPreview');
      }
    })
  );
}

export function deactivate() {}

function getActiveGmlUri(): vscode.Uri | undefined {
  // Custom editor tab
  const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
  if (activeTab?.input instanceof vscode.TabInputCustom) return activeTab.input.uri;
  // Text editor tab
  if (activeTab?.input instanceof vscode.TabInputText) return activeTab.input.uri;
  return vscode.window.activeTextEditor?.document.uri;
}

class GmlEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview'),
        vscode.Uri.file(path.dirname(document.uri.fsPath)),
      ],
    };
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'ready') {
        // Send only the webview-safe URI — the webview fetches and parses the
        // file itself, avoiding large IPC transfers and blocking the extension host.
        const fileUri = webviewPanel.webview.asWebviewUri(document.uri).toString();
        const response: ExtToWebMsg = { type: 'loadFile', uri: fileUri };
        webviewPanel.webview.postMessage(response);
      }
      if (msg.type === 'openAsText') {
        await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const bundleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'bundle.js')
    );
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src https:;">
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; }
    body, html { margin: 0; padding: 0; overflow: hidden; background: #1e1e1e; width: 100%; height: 100%; }
    #canvas-container { width: 100vw; height: 100vh; display: block; }
    #ui-overlay {
      position: absolute; top: 12px; left: 12px; z-index: 10;
      display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
    }
    .ui-row { display: flex; gap: 8px; align-items: center; }
    #ui-overlay button {
      background: #3c3c3c; color: #d4d4d4; border: 1px solid #555;
      padding: 6px 14px; cursor: pointer; border-radius: 3px; font-size: 12px;
    }
    #ui-overlay button:hover { background: #505050; }
    #ui-overlay button.active { background: #0078d4; color: #fff; border-color: #0078d4; }
    #ui-overlay button.active:hover { background: #006cbd; }
    .btn-group { display: flex; }
    .btn-group button { border-radius: 0; border-right-width: 0; }
    .btn-group button:first-child { border-radius: 3px 0 0 3px; }
    .btn-group button:last-child  { border-radius: 0 3px 3px 0; border-right-width: 1px; }
    #loading-msg {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      color: #888; font-family: monospace; font-size: 14px; z-index: 20;
    }
    #info-panel {
      position: absolute; top: 12px; right: 12px; z-index: 10;
      background: #252526; color: #d4d4d4; padding: 14px 16px;
      border-radius: 4px; max-width: 280px; min-width: 200px;
      font-size: 12px; font-family: 'Consolas', 'Courier New', monospace;
      display: none; border: 1px solid #3c3c3c; max-height: 80vh; overflow-y: auto;
    }
    #info-panel .id-label { font-weight: bold; color: #9cdcfe; word-break: break-all; }
    #info-panel .type-badge {
      display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 3px;
      margin-left: 6px; vertical-align: middle; font-weight: normal;
    }
    #info-panel .type-building { background: #3c3c3c; color: #888; }
    #info-panel .type-bridge   { background: #4a3a2a; color: #c8a878; }
    #info-panel .type-tunnel   { background: #1e2830; color: #7aa0b8; }
    #info-panel hr { border: none; border-top: 1px solid #3c3c3c; margin: 8px 0; }
    #info-panel .attr-row { display: flex; gap: 6px; margin: 3px 0; }
    #info-panel .attr-key { color: #4ec9b0; flex-shrink: 0; }
    #info-panel .attr-val { color: #ce9178; }

    /* Light background theme */
    body.light { background: #ffffff; }
    body.light #ui-overlay button { background: #e8e8e8; color: #333; border-color: #bbb; }
    body.light #ui-overlay button:hover { background: #d4d4d4; }
    body.light #ui-overlay button.active { background: #0078d4; color: #fff; border-color: #0078d4; }
    body.light #ui-overlay button.active:hover { background: #006cbd; }
    body.light #loading-msg { color: #555; }
    body.light #info-panel { background: #f3f3f3; color: #333; border-color: #d0d0d0; }
    body.light #info-panel .id-label { color: #0070c1; }
    body.light #info-panel .type-building { background: #ddd; color: #555; }
    body.light #info-panel .type-bridge   { background: #f0e0c0; color: #7a5020; }
    body.light #info-panel .type-tunnel   { background: #d0e4f0; color: #2060a0; }
    body.light #info-panel hr { border-top-color: #d0d0d0; }
    body.light #info-panel .attr-key { color: #007070; }
    body.light #info-panel .attr-val { color: #a31515; }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <div id="loading-msg">Loading CityGML...</div>
  <div id="ui-overlay">
    <div class="ui-row">
      <button id="btn-toggle-view">Top-Down View</button>
      <button id="btn-reset-camera">Reset Camera</button>
    </div>
    <div class="ui-row">
      <div class="btn-group">
        <button id="btn-mode-surface" class="active">Surface</button>
        <button id="btn-mode-wireframe">Wireframe</button>
        <button id="btn-mode-edges">Surface+Edges</button>
      </div>
    </div>
    <div class="ui-row">
      <button id="btn-toggle-bg">White Background</button>
    </div>
    <div class="ui-row">
      <button id="btn-open-text">View XML Source</button>
    </div>
  </div>
  <div id="info-panel">
    <div id="info-content"></div>
  </div>
  <script nonce="${nonce}" src="${bundleUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
