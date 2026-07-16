﻿const verifiedUserId = sessionStorage.getItem("cgpa-password-change-user");
if (!verifiedUserId) window.location.replace("change-password.html");

const form = document.querySelector("#changePasswordForm");
const oldPassword = document.querySelector("#oldPassword");
const newPassword = document.querySelector("#newPassword");
const confirmPassword = document.querySelector("#confirmPassword");
const message = document.querySelector("#message");
const passwordHelp = document.querySelector("#passwordHelp");
const strongPassword = /^(?=.{8,}$)(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/;


document.querySelectorAll(".password-toggle").forEach((button) => {
  button.onclick = () => {
    const input = button.parentElement.querySelector("input");
    const icon = button.querySelector("i");
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    button.classList.toggle("visible", visible);
    button.setAttribute(
      "aria-label",
      visible ? "Hide password" : "Show password",
    );
    button.title = visible ? "Hide password" : "Show password";
    icon.className = visible ? "bx bx-show" : "bx bx-hide";
  };
});

newPassword.addEventListener("input", () => {
  const valid = strongPassword.test(newPassword.value);
  passwordHelp.classList.toggle("valid", valid);
  passwordHelp.textContent = valid
    ? "Strong password âœ“"
    : "At least 8 characters, with an uppercase letter, number, and special character.";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const users = JSON.parse(localStorage.getItem("cgpa-users") || "{}");
  const user = users[verifiedUserId];
  if (!user || user.password !== oldPassword.value) {
    message.textContent = "Your old password is incorrect.";
    return;
  }
  if (!strongPassword.test(newPassword.value)) {
    message.textContent =
      "Your new password does not meet the required criteria.";
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    message.textContent = "The new password and confirmation do not match.";
    return;
  }
  user.password = newPassword.value;
  localStorage.setItem("cgpa-users", JSON.stringify(users));
  sessionStorage.removeItem("cgpa-password-change-user");
  window.location.href = "login.html";
});

document.querySelector("#backToLogin").onclick = () => {
  sessionStorage.removeItem("cgpa-password-change-user");
  window.location.href = "login.html";
};
