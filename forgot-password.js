﻿const form = document.querySelector('#recoveryForm');
const userId = document.querySelector('#userId');
const fullName = document.querySelector('#fullName');
const message = document.querySelector('#message');
const passwordResult = document.querySelector('#passwordResult');


form.addEventListener('submit', event => {
  event.preventDefault();
  const users = JSON.parse(localStorage.getItem('cgpa-users') || '{}');
  const user = users[userId.value.trim()];
  passwordResult.style.display = 'none';
  if (!user || !user.fullName || user.fullName.trim().toLowerCase() !== fullName.value.trim().toLowerCase()) { message.textContent = 'The user ID and full name do not match our records.'; return; }
  message.textContent = '';
  passwordResult.textContent = `Your password is: ${user.password}`;
  passwordResult.style.display = 'block';
});

document.querySelector('#backToLogin').onclick = () => { window.location.href = 'login.html'; };
