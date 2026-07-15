const currentUser = localStorage.getItem('cgpa-current-user');
if (!currentUser) window.location.replace('login.html');
const currentUserDetails = JSON.parse(localStorage.getItem('cgpa-users') || '{}')[currentUser];
document.querySelector('#userIdDisplay').textContent = currentUserDetails?.fullName || currentUser;
document.querySelector('#logout').onclick = () => { localStorage.removeItem('cgpa-current-user'); window.location.replace('login.html'); };

const semesters = document.querySelector('#semesters');
const semesterTpl = document.querySelector('#semesterTemplate');
const subjectTpl = document.querySelector('#subjectTemplate');
const downloadPdfSubject = document.querySelector('#downloadPdfSubject');
const downloadPdfSubjectTop = document.querySelector('#downloadPdfSubjectTop');
const downloadPdfGrade = document.querySelector('#downloadPdfGrade');
const subjectPdfButtons = [downloadPdfSubject, downloadPdfSubjectTop];
const setSubjectPdfDisabled = disabled => subjectPdfButtons.forEach(button => { button.disabled = disabled; });
const formatCredits = value => value.toFixed(1).replace(/\.0$/, '');

const updateSemesterCreditTotal = card => {
  const total = [...card.querySelectorAll('.credits')].reduce((sum, field) => {
    const credit = Number(field.value);
    return sum + (credit > 0 ? credit : 0);
  }, 0);
  card.querySelector('.credit-total-value').textContent = formatCredits(total);
};

const gradeOptions = semesterNumber => semesterNumber <= 2
  ? [['O', 10], ['E', 9], ['A', 8], ['B', 7], ['C', 6], ['D', 5], ['F', 2], ['SA', 0], ['M', 0]]
  : [['O', 10], ['A', 9], ['B', 8], ['C', 7], ['D', 6], ['P', 5], ['F', 2], ['SA', 0], ['M', 0]];

const addSubject = (card, semesterNumber = [...semesters.children].indexOf(card) + 1) => {
  const row = subjectTpl.content.cloneNode(true);
  const select = row.querySelector('.grade');
  select.innerHTML = '<option value="">Grade</option>' + gradeOptions(semesterNumber).map(([grade, point]) => `<option value="${point}">${grade} (${point})</option>`).join('');
  const subjectList = card.querySelector('.subject-list');
  const totalBar = subjectList.querySelector('.credit-total-bar');
  if (totalBar) subjectList.insertBefore(row, totalBar); else subjectList.append(row);
  updateSemesterCreditTotal(card);
};

const addSemester = () => {
  const card = semesterTpl.content.cloneNode(true);
  const element = card.querySelector('.semester');
  const semesterNumber = semesters.children.length + 1;
  element.querySelector('.semester-name').value = `Semester ${semesterNumber}`;
  for (let i = 0; i < 6; i++) addSubject(element, semesterNumber);
  semesters.append(card);
  saveState();
};

document.querySelector('#addSemester').onclick = addSemester;
semesters.addEventListener('click', event => {
  const card = event.target.closest('.semester');
  if (event.target.matches('.add-subject')) addSubject(card);
  if (event.target.matches('.remove-subject')) { event.target.closest('.subject-row').remove(); updateSemesterCreditTotal(card); }
  if (event.target.matches('.remove-semester')) {
    card.remove();
    [...semesters.children].forEach((semester, index) => {
      const name = semester.querySelector('.semester-name');
      if (/^Semester \d+$/.test(name.value)) name.value = `Semester ${index + 1}`;
    });
  }
  saveState();
});

semesters.addEventListener('input', event => {
  if (!event.target.matches('.credits')) return;
  const card = event.target.closest('.semester');
  if (card) updateSemesterCreditTotal(card);
});

