// clipboard_hook.js — MAIN world, run_at: document_start.
// 페이지 JS가 navigator.clipboard.writeText / document.execCommand('copy') 호출하면 가로채
// 내용을 documentElement dataset(pgClipboard)에 누적 기록. ISOLATED world가 읽음.

(function () {
  if (window.__pgClipboardHookInstalled) return;
  window.__pgClipboardHookInstalled = true;

  function push(entry) {
    try {
      const el = document.documentElement;
      const prev = el.getAttribute("data-pg-clipboard");
      const arr = prev ? JSON.parse(prev) : [];
      arr.push(entry);
      // 너무 커지지 않게 캡(이미지 같은 base64 거대 페이로드 방지)
      if (arr.length > 30) arr.shift();
      el.setAttribute("data-pg-clipboard", JSON.stringify(arr));
    } catch (e) { /* ignore */ }
  }

  // navigator.clipboard.writeText
  try {
    const c = navigator.clipboard;
    if (c && typeof c.writeText === "function") {
      const origWriteText = c.writeText.bind(c);
      c.writeText = function (text) {
        push({ type: "writeText", text: String(text ?? "").slice(0, 4000), ts: Date.now() });
        try { return origWriteText(text); }
        catch (e) { throw e; }
      };
    }
    if (c && typeof c.write === "function") {
      const origWrite = c.write.bind(c);
      c.write = async function (items) {
        try {
          // ClipboardItem 안에 text/plain 있으면 그 부분 기록
          for (const it of (items || [])) {
            for (const ttype of it.types || []) {
              if (ttype.startsWith("text/")) {
                try {
                  const blob = await it.getType(ttype);
                  const text = await blob.text();
                  push({ type: "write/" + ttype, text: text.slice(0, 4000), ts: Date.now() });
                } catch {}
              } else {
                push({ type: "write/" + ttype, text: "(binary)", ts: Date.now() });
              }
            }
          }
        } catch {}
        return origWrite(items);
      };
    }
  } catch (e) { /* clipboard may be undefined */ }

  // document.execCommand('copy') / 'cut'
  try {
    const origExec = document.execCommand?.bind(document);
    if (origExec) {
      document.execCommand = function (cmd, ...args) {
        if (cmd === "copy" || cmd === "cut") {
          let sel = "";
          try { sel = String(window.getSelection?.() || "").slice(0, 4000); } catch {}
          push({ type: "execCommand/" + cmd, text: sel, ts: Date.now() });
        }
        return origExec(cmd, ...args);
      };
    }
  } catch (e) { /* ignore */ }
})();
