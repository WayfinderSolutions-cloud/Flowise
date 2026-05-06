const form = document.getElementById("gateForm");
const answerEl = document.getElementById("answer");
const resultEl = document.getElementById("result");
const submitBtn = document.getElementById("submitBtn");

function setResult(type, html) {
  resultEl.classList.remove("ok", "bad");
  if (type) resultEl.classList.add(type);
  resultEl.innerHTML = html;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  setResult(null, "Listening…");

  try {
    const resp = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: answerEl.value })
    });

    const data = await resp.json();

    if (!resp.ok) {
      setResult("bad", data.message || "Request failed.");
      return;
    }

    if (!data.ok) {
      const extra = (data.remainingAttempts != null)
        ? `<div class="small">Remaining attempts: ${data.remainingAttempts}</div>`
        : "";
      setResult("bad", `${data.message}${extra}`);
      return;
    }

    // SUCCESS -> redirect
    window.location.href = "/jump";
  } catch (err) {
    setResult("bad", `Error: ${String(err)}`);
  } finally {
    submitBtn.disabled = false;
  }
});