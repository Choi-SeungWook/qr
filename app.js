(function () {
  'use strict';

  const urlInput = document.getElementById('url-input');
  const clearBtn = document.getElementById('clear-btn');
  const charCountEl = document.getElementById('char-count');
  const sizeSelect = document.getElementById('size-select');
  const ecSelect = document.getElementById('ec-select');
  const fgColorInput = document.getElementById('fg-color');
  const bgColorInput = document.getElementById('bg-color');
  const fgColorHex = document.getElementById('fg-color-hex');
  const bgColorHex = document.getElementById('bg-color-hex');
  const marginSelect = document.getElementById('margin-select');
  const styleSelect = document.getElementById('style-select');

  const qrCanvas = document.getElementById('qr-canvas');
  const emptyState = document.getElementById('empty-state');
  const qrMeta = document.getElementById('qr-meta');
  const errorBanner = document.getElementById('error-banner');
  const toastMsg = document.getElementById('toast-msg');

  const downloadPngBtn = document.getElementById('download-png-btn');
  const downloadSvgBtn = document.getElementById('download-svg-btn');
  const copyImgBtn = document.getElementById('copy-img-btn');

  const historyListEl = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  const STORAGE_KEY = 'qr_generator_recent_urls_v1';
  let currentQrData = null;
  let toastTimer = null;

  function getByteLength(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length;
    }
    return unescape(encodeURIComponent(str)).length;
  }

  function showToast(message, isError = false) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMsg.textContent = message;
    toastMsg.style.color = isError ? '#f87171' : '#10b981';
    toastTimer = setTimeout(() => {
      toastMsg.textContent = '';
    }, 3000);
  }

  function getRenderOptions() {
    return {
      pixelSize: parseInt(sizeSelect.value, 10) || 320,
      margin: parseInt(marginSelect.value, 10),
      darkColor: fgColorInput.value,
      lightColor: bgColorInput.value,
      rounded: styleSelect.value === 'rounded'
    };
  }

  function updateQRCode() {
    const text = urlInput.value.trim();
    const byteLen = getByteLength(text);
    charCountEl.textContent = `${byteLen} 바이트`;

    fgColorHex.textContent = fgColorInput.value.toUpperCase();
    bgColorHex.textContent = bgColorInput.value.toUpperCase();

    if (!text) {
      currentQrData = null;
      qrCanvas.hidden = true;
      emptyState.hidden = false;
      errorBanner.hidden = true;
      qrMeta.textContent = '대기 중';
      setActionButtonsDisabled(true);
      return;
    }

    try {
      const ecLevel = ecSelect.value;
      const qrData = window.QRGenerator.generate(text, { ecLevel });
      currentQrData = qrData;

      const renderOpts = getRenderOptions();
      window.QRGenerator.renderToCanvas(qrCanvas, qrData, renderOpts);

      qrCanvas.hidden = false;
      emptyState.hidden = true;
      errorBanner.hidden = true;
      qrMeta.textContent = `Version ${qrData.version} · ${qrData.size}×${qrData.size} · EC ${qrData.ecLevel}`;
      setActionButtonsDisabled(false);
    } catch (err) {
      currentQrData = null;
      qrCanvas.hidden = true;
      emptyState.hidden = false;
      errorBanner.hidden = false;
      errorBanner.textContent = err.message || 'QR 코드 생성 중 오류가 발생했습니다.';
      qrMeta.textContent = '오류';
      setActionButtonsDisabled(true);
    }
  }

  function setActionButtonsDisabled(disabled) {
    downloadPngBtn.disabled = disabled;
    downloadSvgBtn.disabled = disabled;
    copyImgBtn.disabled = disabled;
  }

  function makeSafeFilename(text, ext) {
    const clean = text
      .replace(/^https?:\/\//i, '')
      .replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
      .slice(0, 32)
      .replace(/^_+|_+$/g, '');
    return `qrcode_${clean || 'url'}.${ext}`;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveToHistory(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      let list = loadHistory().filter((item) => item !== trimmed);
      list.unshift(trimmed);
      if (list.length > 8) list = list.slice(0, 8);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      renderHistory();
    } catch (_) {
      // Ignore storage errors in restricted file:// environments
    }
  }

  function renderHistory() {
    const list = loadHistory();
    historyListEl.innerHTML = '';

    if (list.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'history-empty';
      emptyLi.textContent = '저장된 최근 URL이 없습니다. (다운로드 시 자동 기록)';
      historyListEl.appendChild(emptyLi);
      return;
    }

    list.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.title = '클릭하여 불러오기';

      const span = document.createElement('span');
      span.className = 'history-text';
      span.textContent = item;

      li.appendChild(span);
      li.addEventListener('click', () => {
        urlInput.value = item;
        updateQRCode();
        showToast('기록에서 URL을 불러왔습니다.');
      });

      historyListEl.appendChild(li);
    });
  }

  // 이벤트 리스너 등록
  urlInput.addEventListener('input', updateQRCode);

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    urlInput.focus();
    updateQRCode();
  });

  [sizeSelect, ecSelect, fgColorInput, bgColorInput, marginSelect, styleSelect].forEach((el) => {
    el.addEventListener('input', updateQRCode);
    el.addEventListener('change', updateQRCode);
  });

  // 빠른 입력 칩 버튼
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const prefix = chip.getAttribute('data-prefix');
      const sample = chip.getAttribute('data-sample');
      if (prefix) {
        if (!urlInput.value.startsWith('http://') && !urlInput.value.startsWith('https://')) {
          urlInput.value = prefix + urlInput.value;
        }
      } else if (sample) {
        urlInput.value = sample;
      }
      urlInput.focus();
      updateQRCode();
    });
  });

  // PNG 다운로드
  downloadPngBtn.addEventListener('click', () => {
    if (!currentQrData) return;
    const text = urlInput.value.trim();
    const dataUrl = qrCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = makeSafeFilename(text, 'png');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    saveToHistory(text);
    showToast('PNG 이미지가 다운로드되었습니다.');
  });

  // SVG 다운로드
  downloadSvgBtn.addEventListener('click', () => {
    if (!currentQrData) return;
    const text = urlInput.value.trim();
    const svgString = window.QRGenerator.renderToSVG(currentQrData, getRenderOptions());
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = makeSafeFilename(text, 'svg');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    saveToHistory(text);
    showToast('SVG 벡터 파일이 다운로드되었습니다.');
  });

  // 클립보드 이미지 복사
  copyImgBtn.addEventListener('click', () => {
    if (!currentQrData) return;
    const text = urlInput.value.trim();
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      showToast('현재 브라우저 환경에서는 클립보드 이미지 복사를 지원하지 않습니다.', true);
      return;
    }
    qrCanvas.toBlob((blob) => {
      if (!blob) {
        showToast('이미지 변환에 실패했습니다.', true);
        return;
      }
      navigator.clipboard
        .write([new ClipboardItem({ 'image/png': blob })])
        .then(() => {
          saveToHistory(text);
          showToast('QR 코드 이미지가 클립보드에 복사되었습니다!');
        })
        .catch(() => {
          showToast('복사 실패 (파일 경로 접근 시 브라우저 보안 정책으로 제한될 수 있습니다)', true);
        });
    }, 'image/png');
  });

  clearHistoryBtn.addEventListener('click', () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    renderHistory();
    showToast('최근 기록이 삭제되었습니다.');
  });

  // 초기 실행
  renderHistory();
  updateQRCode();
})();

