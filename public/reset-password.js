const form = document.getElementById('reset-form');
const password = document.getElementById('password');
const confirmation = document.getElementById('confirm-password');
const submitButton = document.getElementById('submit-button');
const status = document.getElementById('status');
const successPanel = document.getElementById('success-panel');
const token = new URLSearchParams(window.location.search).get('token')?.trim();

if (token) {
  window.history.replaceState({}, document.title, window.location.pathname);
} else {
  showError('This password reset link is missing its token. Request a new reset email.');
  disableForm();
}

for (const button of document.querySelectorAll('.show-password')) {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.target);
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.textContent = visible ? 'Show' : 'Hide';
    button.setAttribute('aria-label', `${visible ? 'Show' : 'Hide'} password`);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideStatus();

  if (!token) {
    showError('This password reset link is invalid. Request a new reset email.');
    return;
  }
  if (password.value.length < 10) {
    showError('Your new password must contain at least 10 characters.');
    password.focus();
    return;
  }
  if (password.value !== confirmation.value) {
    showError('The passwords do not match.');
    confirmation.focus();
    return;
  }

  setLoading(true);
  try {
    const response = await fetch('/api/v1/auth/password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: password.value }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        body?.error?.message || 'The password could not be updated. Request a new reset link.',
      );
    }

    password.value = '';
    confirmation.value = '';
    form.hidden = true;
    status.hidden = true;
    successPanel.hidden = false;
    successPanel.querySelector('h2').focus?.();
  } catch (error) {
    showError(error.message || 'A network error occurred. Please try again.');
  } finally {
    setLoading(false);
  }
});

function showError(message) {
  status.textContent = message;
  status.className = 'status error';
  status.hidden = false;
}

function hideStatus() {
  status.hidden = true;
  status.textContent = '';
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.classList.toggle('is-loading', loading);
  submitButton.querySelector('.button-label').textContent = loading
    ? 'Updating password…'
    : 'Reset password';
}

function disableForm() {
  for (const element of form.elements) element.disabled = true;
}