document.querySelector('#calculate').onclick = () => {
  const output = [];
  const error = document.querySelector('#error');
  let totalCredits = 0, totalPoints = 0, valid = true;
  [...semesters.children].forEach((card, index) => {
    let credits = 0, points = 0;
    card.querySelectorAll('.subject-row').forEach(row => {
      const credit = Number(row.querySelector('.credits').value);
      const grade = row.querySelector('.grade').value;
      const used = row.querySelector('.subject-name').value || row.querySelector('.credits').value || grade;
      if (used && (!(credit > 0) || grade === '')) valid = false;
      if (credit > 0 && grade !== '') { credits += credit; points += credit * Number(grade); }
    });
    if (credits > 0) { totalCredits += credits; totalPoints += points; output.push({ name: card.querySelector('.semester-name').value || `Semester ${index + 1}`, credits, points, sgpa: points / credits }); }
  });
  if (!valid || !totalCredits) { error.textContent = 'Please enter a valid credit and grade for every subject you add.'; error.style.display = 'block'; document.querySelector('#result').style.display = 'none'; setSubjectPdfDisabled(true); return; }
  error.style.display = 'none';
  const cgpa = totalPoints / totalCredits;
  const escapeHtml = value => value.replace(/[&<>"']/g, match => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[match]));
  document.querySelector('#resultRows').innerHTML = output.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${item.credits.toFixed(1).replace(/\.0$/, '')}</td><td>${item.points.toFixed(1)}</td><td>${item.sgpa.toFixed(2)}</td></tr>`).join('');
  document.querySelector('#totalCredits').textContent = totalCredits.toFixed(1).replace(/\.0$/, '');
  document.querySelector('#totalPoints').textContent = totalPoints.toFixed(1);
  document.querySelector('#cgpa').textContent = document.querySelector('#finalCgpa').textContent = cgpa.toFixed(2);
  document.querySelector('#result').style.display = 'block';
  setSubjectPdfDisabled(false);
  document.querySelector('#result').scrollIntoView({ behavior:'smooth', block:'nearest' });
};

const ordinal = number => `${number}${number === 1 ? 'st' : number === 2 ? 'nd' : number === 3 ? 'rd' : 'th'}`;
document.querySelector('#gradeRows').innerHTML = Array.from({ length:8 }, (_, index) => `<tr><td>${ordinal(index + 1)}</td><td><input class="semester-credit" type="number" min="0.5" step="0.5" placeholder="Credits" aria-label="${ordinal(index + 1)} semester credits"></td><td><input class="semester-sgpa" type="number" min="0" max="10" step="0.01" placeholder="SGPA" aria-label="${ordinal(index + 1)} semester SGPA"></td></tr>`).join('');
document.querySelector('#calculateGrade').onclick = () => {
  let credits = 0, points = 0, valid = true, hasEntry = false;
  document.querySelectorAll('#gradeRows tr').forEach(row => {
    const credit = Number(row.querySelector('.semester-credit').value);
    const sgpaText = row.querySelector('.semester-sgpa').value;
    const sgpa = Number(sgpaText);
    if (row.querySelector('.semester-credit').value || sgpaText) { hasEntry = true; if (!(credit > 0) || sgpaText === '' || sgpa < 0 || sgpa > 10) valid = false; else { credits += credit; points += credit * sgpa; } }
  });
  const error = document.querySelector('#gradeError');
  if (!valid || !hasEntry) { error.textContent = 'Enter a valid credit and SGPA (0–10) for each completed semester.'; error.style.display = 'block'; downloadPdfGrade.disabled = true; return; }
  error.style.display = 'none';
  document.querySelector('#gradeTotalCredits').textContent = credits.toFixed(1).replace(/\.0$/, '');
  document.querySelector('#gradeCgpa').textContent = (points / credits).toFixed(2);
  downloadPdfGrade.disabled = false;
  saveState();
};

const getPdfDoc = () => {
  const jsPdf = window.jspdf?.jsPDF;
  if (!jsPdf) {
    window.alert('PDF export is unavailable right now. Please refresh and try again.');
    return null;
  }
  return new jsPdf({ orientation: 'portrait', unit: 'pt', format: 'a4' });
};

const drawTable = (doc, headers, rows, startY) => {
  const left = 48;
  const widths = [220, 80, 95, 80];
  const rowHeight = 22;
  const pageHeight = doc.internal.pageSize.height;
  let y = startY;
  const drawRow = (cells, bold = false) => {
    if (y + rowHeight > pageHeight - 48) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    let x = left;
    cells.forEach((cell, index) => {
      doc.rect(x, y, widths[index], rowHeight);
      doc.text(String(cell), x + 6, y + 15, { maxWidth: widths[index] - 12 });
      x += widths[index];
    });
    y += rowHeight;
  };
  drawRow(headers, true);
  rows.forEach(row => drawRow(row));
  return y;
};

const pdfFileName = prefix => `${prefix}-${new Date().toISOString().slice(0, 10)}.pdf`;

const downloadSubjectPdf = () => {
  if (downloadPdfSubject.disabled) return;
  const doc = getPdfDoc();
  if (!doc) return;
  const rows = [...document.querySelectorAll('#resultRows tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent.trim()));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('CGPA Report (Subject-wise)', 48, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Student: ${currentUserDetails?.fullName || currentUser}`, 48, 72);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 48, 88);
  drawTable(doc, ['Semester', 'Credits', 'Points', 'SGPA'], rows.concat([['Total', document.querySelector('#totalCredits').textContent, document.querySelector('#totalPoints').textContent, document.querySelector('#finalCgpa').textContent]]), 110);
  doc.save(pdfFileName('cgpa-subject'));
};
downloadPdfSubject.onclick = downloadSubjectPdf;
downloadPdfSubjectTop.onclick = downloadSubjectPdf;

