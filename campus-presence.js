export const PRESENCE_IDLE_MS = 120_000;
export const PRESENCE_HEARTBEAT_MS = 8_000;
const statusLabels = { active: 'Đang hoạt động', idle: 'Không thao tác', away: 'Vắng mặt' };
const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
const searchText = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');

export function createPresencePanel({ dialog, buttons, badges, resetInput, canOpen }) {
  const header = dialog.querySelector('h2');
  const list = dialog.querySelector('#presenceList');
  const message = dialog.querySelector('#presenceMessage');
  const query = dialog.querySelector('#presenceSearch');
  const sort = dialog.querySelector('#presenceSort');
  const players = new Map();
  const rows = new Map();
  let selfId = '';
  let connection = 'loading';
  let opener;
  let backdropPressed = false;

  function count() {
    const value = connection === 'ready' ? players.size : 0;
    for (const badge of badges) if (badge.textContent !== String(value)) badge.textContent = String(value);
    const title = `Online · ${value} người`;
    if (header.textContent !== title) header.textContent = title;
  }

  function update() {
    count();
    if (!dialog.open) return;
    const filter = searchText(query.value.trim());
    const sorted = [...players.values()].filter(player => !filter || player.search.includes(filter));
    sorted.sort((a, b) => Number(b.id === selfId) - Number(a.id === selfId)
      || (sort.value === 'cohort' ? collator.compare(a.year, b.year) || collator.compare(a.className, b.className) : 0)
      || collator.compare(a.name, b.name) || collator.compare(a.id, b.id));
    const shown = new Set(sorted.map(player => player.id));
    for (const [id, row] of rows) {
      if (!players.has(id)) { row.item.remove(); rows.delete(id); }
      else if (!shown.has(id)) row.item.remove();
    }
    for (const [index, player] of sorted.entries()) {
      let row = rows.get(player.id);
      if (!row) {
        const item = document.createElement('li');
        const details = document.createElement('div');
        const name = document.createElement('strong');
        const cohort = document.createElement('small');
        const status = document.createElement('span');
        status.className = 'presence-status';
        details.append(name, cohort);
        item.append(details, status);
        row = { item, name, cohort, status };
        rows.set(player.id, row);
      }
      const title = player.name + (player.id === selfId ? ' (Bạn)' : '');
      if (row.name.textContent !== title) row.name.textContent = title;
      if (row.cohort.textContent !== player.cohort) row.cohort.textContent = player.cohort;
      if (row.status.dataset.state !== player.status) {
        row.status.dataset.state = player.status;
        row.status.textContent = statusLabels[player.status];
      }
      if (list.children[index] !== row.item) list.insertBefore(row.item, list.children[index] ?? null);
    }
    const text = connection === 'loading' ? 'Đang kết nối phòng…'
      : connection === 'offline' ? 'Chưa kết nối được phòng chơi.'
      : players.size <= 1 ? 'Chưa có ai khác online.'
      : sorted.length === 0 ? 'Không tìm thấy người phù hợp.' : '';
    message.hidden = !text;
    if (message.textContent !== text) message.textContent = text;
  }

  function setPlayer(id, profile, status = 'active') {
    if (!id) return;
    const { name = 'Học sinh', className = '', year = '' } = profile ?? {};
    const cohort = [className, year].filter(Boolean).join(' · ');
    players.set(id, { id, name, className, year, cohort, search: searchText(`${name} ${cohort}`), status: statusLabels[status] ? status : 'active' });
    update();
  }

  for (const button of buttons) button.addEventListener('click', () => {
    if (dialog.open || !canOpen()) return;
    opener = button;
    resetInput();
    dialog.showModal();
    for (const toggle of buttons) toggle.setAttribute('aria-expanded', 'true');
    update();
  });
  dialog.querySelector('#presenceClose').onclick = () => dialog.close();
  dialog.addEventListener('pointerdown', event => { backdropPressed = event.target === dialog; });
  dialog.addEventListener('click', event => { if (backdropPressed && event.target === dialog) dialog.close(); backdropPressed = false; });
  dialog.addEventListener('close', () => {
    for (const toggle of buttons) toggle.setAttribute('aria-expanded', 'false');
    if (opener?.offsetParent) opener.focus();
    resetInput();
  });
  query.addEventListener('input', update);
  sort.addEventListener('change', update);

  return {
    setPlayer,
    setStatus(id, status) {
      const player = players.get(id);
      if (player && statusLabels[status] && player.status !== status) { player.status = status; update(); }
    },
    remove(id) { if (players.delete(id)) update(); },
    reset(state = 'loading') { players.clear(); selfId = ''; connection = state; update(); },
    ready(id, profile, status) { selfId = id; connection = 'ready'; setPlayer(id, profile, status); },
    close() { if (dialog.open) dialog.close(); },
    get open() { return dialog.open; }
  };
}
