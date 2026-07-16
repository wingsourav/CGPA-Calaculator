﻿const form = document.querySelector('#verifyUserForm');
const userId = document.querySelector('#userId');
const message = document.querySelector('#message');


form.addEventListener('submit', event => {
  event.preventDefault();
  const id = userId.value.trim();
  const users = JSON.parse(localStorage.getItem('cgpa-users') || '{}');
  if (!users[id]) { message.textContent = 'This user ID was not found.'; return; }
  sessionStorage.setItem('cgpa-password-change-user', id);
  window.location.href = 'change-password-form.html';
});

document.querySelector('#backToLogin').onclick = () => { window.location.href = 'login.html'; };
