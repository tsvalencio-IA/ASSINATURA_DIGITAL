;(function () {
  'use strict';

  const W = window;
  const D = document;
  const STORAGE_KEY = 'thiaguinho_assinador_local_v1';
  const $ = id => D.getElementById(id);

  const state = {
    file: null,
    fileName: '',
    type: '',
    pdfBytes: null,
    pdfDocProxy: null,
    pdfPage: 1,
    pdfPages: 0,
    pdfViewport: null,
    pdfPreviewMode: 'normal',
    pdfWorkerBlobUrl: '',
    nativePdfBase64: '',
    nativePdfPages: [],
    sheetRows: [],
    workbookSheets: [],
    activeSheetIndex: 0,
    sheetExportMode: 'ativa',
    sheetScaleMode: 'legivel',
    signatureScale: 100,
    signatureDataUrl: '',
    hasSignature: false,
    signatureBackground: 'transparente',
    signatureAppearance: 'limpa',
    showGuides: true,
    outputDirectoryHandle: null,
    outputDirectoryName: '',
    dragging: false,
    resizing: false,
    resizeStart: null,
    dragOffset: { x: 0, y: 0 }
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[<>&"']/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function status(msg, type) {
    const el = $('assinadorStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status ' + (type || 'ok');
  }

  function nowLabel() {
    return new Date().toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function safeName(name) {
    return String(name || 'documento')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w\-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80) || 'documento';
  }


  function isNativeAndroidApp() {
    try {
      return !!(W.Capacitor && typeof W.Capacitor.isNativePlatform === 'function' && W.Capacitor.isNativePlatform());
    } catch (err) {
      return false;
    }
  }

  function blobToBase64Payload(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Falha ao preparar o PDF para salvar no armazenamento local.'));
      reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.readAsDataURL(blob);
    });
  }

  async function saveBlobInNativeApp(blob, fileName) {
    const plugins = W.Capacitor && W.Capacitor.Plugins ? W.Capacitor.Plugins : {};
    const Filesystem = plugins.Filesystem;
    const Share = plugins.Share;
    if (!Filesystem || typeof Filesystem.writeFile !== 'function') {
      throw new Error('Plugin de arquivos do Android não está disponível.');
    }

    const base64 = await blobToBase64Payload(blob);
    const path = 'Assinaturas_thIAguinho/' + fileName;

    const saved = await Filesystem.writeFile({
      path,
      data: base64,
      directory: 'DOCUMENTS',
      recursive: true
    });

    status('PDF assinado salvo no celular: Documentos/Assinaturas_thIAguinho/' + fileName, 'ok');

    if (Share && typeof Share.share === 'function' && saved && saved.uri) {
      try {
        await Share.share({
          title: 'PDF assinado',
          text: 'Documento assinado pelo Assinador Digital thIAguinho Soluções.',
          url: saved.uri,
          dialogTitle: 'Abrir ou compartilhar PDF assinado'
        });
      } catch (err) {
        console.warn('[ASSINADOR] Compartilhamento cancelado ou indisponível:', err);
      }
    }
  }

  async function saveBlob(blob, fileName) {
    if (isNativeAndroidApp()) {
      try {
        await saveBlobInNativeApp(blob, fileName);
        return;
      } catch (err) {
        console.error('[ASSINADOR] Falha ao salvar no APK Android:', err);
        status('Não foi possível salvar automaticamente no armazenamento do app. Tentando download padrão.', 'warn');
      }
    }

    if (state.outputDirectoryHandle) {
      try {
        const ok = await ensureDirectoryPermission(state.outputDirectoryHandle);
        if (!ok) throw new Error('Permissão negada para gravar na pasta escolhida.');
        const fileHandle = await state.outputDirectoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        status('PDF assinado salvo na pasta escolhida: ' + state.outputDirectoryName, 'ok');
        return;
      } catch (err) {
        console.warn('[ASSINADOR] Falha ao salvar na pasta escolhida, usando download:', err);
        status('Não foi possível salvar na pasta escolhida. Gerando download padrão.', 'warn');
      }
    }
    downloadBlob(blob, fileName);
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = D.createElement('a');
    a.href = url;
    a.download = fileName;
    D.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    status('PDF assinado gerado para download.', 'ok');
  }

  async function ensureDirectoryPermission(handle) {
    if (!handle) return false;
    const options = { mode: 'readwrite' };
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission(options);
      if (current === 'granted') return true;
    }
    if (typeof handle.requestPermission === 'function') {
      return await handle.requestPermission(options) === 'granted';
    }
    return true;
  }

  function updateOutputFolderLabel() {
    const androidNote = $('assinadorModoAndroid');
    if (androidNote) androidNote.style.display = isNativeAndroidApp() ? 'block' : 'none';
    const el = $('assinadorPastaSaida');
    if (!el) return;
    if (isNativeAndroidApp()) {
      el.textContent = 'Modo APK Android: os PDFs assinados serão salvos automaticamente no celular.';
      return;
    }
    if (state.outputDirectoryHandle) {
      el.textContent = 'Pasta escolhida: ' + (state.outputDirectoryName || state.outputDirectoryHandle.name || 'pasta local') + '. Os PDFs assinados serão salvos nela.';
    } else {
      el.textContent = 'Sem pasta escolhida. O navegador usará o download padrão.';
    }
  }

  async function chooseOutputFolder() {
    if (isNativeAndroidApp()) {
      status('No APK Android não é necessário escolher pasta. O sistema salva em Documentos/Assinaturas_thIAguinho.', 'ok');
      updateOutputFolderLabel();
      return;
    }
    if (typeof W.showDirectoryPicker !== 'function') {
      status('Este navegador não permite escolher pasta local. Use Chrome ou Edge atualizado, ou mantenha o download padrão.', 'warn');
      return;
    }
    const handle = await W.showDirectoryPicker({ mode: 'readwrite' });
    const ok = await ensureDirectoryPermission(handle);
    if (!ok) throw new Error('Permissão negada para gravar na pasta escolhida.');
    state.outputDirectoryHandle = handle;
    state.outputDirectoryName = handle.name || 'pasta local';
    updateOutputFolderLabel();
    status('Pasta de saída configurada: ' + state.outputDirectoryName, 'ok');
  }

  function storageRead() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  function storageWrite(extra) {
    const data = Object.assign(storageRead(), extra || {}, {
      nome: $('assinadorNome')?.value.trim() || '',
      cpf: $('assinadorCpf')?.value.trim() || '',
      cargo: $('assinadorCargo')?.value.trim() || '',
      obs: $('assinadorObs')?.value.trim() || '',
      signatureBackground: $('assinadorFundo')?.value || state.signatureBackground || 'transparente',
      signatureAppearance: $('assinadorAparencia')?.value || state.signatureAppearance || 'limpa',
      signatureScale: Number($('assinadorTamanho')?.value || state.signatureScale || 100),
      sheetExportMode: $('planilhaExportacao')?.value || state.sheetExportMode || 'ativa',
      sheetScaleMode: $('planilhaEscala')?.value || state.sheetScaleMode || 'legivel',
      showGuides: !!$('assinadorGuias')?.checked
    });
    if (state.signatureDataUrl) data.signatureDataUrl = state.signatureDataUrl;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadLocal() {
    const data = storageRead();
    if ($('assinadorNome')) $('assinadorNome').value = data.nome || '';
    if ($('assinadorCpf')) $('assinadorCpf').value = data.cpf || '';
    if ($('assinadorCargo')) $('assinadorCargo').value = data.cargo || '';
    if ($('assinadorObs')) $('assinadorObs').value = data.obs || '';
    state.signatureBackground = data.signatureBackground || 'transparente';
    state.signatureAppearance = data.signatureAppearance || 'limpa';
    state.signatureScale = Number(data.signatureScale || 100);
    state.sheetExportMode = data.sheetExportMode || 'ativa';
    state.sheetScaleMode = data.sheetScaleMode || 'legivel';
    state.showGuides = data.showGuides !== false;
    if ($('assinadorFundo')) $('assinadorFundo').value = state.signatureBackground;
    if ($('assinadorAparencia')) $('assinadorAparencia').value = state.signatureAppearance;
    if ($('assinadorTamanho')) $('assinadorTamanho').value = String(state.signatureScale);
    if ($('planilhaExportacao')) $('planilhaExportacao').value = state.sheetExportMode;
    if ($('planilhaEscala')) $('planilhaEscala').value = state.sheetScaleMode;
    if ($('assinadorGuias')) $('assinadorGuias').checked = state.showGuides;
    updateSignatureSizeInfo();
    if (data.signatureDataUrl) {
      state.signatureDataUrl = data.signatureDataUrl;
      state.hasSignature = true;
      restoreSignatureCanvas(data.signatureDataUrl);
    }
  }

  function initTheme() {
    const btn = $('btnTemaAssinador');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const root = D.documentElement;
      const current = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('thiaguinho_theme', next); } catch (_) {}
    });
  }

  function initSignaturePad() {
    const canvas = $('assinadorCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let last = null;
    let dpr = 1;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = W.devicePixelRatio || 1;
      canvas.width = Math.max(320, Math.round(rect.width * dpr));
      canvas.height = Math.round(150 * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.4;
      if (state.signatureDataUrl) restoreSignatureCanvas(state.signatureDataUrl);
    }

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function down(e) {
      e.preventDefault();
      drawing = true;
      last = pos(e);
      canvas.setPointerCapture(e.pointerId);
      $('assinadorHint').style.display = 'none';
    }

    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      state.hasSignature = true;
      state.signatureDataUrl = canvas.toDataURL('image/png');
      updateSignatureBox();
    }

    function up() {
      if (!drawing) return;
      drawing = false;
      state.signatureDataUrl = canvas.toDataURL('image/png');
      updateSignatureBox();
    }

    canvas.addEventListener('pointerdown', down, { passive: false });
    canvas.addEventListener('pointermove', move, { passive: false });
    canvas.addEventListener('pointerup', up, { passive: false });
    canvas.addEventListener('pointerleave', up, { passive: false });
    W.addEventListener('resize', resize);
    resize();
  }

  function restoreSignatureCanvas(dataUrl) {
    const canvas = $('assinadorCanvas');
    if (!canvas || !dataUrl) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const ratio = Math.min(canvas.width / img.width, canvas.height / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      ctx.restore();
      $('assinadorHint').style.display = 'none';
      updateSignatureBox();
    };
    img.src = dataUrl;
  }

  function clearSignature() {
    const canvas = $('assinadorCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.signatureDataUrl = '';
    state.hasSignature = false;
    $('assinadorHint').style.display = 'flex';
    updateSignatureBox();
  }

  function setSignatureFromDataUrl(dataUrl, save) {
    if (!dataUrl) return;
    state.signatureDataUrl = dataUrl;
    state.hasSignature = true;
    restoreSignatureCanvas(dataUrl);
    updateSignatureBox();
    if (save) storageWrite({ signatureDataUrl: dataUrl });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function loadSignatureImage(file) {
    if (!file) return;
    if (!/^image\//i.test(file.type || '')) throw new Error('Selecione uma imagem de assinatura em PNG, JPG ou WEBP.');
    const dataUrl = await fileToDataUrl(file);
    setSignatureFromDataUrl(dataUrl, true);
    placeSignatureAtCenterIfNeeded();
    status('Assinatura importada/colada. Agora arraste no documento ou ajuste o tamanho.', 'ok');
  }

  async function pasteSignatureImage() {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find(t => /^image\//i.test(t));
          if (!type) continue;
          const blob = await item.getType(type);
          await loadSignatureImage(new File([blob], 'assinatura-colada.png', { type }));
          return;
        }
      }
      status('Copie uma imagem da assinatura e pressione Ctrl+V nesta tela.', 'warn');
    } catch (err) {
      console.warn(err);
      status('Não consegui ler a área de transferência. Use Ctrl+V ou importe a imagem.', 'warn');
    }
  }

  function signerData() {
    return {
      nome: $('assinadorNome')?.value.trim() || '',
      cpf: $('assinadorCpf')?.value.trim() || '',
      cargo: $('assinadorCargo')?.value.trim() || '',
      obs: $('assinadorObs')?.value.trim() || '',
      data: nowLabel()
    };
  }

  function optionData() {
    state.signatureBackground = $('assinadorFundo')?.value || state.signatureBackground || 'transparente';
    state.signatureAppearance = $('assinadorAparencia')?.value || state.signatureAppearance || 'limpa';
    state.signatureScale = Math.min(220, Math.max(40, Number($('assinadorTamanho')?.value || state.signatureScale || 100)));
    state.sheetExportMode = $('planilhaExportacao')?.value || state.sheetExportMode || 'ativa';
    state.sheetScaleMode = $('planilhaEscala')?.value || state.sheetScaleMode || 'legivel';
    state.showGuides = !!$('assinadorGuias')?.checked;
    return {
      background: state.signatureBackground,
      appearance: state.signatureAppearance,
      scale: state.signatureScale,
      guides: state.showGuides
    };
  }

  function imageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function signatureImageForExport() {
    const opt = optionData();
    const img = await imageFromDataUrl(state.signatureDataUrl);
    const canvas = D.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 640;
    canvas.height = img.naturalHeight || img.height || 220;
    const ctx = canvas.getContext('2d');
    if (opt.background === 'branco') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (opt.background === 'transparente') {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max > 238 && (max - min) < 22) d[i + 3] = 0;
      }
      ctx.putImageData(imgData, 0, 0);
    }
    return canvas.toDataURL('image/png');
  }

  function updateSignatureSizeInfo() {
    const value = Math.min(220, Math.max(40, Number($('assinadorTamanho')?.value || state.signatureScale || 100)));
    state.signatureScale = value;
    if ($('assinadorTamanho')) $('assinadorTamanho').value = String(value);
    if ($('assinadorTamanhoInfo')) $('assinadorTamanhoInfo').textContent = 'Tamanho: ' + value + '%';
  }

  function applySignatureBoxSize(box) {
    if (!box) return;
    const scale = Math.min(220, Math.max(40, Number(state.signatureScale || 100))) / 100;
    box.style.setProperty('--sig-w', Math.round(260 * scale) + 'px');
    box.style.setProperty('--sig-h', Math.round(96 * scale) + 'px');
    box.style.setProperty('--sig-pad', Math.max(3, Math.round(8 * scale)) + 'px');
    box.style.setProperty('--sig-img-h', Math.max(14, Math.round(38 * scale)) + 'px');
    box.style.setProperty('--sig-name-fs', Math.max(6, (11 * scale).toFixed(1)) + 'px');
    box.style.setProperty('--sig-meta-fs', Math.max(5, (9 * scale).toFixed(1)) + 'px');
  }

  function keepSignatureInsideStage(box) {
    const stage = box?.parentElement;
    if (!box || !stage) return;
    const maxX = Math.max(0, stage.clientWidth - box.offsetWidth);
    const maxY = Math.max(0, stage.clientHeight - box.offsetHeight);
    box.style.left = Math.min(maxX, Math.max(0, parseFloat(box.style.left || '34') || 0)) + 'px';
    box.style.top = Math.min(maxY, Math.max(0, parseFloat(box.style.top || '34') || 0)) + 'px';
  }

  function placeSignatureAtCenterIfNeeded() {
    const stage = D.querySelector('.page-stage, .sheet-stage');
    if (!stage) return;
    const box = ensureSignatureBox(stage);
    if (!box) return;
    applySignatureBoxSize(box);
    if (!box.style.left || !box.style.top) {
      box.style.left = Math.max(12, (stage.clientWidth - box.offsetWidth) / 2) + 'px';
      box.style.top = Math.max(12, (stage.clientHeight - box.offsetHeight) / 2) + 'px';
    }
    keepSignatureInsideStage(box);
  }

  function applySignatureBoxStyle(box) {
    if (!box) return;
    const opt = optionData();
    box.classList.toggle('edit-guides', !!opt.guides);
    box.classList.toggle('no-bg', opt.background === 'transparente');
    box.classList.toggle('no-card', opt.appearance === 'limpa');
    applySignatureBoxSize(box);
    keepSignatureInsideStage(box);
  }

  function validate() {
    const d = signerData();
    if (!state.file) throw new Error('Importe um PDF ou planilha antes de assinar.');
    if (!d.nome) throw new Error('Informe o nome de quem assinou.');
    if (!d.cpf) throw new Error('Informe o CPF/documento de quem assinou.');
    if (!state.signatureDataUrl || !state.hasSignature) throw new Error('Desenhe ou carregue uma assinatura local.');
    return d;
  }

  function signatureBoxHtml() {
    const d = signerData();
    const img = state.signatureDataUrl || '';
    return `
      ${img ? `<img src="${img}" alt="Assinatura">` : ''}
      <div class="line"></div>
      <b>${esc(d.nome || 'Nome do assinante')}</b>
      <span>${esc(d.cargo || 'Responsável')} | CPF/Doc: ${esc(d.cpf || '-')}</span>
      <span>Assinado em ${esc(d.data)}</span>
      <div class="sig-resize-handle" title="Aumentar ou diminuir">↘</div>
    `;
  }

  function ensureSignatureBox(stage) {
    if (!stage) return null;
    let box = stage.querySelector('.signature-box');
    if (!box) {
      box = D.createElement('div');
      box.className = 'signature-box';
      box.addEventListener('pointerdown', startDrag);
      D.addEventListener('pointermove', onDrag, { passive: false });
      D.addEventListener('pointerup', endDrag);
      D.addEventListener('pointercancel', endDrag);
      D.addEventListener('pointercancel', endResize);
      W.addEventListener('blur', endDrag);
      W.addEventListener('blur', endResize);
      stage.appendChild(box);
    }
    box.innerHTML = signatureBoxHtml();
    const handle = box.querySelector('.sig-resize-handle');
    if (handle) handle.addEventListener('pointerdown', startResize);
    applySignatureBoxStyle(box);
    return box;
  }

  function updateSignatureBox() {
    const stage = D.querySelector('.page-stage, .sheet-stage');
    if (!stage) return;
    const box = ensureSignatureBox(stage);
    if (!box) return;
    box.innerHTML = signatureBoxHtml();
    const handle = box.querySelector('.sig-resize-handle');
    if (handle) handle.addEventListener('pointerdown', startResize);
    applySignatureBoxStyle(box);
  }

  function placeSignatureFooter() {
    const stage = D.querySelector('.page-stage, .sheet-stage');
    const box = ensureSignatureBox(stage);
    if (!stage || !box) return;
    applySignatureBoxSize(box);
    const w = box.offsetWidth || 260;
    const h = box.offsetHeight || 96;
    box.style.left = Math.max(12, (stage.clientWidth - w) / 2) + 'px';
    box.style.top = Math.max(12, stage.clientHeight - h - 28) + 'px';
  }

  function lockDragScroll() {
    D.body?.classList.add('dragging-signature');
    const pb = D.querySelector('.preview-body');
    if (pb && !pb.dataset.prevOverflow) pb.dataset.prevOverflow = pb.style.overflow || 'auto';
    if (pb) pb.style.overflow = 'hidden';
  }

  function unlockDragScroll() {
    D.body?.classList.remove('dragging-signature');
    const pb = D.querySelector('.preview-body');
    if (pb) {
      pb.style.overflow = pb.dataset.prevOverflow || 'auto';
      delete pb.dataset.prevOverflow;
    }
  }

  function startResize(e) {
    if ($('assinadorModo')?.value === 'fim') return;
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget.closest('.signature-box');
    if (!box) return;
    state.resizing = true;
    state.resizeStart = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      scale: Number(state.signatureScale || 100)
    };
    box.classList.add('resizing');
    lockDragScroll();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  }

  function applyResizeFromPointer(e) {
    if (!state.resizing || !state.resizeStart) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = Math.max(e.clientX - state.resizeStart.x, e.clientY - state.resizeStart.y);
    const next = Math.min(220, Math.max(40, Math.round((state.resizeStart.scale + delta / 2) / 5) * 5));
    state.signatureScale = next;
    if ($('assinadorTamanho')) $('assinadorTamanho').value = String(next);
    updateSignatureSizeInfo();
    updateSignatureBox();
  }

  function endResize(e) {
    if (!state.resizing) return;
    if (e) {
      try { e.preventDefault(); } catch (_) {}
      try { e.stopPropagation(); } catch (_) {}
    }
    state.resizing = false;
    state.resizeStart = null;
    D.querySelectorAll('.signature-box.resizing').forEach(el => el.classList.remove('resizing'));
    unlockDragScroll();
    storageWrite({});
  }

  function startDrag(e) {
    if ($('assinadorModo')?.value === 'fim') return;
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget;
    const r = box.getBoundingClientRect();
    state.dragging = true;
    state.dragOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
    lockDragScroll();
    try { box.setPointerCapture(e.pointerId); } catch (_) {}
  }

  function onDrag(e) {
    if (state.resizing) { applyResizeFromPointer(e); return; }
    if (!state.dragging) return;
    e.preventDefault();
    e.stopPropagation();
    const box = D.querySelector('.signature-box');
    const stage = box?.parentElement;
    if (!box || !stage) return;
    const sr = stage.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const maxX = Math.max(0, sr.width - br.width);
    const maxY = Math.max(0, sr.height - br.height);
    const x = Math.min(maxX, Math.max(0, e.clientX - sr.left - state.dragOffset.x));
    const y = Math.min(maxY, Math.max(0, e.clientY - sr.top - state.dragOffset.y));
    box.style.left = x + 'px';
    box.style.top = y + 'px';
  }

  function endDrag(e) {
    if (state.resizing) { endResize(e); return; }
    if (!state.dragging) return;
    if (e) {
      try { e.preventDefault(); } catch (_) {}
      try { e.stopPropagation(); } catch (_) {}
    }
    state.dragging = false;
    unlockDragScroll();
  }

  D.addEventListener('touchmove', function(e) {
    if (state.dragging || state.resizing) e.preventDefault();
  }, { passive: false });


  function isAndroidApkWebView() {
    try {
      const ua = String(navigator.userAgent || '').toLowerCase();
      const href = String(W.location.href || '').toLowerCase();
      return ua.includes('android') && (href.startsWith('capacitor://') || href.startsWith('file://') || href.includes('localhost'));
    } catch (err) {
      return false;
    }
  }



  function hasNativePdfBridge() {
    return !!(W.NativePdfBridge && typeof W.NativePdfBridge.getPdfInfo === 'function' && typeof W.NativePdfBridge.renderPage === 'function');
  }

  function arrayBufferToBase64(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function parseNativeJson(raw, actionLabel) {
    let data;
    try { data = JSON.parse(String(raw || '')); }
    catch (err) { throw new Error('Resposta nativa inválida ao ' + actionLabel + '.'); }
    if (!data || data.ok === false) {
      throw new Error(data && data.message ? data.message : 'Falha nativa ao ' + actionLabel + '.');
    }
    return data;
  }

  function pdfJsVersionLabel() {
    try { return W.pdfjsLib && W.pdfjsLib.version ? String(W.pdfjsLib.version) : 'desconhecida'; }
    catch (err) { return 'desconhecida'; }
  }

  async function configurePdfJsWorker() {
    if (!W.pdfjsLib) throw new Error('pdf.js não carregou.');

    // No Android WebView/Capacitor o caminho físico do arquivo pode quebrar o Worker.
    // A forma mais estável é transformar o pdf.worker.min.js local em um Blob URL.
    // Assim continuamos 100% offline, mas sem depender de file://, capacitor:// ou localhost.
    if (state.pdfWorkerBlobUrl) {
      W.pdfjsLib.GlobalWorkerOptions.workerSrc = state.pdfWorkerBlobUrl;
      return state.pdfWorkerBlobUrl;
    }

    const candidates = [
      new URL('js/vendor/pdf.worker.min.js', W.location.href).toString(),
      'js/vendor/pdf.worker.min.js',
      './js/vendor/pdf.worker.min.js'
    ];

    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const code = await res.text();
        if (!code || !code.includes('WorkerMessageHandler')) throw new Error('worker inválido');
        const blob = new Blob([code], { type: 'text/javascript' });
        state.pdfWorkerBlobUrl = URL.createObjectURL(blob);
        W.pdfjsLib.GlobalWorkerOptions.workerSrc = state.pdfWorkerBlobUrl;
        console.info('[ASSINADOR] PDF.js worker carregado por Blob URL. Versão PDF.js:', pdfJsVersionLabel());
        return state.pdfWorkerBlobUrl;
      } catch (err) {
        console.warn('[ASSINADOR] Tentativa de carregar worker falhou:', url, err);
      }
    }

    // Último recurso: usar caminho relativo. Se o WebView bloquear Worker real,
    // loadPdf ainda fará fallback sem prévia usando pdf-lib.
    W.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
    return W.pdfjsLib.GlobalWorkerOptions.workerSrc;
  }

  async function loadPdfForPreview(buf) {
    await configurePdfJsWorker();

    const baseOptions = {
      data: buf.slice(0),
      disableFontFace: true,
      useSystemFonts: true,
      cMapPacked: true,
      isEvalSupported: false
    };

    try {
      return await W.pdfjsLib.getDocument(baseOptions).promise;
    } catch (err) {
      console.warn('[ASSINADOR] PDF.js com Worker real falhou. Tentando sem worker:', err);
    }

    try {
      return await W.pdfjsLib.getDocument(Object.assign({}, baseOptions, {
        data: buf.slice(0),
        disableWorker: true
      })).promise;
    } catch (err) {
      console.warn('[ASSINADOR] PDF.js sem worker também falhou:', err);
      throw err;
    }
  }

  async function loadPdfFallbackWithoutPreview(buf) {
    if (!W.PDFLib) throw new Error('pdf-lib não carregou.');
    const pdfDoc = await W.PDFLib.PDFDocument.load(buf.slice(0));
    state.pdfPages = Math.max(1, pdfDoc.getPageCount());
    state.pdfPage = state.pdfPages;
    state.pdfDocProxy = null;
    state.pdfViewport = null;
    state.pdfPreviewMode = 'fallback';
    fillPageSelect();
    $('previewBody').innerHTML = `
      <div class="empty-preview" style="text-align:left;align-items:flex-start">
        <strong>PDF importado com segurança.</strong>
        <span>A prévia visual foi desativada no APK Android para impedir o erro do PDF.js Worker. O arquivo foi carregado e pode ser assinado.</span>
        <span>Use o modo <b>Assinar no final do documento</b> para gerar o PDF assinado normalmente.</span>
        <span>Arquivo: <b>${esc(state.fileName)}</b></span>
        <span>Total de páginas detectado: <b>${state.pdfPages}</b></span>
      </div>`;
    updatePreviewMeta();
  }

  function renderEmpty() {
    $('previewBody').innerHTML = `
      <div class="empty-preview">
        <strong>Nenhum documento carregado</strong>
        Selecione um PDF ou planilha para pré-visualizar e posicionar a assinatura.
      </div>`;
  }

  async function handleFile(file) {
    if (!file) return;
    state.file = file;
    state.fileName = file.name || 'documento';
    state.type = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? 'pdf' : 'sheet';
    state.pdfBytes = null;
    state.pdfDocProxy = null;
    state.sheetRows = [];
    state.workbookSheets = [];
    state.activeSheetIndex = 0;
    if ($('planilhaOpcoes')) $('planilhaOpcoes').style.display = state.type === 'sheet' ? '' : 'none';
    $('previewTitulo').textContent = file.name;
    status('Carregando documento...', 'warn');
    if (state.type === 'pdf') await loadPdf(file);
    else await loadSheet(file);
    storageWrite({ lastFileType: state.type });
    status('Documento carregado. Ajuste a assinatura e gere o PDF assinado.', 'ok');
  }

  async function loadPdf(file) {
    const buf = await file.arrayBuffer();
    state.pdfBytes = new Uint8Array(buf);
    state.pdfPreviewMode = 'normal';

    // No APK Android a prévia agora é NATIVA, via Android PdfRenderer.
    // Isso mantém a prévia e o posicionamento arrastável sem acionar PDF.js/Worker.
    if (isAndroidApkWebView() && hasNativePdfBridge()) {
      await loadPdfWithNativeRenderer(buf);
      status('PDF importado com prévia nativa Android. Ajuste a assinatura e gere o PDF assinado.', 'ok');
      return;
    }

    try {
      if (!W.pdfjsLib) throw new Error('pdf.js não carregou.');
      state.pdfDocProxy = await loadPdfForPreview(buf);
      state.pdfPages = state.pdfDocProxy.numPages || 1;
      state.pdfPage = state.pdfPages;
      fillPageSelect();
      await renderPdfPage(state.pdfPage);
    } catch (err) {
      console.error('[ASSINADOR] Prévia PDF.js indisponível. Entrando em fallback com pdf-lib:', err);
      await loadPdfFallbackWithoutPreview(buf);
      status('PDF importado. A prévia PDF.js falhou, mas o arquivo foi carregado em modo seguro para assinatura no final.', 'warn');
    }
  }

  function fillPageSelect() {
    const sel = $('assinadorPagina');
    if (!sel) return;
    sel.disabled = state.type !== 'pdf';
    sel.innerHTML = '';
    const total = state.pdfPages || 1;
    for (let i = 1; i <= total; i++) {
      const opt = D.createElement('option');
      opt.value = String(i);
      opt.textContent = String(i);
      if (i === state.pdfPage) opt.selected = true;
      sel.appendChild(opt);
    }
    const previewOff = state.pdfPreviewMode === 'fallback';
    $('btnPaginaAnterior').disabled = previewOff || state.type !== 'pdf' || state.pdfPage <= 1;
    $('btnPaginaProxima').disabled = previewOff || state.type !== 'pdf' || state.pdfPage >= total;
    $('btnCentralizarAssinatura').disabled = previewOff ? true : false;
  }


  async function loadPdfWithNativeRenderer(buf) {
    state.nativePdfBase64 = arrayBufferToBase64(buf);
    const info = parseNativeJson(W.NativePdfBridge.getPdfInfo(state.nativePdfBase64), 'ler informações do PDF');
    state.nativePdfPages = Array.isArray(info.pages) ? info.pages : [];
    state.pdfPages = Math.max(1, Number(info.pageCount || state.nativePdfPages.length || 1));
    state.pdfPage = state.pdfPages;
    state.pdfDocProxy = null;
    state.pdfViewport = null;
    state.pdfPreviewMode = 'native';
    fillPageSelect();
    await renderNativePdfPage(state.pdfPage);
  }

  async function renderNativePdfPage(pageNum) {
    if (!hasNativePdfBridge() || !state.nativePdfBase64) {
      throw new Error('Renderizador nativo Android indisponível para prévia do PDF.');
    }
    const maxW = Math.max(320, Math.min(920, $('previewBody').clientWidth - 36));
    const dpr = Math.max(1, Math.min(2, W.devicePixelRatio || 1));
    const rendered = parseNativeJson(
      W.NativePdfBridge.renderPage(state.nativePdfBase64, Math.max(0, pageNum - 1), Math.round(maxW * dpr)),
      'renderizar a página do PDF'
    );
    const displayW = Math.min(maxW, Number(rendered.width || maxW));
    const displayH = displayW * (Number(rendered.height || 1) / Math.max(1, Number(rendered.width || 1)));
    state.pdfViewport = {
      width: displayW,
      height: displayH,
      pdfWidth: Number(rendered.pdfWidth || displayW),
      pdfHeight: Number(rendered.pdfHeight || displayH),
      native: true
    };

    $('previewBody').innerHTML = `<div class="page-stage" id="pdfStage"><img id="pdfCanvas" alt="Prévia do PDF" /></div>`;
    const img = $('pdfCanvas');
    img.src = rendered.dataUrl;
    img.style.width = displayW + 'px';
    img.style.height = displayH + 'px';
    img.style.display = 'block';
    img.draggable = false;

    const stage = $('pdfStage');
    stage.style.width = displayW + 'px';
    stage.style.height = displayH + 'px';
    ensureSignatureBox(stage);
    if ($('assinadorModo')?.value === 'fim') placeSignatureFooter();
    updatePreviewMeta();
    fillPageSelect();
  }

  async function renderPdfPage(pageNum) {
    if (state.pdfPreviewMode === 'native') {
      await renderNativePdfPage(pageNum);
      return;
    }
    if (!state.pdfDocProxy) {
      await loadPdfFallbackWithoutPreview(state.pdfBytes || new Uint8Array());
      return;
    }
    const page = await state.pdfDocProxy.getPage(pageNum);
    const rawViewport = page.getViewport({ scale: 1 });
    const maxW = Math.max(320, Math.min(920, $('previewBody').clientWidth - 36));
    const scale = Math.min(1.7, maxW / rawViewport.width);
    const viewport = page.getViewport({ scale });
    state.pdfViewport = viewport;

    $('previewBody').innerHTML = `<div class="page-stage" id="pdfStage"><canvas id="pdfCanvas"></canvas></div>`;
    const canvas = $('pdfCanvas');
    const ctx = canvas.getContext('2d');
    const dpr = W.devicePixelRatio || 1;
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const stage = $('pdfStage');
    stage.style.width = viewport.width + 'px';
    stage.style.height = viewport.height + 'px';
    ensureSignatureBox(stage);
    if ($('assinadorModo')?.value === 'fim') placeSignatureFooter();
    updatePreviewMeta();
    fillPageSelect();
  }

  function normalizeSheetRows(ws) {
    const rows = W.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
    return rows.filter(row => row.some(cell => String(cell || '').trim()));
  }

  function sheetColumnCount(rows) {
    return Math.max(1, rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0));
  }

  function excelColName(n) {
    let s = '';
    n += 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  async function loadSheet(file) {
    if (!W.XLSX) throw new Error('XLSX não carregou.');
    const buf = await file.arrayBuffer();
    const wb = W.XLSX.read(buf, { type: 'array', cellDates: false, sheetStubs: true });
    state.workbookSheets = wb.SheetNames.map((name, index) => {
      const ws = wb.Sheets[name];
      return { name, index, rows: normalizeSheetRows(ws) };
    }).filter((sheet, idx) => sheet.rows.length || idx === 0);
    if (!state.workbookSheets.length) state.workbookSheets = [{ name: 'Planilha', index: 0, rows: [] }];
    state.activeSheetIndex = 0;
    state.sheetRows = state.workbookSheets[0].rows;
    fillSheetSelect();
    renderSheetPreview();
  }

  function activeSheet() {
    return state.workbookSheets[state.activeSheetIndex] || { name: 'Planilha', rows: state.sheetRows || [] };
  }

  function fillSheetSelect() {
    const sel = $('assinadorPagina');
    if (!sel) return;
    sel.disabled = false;
    sel.innerHTML = '';
    state.workbookSheets.forEach((sheet, idx) => {
      const opt = D.createElement('option');
      opt.value = String(idx);
      opt.textContent = sheet.name || ('Aba ' + (idx + 1));
      if (idx === state.activeSheetIndex) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function renderSheetPreview() {
    const sheet = activeSheet();
    state.sheetRows = sheet.rows || [];
    const rows = state.sheetRows.slice(0, 120);
    const totalCols = sheetColumnCount(state.sheetRows);
    const previewCols = Math.min(28, totalCols);
    const trs = rows.map(row => {
      const tds = [];
      for (let i = 0; i < previewCols; i++) tds.push(`<td>${esc(row[i] || '')}</td>`);
      return `<tr>${tds.join('')}</tr>`;
    }).join('');
    const aviso = totalCols > previewCols || state.sheetRows.length > rows.length
      ? `Prévia mostrando parte da planilha (${rows.length}/${state.sheetRows.length} linhas e ${previewCols}/${totalCols} colunas). No PDF, use modo legível para dividir colunas sem esmagar texto.`
      : `Prévia da aba: ${state.sheetRows.length} linhas e ${totalCols} colunas.`;
    $('previewBody').innerHTML = `
      <div class="sheet-stage" id="sheetStage">
        <h3>${esc(sheet.name || 'Planilha')}</h3>
        <div class="sheet-note">${esc(aviso)}</div>
        <div class="sheet-scroll-preview"><table class="sheet-table">${trs || '<tr><td>Planilha vazia</td></tr>'}</table></div>
      </div>`;
    ensureSignatureBox($('sheetStage'));
    placeSignatureFooter();
    $('btnPaginaAnterior').disabled = true;
    $('btnPaginaProxima').disabled = true;
    $('btnCentralizarAssinatura').disabled = false;
    updatePreviewMeta();
  }

  function updatePreviewMeta() {
    if (state.type === 'pdf') {
      $('previewMeta').textContent = state.pdfPreviewMode === 'fallback'
        ? `PDF com ${state.pdfPages} página(s). Prévia indisponível neste Android; assinatura será aplicada no final do documento.`
        : (state.pdfPreviewMode === 'native'
          ? `PDF com ${state.pdfPages} página(s). Prévia nativa Android ativa. Assinatura na página ${state.pdfPage}.`
          : `PDF com ${state.pdfPages} página(s). Assinatura na página ${state.pdfPage}.`);
    } else if (state.type === 'sheet') {
      const sh = activeSheet();
      $('previewMeta').textContent = `Planilha: ${state.workbookSheets.length || 1} aba(s). Aba atual: ${sh.name || 'Planilha'} — ${(sh.rows || []).length} linha(s), ${sheetColumnCount(sh.rows || [])} coluna(s).`;
    } else {
      $('previewMeta').textContent = 'Importe um arquivo para começar.';
    }
  }

  function currentPlacementForPdf(pdfPage) {
    const stage = $('pdfStage');
    const box = stage?.querySelector('.signature-box');
    const pages = pdfPage.doc.getPages();
    const modoFim = $('assinadorModo')?.value === 'fim' || state.pdfPreviewMode === 'fallback';
    const page = modoFim ? pages[pages.length - 1] : (pages[state.pdfPage - 1] || pages[pages.length - 1]);
    const pageSize = page.getSize();
    if (modoFim || !stage || !box) {
      const w = Math.min(96, pageSize.width * 0.42);
      const h = 54;
      return { page, x: (pageSize.width - w) / 2, y: 34, w, h };
    }
    const sr = stage.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const x = ((br.left - sr.left) / sr.width) * pageSize.width;
    const w = (br.width / sr.width) * pageSize.width;
    const h = (br.height / sr.height) * pageSize.height;
    const y = pageSize.height - (((br.top - sr.top) / sr.height) * pageSize.height) - h;
    return { page, x, y, w, h };
  }

  async function drawPdfLibSignature(pdfDoc, placement, data) {
    const { rgb, StandardFonts } = W.PDFLib;
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const sigDataUrl = await signatureImageForExport();
    const png = await pdfDoc.embedPng(sigDataUrl);
    const page = placement.page;
    const opt = optionData();
    const x = placement.x;
    const y = placement.y;
    const w = placement.w;
    const h = placement.h;

    if (opt.appearance === 'cartao') {
      const rect = { x, y, width: w, height: h, borderColor: rgb(0.12, 0.20, 0.31), borderWidth: 0.5, opacity: 0.98 };
      if (opt.background === 'branco') rect.color = rgb(1, 1, 1);
      page.drawRectangle(rect);
    }
    const imgW = w * 0.76;
    const imgH = h * 0.34;
    page.drawImage(png, { x: x + (w - imgW) / 2, y: y + h - imgH - 7, width: imgW, height: imgH });
    page.drawLine({ start: { x: x + 10, y: y + h * 0.47 }, end: { x: x + w - 10, y: y + h * 0.47 }, thickness: 0.55, color: rgb(0.08, 0.11, 0.18) });
    page.drawText(data.nome, { x: x + 10, y: y + h * 0.34, size: 8.2, font: bold, color: rgb(0.06, 0.09, 0.15), maxWidth: w - 20 });
    page.drawText((data.cargo || 'Responsável') + ' | CPF/Doc: ' + data.cpf, { x: x + 10, y: y + h * 0.22, size: 6.3, font, color: rgb(0.23, 0.29, 0.37), maxWidth: w - 20 });
    page.drawText('Assinado em ' + data.data, { x: x + 10, y: y + h * 0.11, size: 6.1, font, color: rgb(0.23, 0.29, 0.37), maxWidth: w - 20 });
    if (data.obs) {
      page.drawText(data.obs.slice(0, 110), { x: x + 10, y: y - 8, size: 5.4, font, color: rgb(0.36, 0.43, 0.52), maxWidth: w - 20 });
    }
  }

  async function generateSignedPdfFromPdf(data) {
    if (!W.PDFLib) throw new Error('pdf-lib não carregou.');
    const pdfDoc = await W.PDFLib.PDFDocument.load(state.pdfBytes);
    const placement = currentPlacementForPdf({ doc: pdfDoc });
    await drawPdfLibSignature(pdfDoc, placement, data);
    pdfDoc.setSubject('Documento assinado localmente no Assinador Digital thIAguinho Soluções');
    pdfDoc.setProducer('thIAguinho Soluções Digitais - Assinador Local');
    const bytes = await pdfDoc.save();
    await saveBlob(new Blob([bytes], { type: 'application/pdf' }), safeName(state.fileName) + '_assinado.pdf');
  }

  async function drawJsPdfSignature(doc, data, placement) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const opt = optionData();
    const sigDataUrl = await signatureImageForExport();
    const scale = Math.min(220, Math.max(40, Number(opt.scale || 100))) / 100;
    const w = Math.min(pageW - 24, 92 * scale);
    const h = Math.min(pageH - 24, 43 * scale);
    const x = placement && Number.isFinite(placement.x) ? placement.x : (pageW - w) / 2;
    const y = placement && Number.isFinite(placement.y) ? placement.y : pageH - h - 22;
    if (opt.appearance === 'cartao') {
      doc.setDrawColor(30, 41, 59);
      if (opt.background === 'branco') {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, w, h, 2, 2, 'FD');
      } else {
        doc.roundedRect(x, y, w, h, 2, 2, 'S');
      }
    }
    doc.addImage(sigDataUrl, 'PNG', x + w * 0.20, y + h * 0.09, w * 0.60, h * 0.35);
    doc.setDrawColor(15, 23, 42);
    doc.line(x + w * 0.11, y + h * 0.51, x + w * 0.89, y + h * 0.51);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(5, 8 * scale));
    doc.text(data.nome, x + w / 2, y + h * 0.65, { align: 'center', maxWidth: w - 12 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(Math.max(4.5, 6.6 * scale));
    doc.setTextColor(71, 85, 105);
    doc.text(`${data.cargo || 'Responsável'} | CPF/Doc: ${data.cpf}`, x + w / 2, y + h * 0.79, { align: 'center', maxWidth: w - 12 });
    doc.text(`Assinado em ${data.data}`, x + w / 2, y + h * 0.91, { align: 'center', maxWidth: w - 12 });
  }

  function buildSheetTable(rows, fromCol, toCol) {
    const width = Math.max(1, toCol - fromCol);
    const normalized = rows.map(row => Array.from({ length: width }, (_, i) => String(row?.[fromCol + i] == null ? '' : row[fromCol + i])));
    const first = normalized[0] || [];
    const hasHeader = first.some(v => String(v || '').trim());
    const head = [Array.from({ length: width }, (_, i) => hasHeader ? (first[i] || excelColName(fromCol + i)) : excelColName(fromCol + i))];
    const body = normalized.slice(hasHeader ? 1 : 0);
    return { head, body };
  }

  async function generateSignedPdfFromSheet(data) {
    if (!W.jspdf || !W.jspdf.jsPDF) throw new Error('jsPDF não carregou.');
    optionData();
    const exportMode = state.sheetExportMode || 'ativa';
    const sheets = exportMode === 'todas' ? (state.workbookSheets || []) : [activeSheet()];
    const validSheets = sheets.length ? sheets : [{ name: 'Planilha', rows: state.sheetRows || [] }];
    const compact = (state.sheetScaleMode || 'legivel') === 'compacta';
    const doc = new W.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: compact ? 'a3' : 'a4' });
    let firstPage = true;

    for (const sheet of validSheets) {
      const rows = sheet.rows || [];
      const maxCols = sheetColumnCount(rows);
      const colsPerBlock = compact ? Math.max(10, Math.min(18, maxCols)) : 8;
      for (let startCol = 0; startCol < maxCols; startCol += colsPerBlock) {
        const endCol = Math.min(maxCols, startCol + colsPerBlock);
        if (!firstPage) doc.addPage();
        firstPage = false;
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(`Planilha assinada: ${sheet.name || 'Planilha'}`, 10, 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.text(`Arquivo: ${state.fileName} | Colunas ${excelColName(startCol)} até ${excelColName(endCol - 1)} de ${maxCols}`, 10, 16);
        const { head, body } = buildSheetTable(rows, startCol, endCol);
        doc.autoTable({
          startY: 21,
          head,
          body,
          theme: 'grid',
          styles: {
            fontSize: compact ? 5.2 : 6.4,
            cellPadding: compact ? 0.9 : 1.35,
            overflow: 'linebreak',
            valign: 'top',
            minCellHeight: 4
          },
          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 10, right: 10, top: 18, bottom: 14 },
          tableWidth: 'auto',
          didDrawPage: function () {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(100, 116, 139);
            doc.text(`Bloco de colunas: ${excelColName(startCol)}-${excelColName(endCol - 1)}`, 10, pageH - 6);
            doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - 10, pageH - 6, { align: 'right' });
            doc.setTextColor(15, 23, 42);
          }
        });
      }
    }

    doc.addPage();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Termo de assinatura do documento', 10, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Arquivo original: ${state.fileName}`, 10, 22);
    doc.text(`Abas exportadas: ${validSheets.map(s => s.name).join(', ')}`, 10, 28, { maxWidth: pageW - 20 });
    doc.setDrawColor(203, 213, 225);
    doc.line(10, 36, pageW - 10, 36);
    const scale = Math.min(220, Math.max(40, Number(state.signatureScale || 100))) / 100;
    const sw = Math.min(pageW - 24, 92 * scale);
    const sh = Math.min(pageH - 24, 43 * scale);
    await drawJsPdfSignature(doc, data, { x: (pageW - sw) / 2, y: pageH - sh - 32 });
    const blob = doc.output('blob');
    await saveBlob(blob, safeName(state.fileName) + '_assinado.pdf');
  }

  async function generateSigned() {
    try {
      const data = validate();
      storageWrite({ signatureDataUrl: state.signatureDataUrl });
      status('Gerando PDF assinado...', 'warn');
      if (state.type === 'pdf') await generateSignedPdfFromPdf(data);
      else await generateSignedPdfFromSheet(data);
    } catch (err) {
      console.error(err);
      status(err.message || String(err), 'err');
    }
  }

  function bindEvents() {
    $('assinadorArquivo')?.addEventListener('change', e => handleFile(e.target.files?.[0]).catch(err => status(err.message || String(err), 'err')));
    $('assinadorPagina')?.addEventListener('change', e => {
      if (state.type === 'pdf') {
        state.pdfPage = Number(e.target.value || 1);
        renderPdfPage(state.pdfPage).catch(err => status(err.message || String(err), 'err'));
      } else if (state.type === 'sheet') {
        state.activeSheetIndex = Number(e.target.value || 0);
        renderSheetPreview();
        storageWrite({});
      }
    });
    $('btnPaginaAnterior')?.addEventListener('click', () => {
      if (state.type !== 'pdf' || state.pdfPage <= 1) return;
      state.pdfPage--;
      renderPdfPage(state.pdfPage).catch(err => status(err.message || String(err), 'err'));
    });
    $('btnPaginaProxima')?.addEventListener('click', () => {
      if (state.type !== 'pdf' || state.pdfPage >= state.pdfPages) return;
      state.pdfPage++;
      renderPdfPage(state.pdfPage).catch(err => status(err.message || String(err), 'err'));
    });
    $('btnCentralizarAssinatura')?.addEventListener('click', placeSignatureFooter);
    $('assinadorModo')?.addEventListener('change', () => {
      if ($('assinadorModo').value === 'fim') placeSignatureFooter();
    });
    $('btnLimparAssinatura')?.addEventListener('click', clearSignature);
    $('assinadorImagem')?.addEventListener('change', e => {
      loadSignatureImage(e.target.files?.[0]).catch(err => status(err.message || String(err), 'err'));
    });
    $('btnColarAssinatura')?.addEventListener('click', () => {
      pasteSignatureImage().catch(err => status(err.message || String(err), 'err'));
    });
    D.addEventListener('paste', e => {
      const files = Array.from(e.clipboardData?.files || []);
      const directFile = files.find(file => /^image\//.test(file.type));
      if (directFile) {
        e.preventDefault();
        loadSignatureImage(directFile).then(() => { placeSignatureAtCenterIfNeeded(); }).catch(err => status(err.message || String(err), 'err'));
        return;
      }
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(item => /^image\//.test(item.type));
      const pastedImage = imageItem?.getAsFile?.();
      if (pastedImage) {
        e.preventDefault();
        loadSignatureImage(pastedImage).then(() => { placeSignatureAtCenterIfNeeded(); status('Assinatura colada. Agora arraste ou ajuste o tamanho no quadro.', 'ok'); }).catch(err => status(err.message || String(err), 'err'));
      }
    });
    ['assinadorFundo', 'assinadorAparencia', 'assinadorGuias', 'assinadorTamanho', 'planilhaExportacao', 'planilhaEscala'].forEach(id => {
      $(id)?.addEventListener('change', () => {
        optionData();
        updateSignatureSizeInfo();
        updateSignatureBox();
        storageWrite({});
      });
    });
    $('btnDiminuirAssinatura')?.addEventListener('click', () => {
      if ($('assinadorTamanho')) $('assinadorTamanho').value = String(Math.max(40, Number($('assinadorTamanho').value || 100) - 10));
      optionData(); updateSignatureSizeInfo(); updateSignatureBox(); storageWrite({});
    });
    $('btnAumentarAssinatura')?.addEventListener('click', () => {
      if ($('assinadorTamanho')) $('assinadorTamanho').value = String(Math.min(220, Number($('assinadorTamanho').value || 100) + 10));
      optionData(); updateSignatureSizeInfo(); updateSignatureBox(); storageWrite({});
    });
    $('btnSalvarAssinatura')?.addEventListener('click', () => {
      if (!state.signatureDataUrl) { status('Desenhe, importe ou cole a assinatura antes de salvar localmente.', 'warn'); return; }
      storageWrite({ signatureDataUrl: state.signatureDataUrl });
      status('Assinatura, aparência e dados salvos localmente neste navegador.', 'ok');
    });
    $('btnEscolherPastaSaida')?.addEventListener('click', () => {
      chooseOutputFolder().catch(err => status(err.message || String(err), 'err'));
    });
    $('btnUsarDownload')?.addEventListener('click', () => {
      state.outputDirectoryHandle = null;
      state.outputDirectoryName = '';
      updateOutputFolderLabel();
      status('Saída alterada para download padrão do navegador.', 'ok');
    });
    $('btnGerarAssinado')?.addEventListener('click', generateSigned);
    $('btnLimparTudo')?.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      ['assinadorNome', 'assinadorCpf', 'assinadorCargo', 'assinadorObs'].forEach(id => { if ($(id)) $(id).value = ''; });
      if ($('assinadorFundo')) $('assinadorFundo').value = 'transparente';
      if ($('assinadorAparencia')) $('assinadorAparencia').value = 'limpa';
      if ($('assinadorTamanho')) $('assinadorTamanho').value = '100';
      if ($('planilhaExportacao')) $('planilhaExportacao').value = 'ativa';
      if ($('planilhaEscala')) $('planilhaEscala').value = 'legivel';
      if ($('assinadorGuias')) $('assinadorGuias').checked = true;
      state.signatureBackground = 'transparente';
      state.signatureAppearance = 'limpa';
      state.signatureScale = 100;
      state.sheetExportMode = 'ativa';
      state.sheetScaleMode = 'legivel';
      state.showGuides = true;
      updateSignatureSizeInfo();
      state.outputDirectoryHandle = null;
      state.outputDirectoryName = '';
      clearSignature();
      updateSignatureBox();
      updateOutputFolderLabel();
      status('Dados locais do assinador apagados.', 'ok');
    });
    ['assinadorNome', 'assinadorCpf', 'assinadorCargo', 'assinadorObs'].forEach(id => {
      $(id)?.addEventListener('input', () => { updateSignatureBox(); storageWrite({}); });
    });
  }

  function boot() {
    renderEmpty();
    initTheme();
    initSignaturePad();
    bindEvents();
    loadLocal();
    updateSignatureSizeInfo();
    updateOutputFolderLabel();
  }

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
