const DONATE_CONFIG = {
  accountName: 'BUI QUOC HIEP',
  accountNumber: '0866681372',
  bankName: 'MB Bank',
  qrImagePath: 'assets/donate-qr.webp',
  transferNote: 'Ung ho web 3D THPT Nguyen Khuyen',
  thankYouText: 'Cảm ơn đồng môn đã tiếp thêm động lực cho Bùi Quốc Hiệp duy trì server web 3D THPT Nguyễn Khuyến nhé!'
};

const greetings = 'Chào đồng môn! Bạn muốn hỏi Hiệp chuyện gì?';
const boasts = [
  'Bật mạng thì có Wifi, bật tao thì... chỉ có dính chiêu thôi bạn ơi! Vào trường tham quan ngoan đi nhé!',
  'Bật mạng thì có Wifi, bật tao thì... lên bảng ngồi sổ đầu bài ngay nhé!'
];

async function copyText(text, modal) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const active = document.activeElement;
    const field = document.createElement('textarea');
    field.value = text;
    field.className = 'donate-clipboard';
    field.readOnly = true;
    modal.append(field);
    try {
      field.focus({ preventScroll: true });
      field.select();
      field.setSelectionRange(0, text.length);
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      field.remove();
      active?.focus({ preventScroll: true });
    }
  }
}