downloadPdfGrade.onclick = () => {
  if (downloadPdfGrade.disabled) return;
  const doc = getPdfDoc();
  if (!doc) return;
  const rows = [];
  document.querySelectorAll('#gradeRows tr').forEach((row, index) => {
    const credit = row.querySelector('.semester-credit').value;
    const sgpa = row.querySelector('.semester-sgpa').value;
    if (credit || sgpa) rows.push([`Semester ${index + 1}`, credit || '-', '-', sgpa || '-']);
  });
  rows.push(['Total', document.querySelector('#gradeTotalCredits').textContent, '-', document.querySelector('#gradeCgpa').textContent]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('CGPA Report (Grade-wise)', 48, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Student: ${currentUserDetails?.fullName || currentUser}`, 48, 72);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 48, 88);
  drawTable(doc, ['Semester', 'Credits', 'Points', 'SGPA'], rows, 110);
  doc.save(pdfFileName('cgpa-grade'));
};

const subjectCalculator = document.querySelector('#subjectCalculator');
const gradeCalculator = document.querySelector('#gradeCalculator');
const heroTitle = document.querySelector('.hero h1');
const heroText = document.querySelector('.hero p');
const modeLabels = document.querySelectorAll('#modeToggle span');
document.querySelector('#modeToggle').onclick = () => {
  const gradeMode = !gradeCalculator.classList.contains('active');
  subjectCalculator.classList.toggle('active', !gradeMode); gradeCalculator.classList.toggle('active', gradeMode);
  modeLabels[0].classList.toggle('active', !gradeMode); modeLabels[1].classList.toggle('active', gradeMode);
  heroTitle.textContent = gradeMode ? 'Your CGPA, in one clear table.' : 'Your grades, clearly calculated.';
  heroText.textContent = gradeMode ? 'Enter the credits and SGPA for each semester to calculate your final CGPA.' : 'Add each subject with its credit and grade. We’ll calculate your final credits and CGPA.';
  saveState();
};

const themeToggle = document.querySelector('#themeToggle');
const systemTheme = document.querySelector('#systemTheme');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
let savedTheme = localStorage.getItem('cgpa-theme') || 'system';
const applyTheme = theme => {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', theme);
  const dark = theme === 'dark' || (theme === 'system' && systemDark.matches);
  themeToggle.classList.toggle('dark', dark); themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'); systemTheme.classList.toggle('active', theme === 'system');
};
applyTheme(savedTheme);
themeToggle.onclick = () => { const currentlyDark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.hasAttribute('data-theme') && systemDark.matches); savedTheme = currentlyDark ? 'light' : 'dark'; localStorage.setItem('cgpa-theme', savedTheme); applyTheme(savedTheme); };
systemTheme.onclick = () => { savedTheme = 'system'; localStorage.setItem('cgpa-theme', savedTheme); applyTheme(savedTheme); };
systemDark.addEventListener('change', () => { if (savedTheme === 'system') applyTheme('system'); });

function saveState() {
  if (!currentUser) return;
  const data = {
    gradeMode: gradeCalculator.classList.contains('active'),
    semesters: [...semesters.children].map(card => ({
      name: card.querySelector('.semester-name').value,
      subjects: [...card.querySelectorAll('.subject-row')].map(row => ({
        name: row.querySelector('.subject-name').value,
        credits: row.querySelector('.credits').value,
        grade: row.querySelector('.grade').value
      }))
    })),
    gradeRows: [...document.querySelectorAll('#gradeRows tr')].map(row => ({
      credits: row.querySelector('.semester-credit').value,
      sgpa: row.querySelector('.semester-sgpa').value
    }))
  };
  localStorage.setItem(`cgpa-data-${currentUser}`, JSON.stringify(data));
}

function restoreState() {
  const data = JSON.parse(localStorage.getItem(`cgpa-data-${currentUser}`) || 'null');
  if (!data) { addSemester(); return; }
  semesters.innerHTML = '';
  data.semesters.forEach((savedSemester, index) => {
    const card = semesterTpl.content.cloneNode(true);
    const element = card.querySelector('.semester');
    element.querySelector('.semester-name').value = savedSemester.name || `Semester ${index + 1}`;
    savedSemester.subjects.forEach(savedSubject => {
      addSubject(element, index + 1);
      const row = element.querySelector('.subject-row:last-child');
      row.querySelector('.subject-name').value = savedSubject.name;
      row.querySelector('.credits').value = savedSubject.credits;
      row.querySelector('.grade').value = savedSubject.grade;
    });
    semesters.append(card);
  });
  data.gradeRows?.forEach((savedRow, index) => {
    const row = document.querySelectorAll('#gradeRows tr')[index];
    if (row) { row.querySelector('.semester-credit').value = savedRow.credits; row.querySelector('.semester-sgpa').value = savedRow.sgpa; }
  });
  if (data.gradeMode) document.querySelector('#modeToggle').click();
  [...semesters.children].forEach(updateSemesterCreditTotal);
}

document.addEventListener('input', saveState);
document.addEventListener('change', saveState);
restoreState();
