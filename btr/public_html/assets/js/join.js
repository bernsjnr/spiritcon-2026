/* Join form: accessible client-side validation and a mocked submit.
   The server re-validates everything in Phase 3. This layer is for
   people, not security. */

const form = document.querySelector('[data-join-form]');
const summary = form.querySelector('[data-error-summary]');
const summaryList = form.querySelector('[data-error-list]');
const success = document.querySelector('[data-join-success]');
const heardFrom = form.elements.heard_from;
const heardOther = form.querySelector('[data-heard-other]');

/* UK and international mobiles: 10 to 15 digits once spaces and symbols go. */
const PHONE_DIGITS = /^\+?\d{10,15}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const rules = {
  name: (v) => (v.length < 2 ? 'Enter your full name' : ''),
  email: (v) => (!v ? 'Enter your email address' : !EMAIL.test(v) ? 'Enter an email address like name@example.com' : ''),
  phone: (v) => (!v ? 'Enter your mobile number' : !PHONE_DIGITS.test(v.replace(/[\s()-]/g, '')) ? 'Enter a mobile number like 07700 900123' : ''),
  area: (v) => (!v ? 'Tell us roughly where you are, like E8 or Peckham' : ''),
  level: (v) => (!v ? 'Choose where you are with your running' : ''),
  pace: (v) => (!v ? 'Choose a comfortable pace, or "Not sure yet"' : ''),
  goals: (v) => (v.length < 3 ? 'Tell us a little about your goals' : ''),
  why_btr: (v) => (v.length < 3 ? 'Tell us why you want to join' : ''),
  heard_from: (v) => (!v ? 'Choose how you heard about us' : ''),
  consent: (_, el) => (!el.checked ? 'Tick the box to agree to the privacy notice' : ''),
};

function fieldValue(el) {
  return el.type === 'checkbox' ? el.checked : el.value.trim();
}

function setError(name, message) {
  const el = form.elements[name];
  const slot = form.querySelector(`[data-error-for="${name}"]`);
  if (!el || !slot) return;
  slot.textContent = message ? message : '';
  if (message) {
    slot.insertAdjacentHTML('afterbegin', '<span class="visually-hidden">Error: </span>');
    el.setAttribute('aria-invalid', 'true');
  } else {
    el.removeAttribute('aria-invalid');
  }
}

function validateField(name) {
  const el = form.elements[name];
  const message = rules[name](fieldValue(el), el);
  setError(name, message);
  return message;
}

function validateAll() {
  const errors = [];
  for (const name of Object.keys(rules)) {
    const message = validateField(name);
    if (message) errors.push({ name, message });
  }
  return errors;
}

function showSummary(errors) {
  summaryList.innerHTML = '';
  for (const { name, message } of errors) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${form.elements[name].id}`;
    a.textContent = message;
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const target = form.elements[name];
      target.scrollIntoView({ block: 'center' });
      target.focus({ preventScroll: true });
    });
    li.append(a);
    summaryList.append(li);
  }
  summary.hidden = false;
  summary.focus();
}

/* Re-check a field once someone has touched it, so errors clear as they fix them. */
for (const name of Object.keys(rules)) {
  const el = form.elements[name];
  const event = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'blur';
  el.addEventListener(event, () => {
    if (el.hasAttribute('aria-invalid') || event === 'blur' && el.value.trim()) validateField(name);
  });
  if (event === 'blur') {
    el.addEventListener('input', () => {
      if (el.hasAttribute('aria-invalid')) validateField(name);
    });
  }
}

heardFrom.addEventListener('change', () => {
  heardOther.hidden = heardFrom.value !== 'other';
});

form.addEventListener('submit', (ev) => {
  ev.preventDefault();

  /* Bots fill every field. Pretend it worked and send nothing. */
  if (form.elements.website.value) {
    showSuccess('');
    return;
  }

  const errors = validateAll();
  if (errors.length) {
    showSummary(errors);
    return;
  }
  summary.hidden = true;

  /* Phase 3 swaps this for a fetch() POST to /api/apply.php with the
     Turnstile token and CSRF token. For now we just show what's next. */
  showSuccess(form.elements.email.value.trim());
});

function showSuccess(email) {
  form.hidden = true;
  success.querySelector('[data-success-email]').textContent = email || 'your inbox';
  success.hidden = false;
  success.focus();
  success.scrollIntoView({ block: 'start' });
}
