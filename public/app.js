const menuToggle = document.getElementById("menuToggle");
const nav = document.getElementById("nav");
if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => nav.classList.toggle("open"));
  nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => nav.classList.remove("open")));
}
document.getElementById("year").textContent = new Date().getFullYear();

const dateInput = document.getElementById("bookingDate");
if (dateInput) {
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  dateInput.min = local;
}

document.querySelectorAll(".choose-plan").forEach(link => link.addEventListener("click", () => {
  const plan = link.dataset.plan || "";
  const select = document.getElementById("service");
  if (select) {
    const option = Array.from(select.options).find(o => plan.toLowerCase().includes(o.value.toLowerCase().replace("абонемент ", "")) || o.text.toLowerCase().includes(plan.split(" — ")[0].toLowerCase()));
    if (option) select.value = option.value;
  }
}));
document.querySelectorAll(".schedule-book").forEach(link => link.addEventListener("click", () => {
  const service = link.dataset.service;
  const select = document.getElementById("service");
  if (select && service) select.value = service;
}));

const form = document.getElementById("bookingForm");
const message = document.getElementById("formMessage");
if (form && message) {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    message.className = "form-message";
    message.textContent = "Отправляем заявку…";
    const data = new FormData(form);
    const payload = {
      name: data.get("name"),
      phone: data.get("phone"),
      service: data.get("service"),
      date: data.get("date"),
      time: data.get("time"),
      comment: data.get("comment"),
      consent: data.get("consent") === "on",
      website: data.get("website")
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.style.opacity = ".7";
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Не удалось отправить заявку.");
      message.className = "form-message success";
      message.textContent = result.message + (result.id ? " Номер заявки: " + result.id : "");
      form.reset();
      if (dateInput) dateInput.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,10);
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message || "Ошибка отправки. Пожалуйста, позвоните в клуб.";
    } finally {
      button.disabled = false;
      button.style.opacity = "1";
    }
  });
}
