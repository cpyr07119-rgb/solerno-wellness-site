const passwordInput = document.getElementById("password");
const loadButton = document.getElementById("load");
const rows = document.getElementById("rows");
const msg = document.getElementById("adminMessage");
const statuses = ["Новая","Подтверждена","Связаться","Отменена","Состоялась"];
function el(tag, text) { const n = document.createElement(tag); n.textContent = text || ""; return n; }
async function loadBookings() {
  msg.textContent = "Загружаем…";
  try {
    const res = await fetch("/api/admin/bookings", { headers: { "x-admin-password": passwordInput.value } });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || "Не удалось загрузить заявки.");
    rows.replaceChildren();
    if (!data.bookings.length) rows.append(el("tr")).append(el("td", "Пока заявок нет."));
    data.bookings.forEach(b => {
      const tr = document.createElement("tr");
      const created = new Date(b.createdAt).toLocaleString("ru-RU");
      tr.append(el("td", created));
      const client = document.createElement("td");
      client.append(el("b", b.name), document.createElement("br"), el("a", b.phone));
      client.lastChild.href = "tel:" + b.phone;
      client.append(document.createElement("br"), el("small", b.id));
      tr.append(client);
      const service = document.createElement("td");
      service.append(el("div", b.service), el("small", (b.date || "Дата не указана") + " · " + (b.time || "время не указано")));
      tr.append(service);
      tr.append(el("td", b.comment || "—"));
      const td = document.createElement("td");
      const select = document.createElement("select"); select.className = "status-select";
      statuses.forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s; if (s === b.status) o.selected = true; select.append(o); });
      select.addEventListener("change", async () => {
        const r = await fetch("/api/admin/bookings/" + encodeURIComponent(b.id), {
          method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-password": passwordInput.value },
          body: JSON.stringify({ status: select.value })
        });
        const d = await r.json();
        if (!r.ok || !d.ok) { msg.textContent = d.message || "Не удалось изменить статус."; }
        else { msg.textContent = "Статус заявки " + b.id + " обновлён."; }
      });
      td.append(select); tr.append(td); rows.append(tr);
    });
    msg.textContent = "Заявок: " + data.bookings.length;
  } catch (e) { msg.textContent = e.message; }
}
loadButton.addEventListener("click", loadBookings);
passwordInput.addEventListener("keydown", e => { if (e.key === "Enter") loadBookings(); });