export function createGateHorseDialogue({ secretEnabled, revealClue, sound, resetInput, restoreFocus }) {
  const bubble = document.querySelector('#gateHorseDialogue');
  const line = document.querySelector('#gateHorseLine');
  const secret = document.querySelector('#gateHorseSecret');
  const boast = document.querySelector('#gateHorseBoast');
  const donate = document.querySelector('#gateHorseDonate');
  const emote = document.querySelector('#gateHorseEmote');
  const modal = document.querySelector('#donateDialog');
  const card = modal.querySelector('.donate-card');
  const image = document.querySelector('#donateQr');
  const placeholder = document.querySelector('#donateQrPlaceholder');
  const status = document.querySelector('#donateStatus');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let mood = 'idle';
  let gestureAt = 0;
  let emoteTimer;
  let cooldownTimer;
  let donationTimer;
  let closeTimer;
  let qrChecked = false;
  let restoreGameFocus = false;
  let qrImageLoaded = false;
  let backdropPressed = false;

  document.querySelector('#donateAccountName').textContent = DONATE_CONFIG.accountName;
  document.querySelector('#donateAccountNumber').textContent = DONATE_CONFIG.accountNumber;
  document.querySelector('#donateTransferNote').textContent = DONATE_CONFIG.transferNote;
  document.querySelector('#donateThanks').textContent = DONATE_CONFIG.thankYouText;
  document.querySelector('#donateBank').textContent = DONATE_CONFIG.bankName;
  document.querySelector('#donateBankRow').hidden = !DONATE_CONFIG.bankName;

  function wireCopy(id, text) {
    const button = document.querySelector(id);
    const label = button.textContent;
    let timer;
    button.addEventListener('click', async () => {
      const copied = await copyText(text, modal);
      if (!modal.open || modal.hasAttribute('data-closing')) return;
      if (copied) {
        button.textContent = '✓ Đã sao chép!';
        status.textContent = 'Đã sao chép!';
      } else {
        status.textContent = 'Hãy chọn văn bản và sao chép thủ công.';
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = label;
        status.textContent = '';
      }, 1500);
    });
    modal.addEventListener('close', () => {
      clearTimeout(timer);
      button.textContent = label;
    });
  }

  wireCopy('#copyDonateAccount', DONATE_CONFIG.accountNumber);
  wireCopy('#copyDonateNote', DONATE_CONFIG.transferNote);

  async function loadDonationQr() {
    if (qrChecked) return;
    qrChecked = true;
    // A missing optional image returns 204, keeping the placeholder visible.
    try {
      const response = await fetch(DONATE_CONFIG.qrImagePath, {
        method: 'HEAD', headers: { 'X-Campus-Optional-Asset': '1' }, cache: 'no-store'
      });
      if (response.status === 200 && response.headers.get('content-type')?.startsWith('image/')) {
        image.src = DONATE_CONFIG.qrImagePath;
      }
    } catch { /* The account remains available if the image cannot be fetched. */ }
  }

  image.addEventListener('load', () => {
    qrImageLoaded = true;
    placeholder.hidden = true;
    image.hidden = false;
  });
  image.addEventListener('error', () => {
    image.hidden = true;
    placeholder.hidden = false;
  });

  function gesture(nextMood, symbol = '') {
    mood = nextMood;
    gestureAt = performance.now();
    clearTimeout(emoteTimer);
    emote.textContent = symbol;
    emote.hidden = !symbol;
    if (symbol) emoteTimer = setTimeout(() => {
      emote.hidden = true;
      if (mood === 'bold') mood = 'talk';
    }, 2500);
  }

  function open() {
    if (!bubble.hidden || modal.open) return false;
    secret.hidden = !secretEnabled();
    line.textContent = greetings;
    bubble.hidden = false;
    gesture('talk');
    (secret.hidden ? boast : secret).focus({ preventScroll: true });
    return true;
  }

  function endConversation() {
    bubble.hidden = true;
    clearTimeout(donationTimer);
    donate.disabled = false;
    gesture('idle');
  }

  function dismiss() {
    if (modal.open) {
      closeDonation();
      return;
    }
    if (bubble.hidden) return;
    const focusWasHere = bubble.contains(document.activeElement);
    endConversation();
    if (focusWasHere) restoreFocus();
  }

  function openDonation() {
    if (bubble.hidden || modal.open) return;
    resetInput();
    bubble.hidden = true;
    status.textContent = '';
    if (!qrImageLoaded) placeholder.hidden = false;
    card.scrollTop = 0;
    backdropPressed = false;
    document.body.classList.add('donate-open');
    modal.showModal();
    void loadDonationQr();
  }

  function closeDonation() {
    if (!modal.open || modal.hasAttribute('data-closing')) return;
    restoreGameFocus = true;
    modal.setAttribute('data-closing', '');
    closeTimer = setTimeout(() => modal.close(), reducedMotion.matches ? 0 : 200);
  }

  secret.addEventListener('click', () => {
    if (!secretEnabled() || donate.disabled) return;
    revealClue();
    line.textContent = 'Bật mí nhé, ngoài vỉa hè Quốc lộ 37 có hàng xôi và bánh mì nóng hổi. Nhớ canh me Bác Bảo Vệ nhé!';
    gesture('talk');
  });

  boast.addEventListener('click', () => {
    if (boast.disabled || donate.disabled) return;
    line.textContent = boasts[Math.floor(Math.random() * boasts.length)];
    gesture('bold', '😎');
    void sound.whinny();
    boast.disabled = true;
    cooldownTimer = setTimeout(() => { boast.disabled = false; }, 1500);
  });

  donate.addEventListener('click', () => {
    if (donate.disabled) return;
    donate.disabled = true;
    line.textContent = 'Cảm ơn đồng môn nhé!';
    gesture('smile', '❤️');
    donationTimer = setTimeout(openDonation, 500);
  });

  bubble.querySelector('.horse-close').addEventListener('click', dismiss);
  modal.querySelector('.donate-close').addEventListener('click', closeDonation);
  modal.addEventListener('cancel', event => {
    event.preventDefault();
    closeDonation();
  });
  modal.addEventListener('click', event => {
    if (event.target === modal) closeDonation();
  });
  modal.addEventListener('close', () => {
    clearTimeout(closeTimer);
    modal.removeAttribute('data-closing');
    document.body.classList.remove('donate-open');
    endConversation();
    resetInput();
    if (restoreGameFocus) restoreFocus();
    restoreGameFocus = false;
  });

  document.addEventListener('pointerdown', event => {
    if (!bubble.hidden && !bubble.contains(event.target)) dismiss();
  }, true);

  function reset() {
    endConversation();
    clearTimeout(cooldownTimer);
    boast.disabled = false;
    if (modal.open) modal.close();
  }

  function project(anchor) {
    if (bubble.hidden && emote.hidden) return;
    const visible = Math.abs(anchor.x) <= 1 && Math.abs(anchor.y) <= 1 && Math.abs(anchor.z) < 1;
    const x = (anchor.x * .5 + .5) * innerWidth;
    const y = (.5 - anchor.y * .5) * innerHeight;
    if (!bubble.hidden) {
      bubble.toggleAttribute('data-anchored', visible && innerHeight >= 480 && y > 300);
      bubble.style.setProperty('--horse-x', x + 'px');
      bubble.style.setProperty('--horse-y', y + 'px');
    }
    emote.style.visibility = visible ? 'visible' : 'hidden';
    if (visible && !emote.hidden) {
      emote.style.left = x + 'px';
      emote.style.top = Math.max(30, y - 8) + 'px';
    }
  }

  return {
    open, dismiss, reset, project,
    owns(target) { return bubble.contains(target); },
    get talking() { return !bubble.hidden || modal.open; },
    get optionsOpen() { return !bubble.hidden; },
    get modalOpen() { return modal.open; },
    get mood() { return mood; },
    get gestureAt() { return gestureAt; }
  };
}
