const form = document.querySelector("#createAccountForm");
const fullName = document.querySelector("#fullName");
const userId = document.querySelector("#userId");
const password = document.querySelector("#password");
const message = document.querySelector("#message");
const passwordHelp = document.querySelector("#passwordHelp");
const passwordToggle = document.querySelector("#passwordToggle");
const passwordToggleIcon = document.querySelector("#passwordToggleIcon");
const strongPassword = /^(?=.{8,}$)(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/;


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

password.addEventListener("input", () => {
  const valid = strongPassword.test(password.value);
  passwordHelp.classList.toggle("valid", valid);
  passwordHelp.textContent = valid
    ? "Strong password âœ“"
    : "At least 8 characters, with an uppercase letter, number, and special character.";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = fullName.value.trim();
  const id = userId.value.trim();
  const users = JSON.parse(localStorage.getItem("cgpa-users") || "{}");
  if (name.length < 2) {
    message.textContent = "Please enter your full name.";
    return;
  }
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(id)) {
    message.textContent =
      "Use 3â€“30 letters, numbers, underscores, or hyphens for the user ID.";
    return;
  }
  if (!strongPassword.test(password.value)) {
    message.textContent =
      "Password must be at least 8 characters and include an uppercase letter, number, and special character.";
    return;
  }
  if (users[id]) {
    message.textContent =
      "This user ID is already taken. Please choose another one.";
    return;
  }
  users[id] = { fullName: name, password: password.value };
  localStorage.setItem("cgpa-users", JSON.stringify(users));
  localStorage.setItem("cgpa-current-user", id);
  window.location.href = "index.html";
});

document.querySelector("#backToLogin").onclick = () => {
  window.location.href = "login.html";
};
