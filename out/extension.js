"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const byteToUnicode = createByteToUnicode();
const unicodeToByte = invertMap(byteToUnicode);
function createByteToUnicode() {
    const bs = [];
    for (let i = "!".charCodeAt(0); i <= "~".charCodeAt(0); i++)
        bs.push(i);
    for (let i = "¡".charCodeAt(0); i <= "¬".charCodeAt(0); i++)
        bs.push(i);
    for (let i = "®".charCodeAt(0); i <= "ÿ".charCodeAt(0); i++)
        bs.push(i);
    const cs = bs.slice();
    let n = 0;
    for (let b = 0; b < 256; b++) {
        if (!bs.includes(b)) {
            bs.push(b);
            cs.push(256 + n);
            n++;
        }
    }
    const map = new Map();
    for (let i = 0; i < bs.length; i++) {
        map.set(bs[i], String.fromCharCode(cs[i]));
    }
    return map;
}
function invertMap(map) {
    const inv = new Map();
    for (const [k, v] of map.entries()) {
        inv.set(v, k);
    }
    return inv;
}
function decodeByteLevel(token) {
    const bytes = [];
    for (const ch of token) {
        const b = unicodeToByte.get(ch);
        if (b === undefined)
            return null;
        bytes.push(b);
    }
    const decoded = Buffer.from(bytes).toString("utf8");
    return decoded;
}
function extractVocab(obj) {
    if (obj && typeof obj === "object") {
        const direct = obj;
        if (looksLikeVocab(direct))
            return direct;
        const vocab1 = direct["vocab"] ?? null;
        if (vocab1 && looksLikeVocab(vocab1))
            return vocab1;
        const model = direct["model"];
        const vocab2 = model?.["vocab"];
        if (vocab2 && looksLikeVocab(vocab2))
            return vocab2;
    }
    return null;
}
function looksLikeVocab(obj) {
    let seen = 0;
    for (const v of Object.values(obj)) {
        if (typeof v === "number") {
            seen++;
            if (seen > 5)
                return true;
        }
        else if (v !== undefined && v !== null) {
            return false;
        }
    }
    return seen > 0;
}
function makeDecodedView(vocab) {
    const entries = Object.entries(vocab)
        .filter(([, id]) => typeof id === "number")
        .sort((a, b) => a[1] - b[1]);
    const out = {};
    for (const [token, id] of entries) {
        const decoded = decodeByteLevel(token) ?? token;
        out[String(id)] = decoded;
    }
    return JSON.stringify(out, null, 2);
}
function findStringRangeAtPosition(document, position) {
    const line = document.lineAt(position.line).text;
    let inString = false;
    let start = -1;
    let escape = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (!inString) {
            if (ch === '"') {
                inString = true;
                start = i;
                escape = false;
            }
            continue;
        }
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === "\\") {
            escape = true;
            continue;
        }
        if (ch === '"') {
            const end = i;
            if (position.character >= start + 1 && position.character <= end) {
                return new vscode.Range(new vscode.Position(position.line, start + 1), new vscode.Position(position.line, end));
            }
            inString = false;
            start = -1;
        }
    }
    return null;
}
function isJsonDocument(document) {
    return document.languageId === "json" || document.fileName.endsWith(".json");
}
function activate(context) {
    const openDecoded = vscode.commands.registerCommand("gpt2VocabViewer.openDecoded", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("Open a vocab.json or tokenizer.json file first.");
            return;
        }
        if (!isJsonDocument(editor.document)) {
            vscode.window.showWarningMessage("Active document is not JSON.");
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(editor.document.getText());
        }
        catch (err) {
            vscode.window.showErrorMessage("Failed to parse JSON.");
            return;
        }
        const vocab = extractVocab(parsed);
        if (!vocab) {
            vscode.window.showErrorMessage("Could not find vocab mapping in JSON.");
            return;
        }
        const content = makeDecodedView(vocab);
        const doc = await vscode.workspace.openTextDocument({
            content,
            language: "json"
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    });
    const hoverProvider = vscode.languages.registerHoverProvider({ language: "json" }, {
        provideHover(document, position) {
            if (!isJsonDocument(document))
                return null;
            const range = findStringRangeAtPosition(document, position);
            if (!range)
                return null;
            const token = document.getText(range);
            const decoded = decodeByteLevel(token);
            if (!decoded || decoded === token)
                return null;
            return new vscode.Hover(`Decoded: ${decoded}`);
        }
    });
    context.subscriptions.push(openDecoded, hoverProvider);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map