const form = document.querySelector("#loginForm");
const userId = document.querySelector("#userId");
const password = document.querySelector("#password");
const message = document.querySelector("#message");
const passwordToggle = document.querySelector("#passwordToggle");
const passwordToggleIcon = document.querySelector("#passwordToggleIcon");
const getUsers = () => JSON.parse(localStorage.getItem("cgpa-users") || "{}");
const showMessage = (text) => {
  message.textContent = text;
};
const signIn = () => {
  localStorage.setItem("cgpa-current-user", userId.value.trim());
  window.location.href = "index.html";
};
passwordToggle.onclick = () => {
  const visible = password.type === "password";
  password.type = visible ? "text" : "password";
  passwordToggle.classList.toggle("visible", visible);
  passwordToggle.setAttribute(
    "aria-label",
    visible ? "Hide password" : "Show password",
  );
  passwordToggle.title = visible ? "Hide password" : "Show password";
  passwordToggleIcon.className = visible ? "bx bx-show" : "bx bx-hide";
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = userId.value.trim();
  const users = getUsers();
  if (!users[id] || users[id].password !== password.value) {
    showMessage("Incorrect user ID or password.");
    return;
  }
  signIn();
});

document.querySelector("#createAccount").onclick = () => {
  window.location.href = "create-account.html";
};
document.querySelector("#forgotPassword").onclick = () => {
  window.location.href = "forgot-password.html";
};
document.querySelector("#changePassword").onclick = () => {
  window.location.href = "change-password.html";
};
