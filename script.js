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
const marksheetGrades = new Set(['O', 'E', 'A', 'B', 'C', 'D', 'P', 'F', 'SA', 'M']);
const marksheetCodePattern = /\b[A-Z1]{1,3}[0-9IO]{3,4}[A-Z]?\b/g;
const marksheetRowPattern = /^(?:\d{1,2}[.)]?\s+)?([A-Z1]{1,3}[0-9IO]{3,4}[A-Z]?)\s+(.+?)\s+([0-9OIL]{1,3}(?:[.,][0-9OIL]{1,2})?)\s+([A-Z0-9]{1,2})$/i;
const marksheetTailPattern = /([0-9OIL]{1,3}(?:[.,][0-9OIL]{1,2})?)\s+([A-Z0-9]{1,2})\s*$/i;

const setSubjectError = message => {
  const error = document.querySelector('#error');
  if (!message) { error.style.display = 'none'; return; }
  error.textContent = message;
  error.style.display = 'block';
};

const normalizeCredit = value => {
  const cleaned = String(value).toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0').replace(',', '.');
  let credit = Number(cleaned);
  if (!Number.isFinite(credit) || credit <= 0) return null;
  if (Number.isInteger(credit)) {
    while (credit >= 10) credit /= 10;
  }
  return Math.round(credit * 2) / 2;
};

const normalizeCode = value => {
  let normalized = String(value).toUpperCase().replace(/\s+/g, '');
  normalized = normalized.replace(/^1/, 'I').replace(/(^[A-Z1]{1,3})([0-9IO]{3,4})([A-Z]?)$/, (_, prefix, digits, suffix) => `${prefix.replace(/1/g, 'I')}${digits.replace(/I/g, '1').replace(/O/g, '0')}${suffix}`);
  return normalized;
};

const parseMarksheetRow = text => {
  const match = text.replace(/\s+/g, ' ').trim().match(marksheetRowPattern);
  if (!match) return null;
  const code = normalizeCode(match[1]);
  const subject = match[2].trim().replace(/\s+/g, ' ');
  const credit = normalizeCredit(match[3]);
  const grade = match[4].toUpperCase().replace(/^0$/, 'O');
  if (!subject || !(credit > 0) || !marksheetGrades.has(grade)) return null;
  return { code, subject, credit, grade };
};

const uniqueMarksheetRows = rows => rows.filter((row, index, source) => source.findIndex(candidate => candidate.code === row.code) === index);

const extractRowsByCodeChunks = text => {
  const normalized = text.toUpperCase().replace(/\s+/g, ' ').trim();
  const markers = [];
  let match;
  marksheetCodePattern.lastIndex = 0;
  while ((match = marksheetCodePattern.exec(normalized)) !== null) {
    markers.push({ code: match[0], index: match.index });
  }
  if (!markers.length) return [];
  const stopMatch = normalized.match(/\bTOTAL CREDITS\b|\bPUBLISHED ON\b|\bSGPA\b/);
  const endLimit = stopMatch ? stopMatch.index : normalized.length;
  const rows = [];
  for (let index = 0; index < markers.length; index++) {
    const start = markers[index].index;
    const nextStart = index + 1 < markers.length ? markers[index + 1].index : endLimit;
    if (start >= endLimit) break;
    const segment = normalized.slice(start, Math.min(nextStart, endLimit)).replace(/\s+\d{1,2}[.)]?\s*$/, '').trim();
    const code = markers[index].code;
    const withoutCode = segment.replace(new RegExp(`^${code}\\s+`), '').trim();
    const tail = withoutCode.match(marksheetTailPattern);
    if (!tail) continue;
    const subject = withoutCode.slice(0, withoutCode.length - tail[0].length).replace(/^\d{1,2}[.)]?\s+/, '').trim();
    const parsed = parseMarksheetRow(`${code} ${subject} ${tail[1]} ${tail[2]}`);
    if (parsed) rows.push(parsed);
  }
  return uniqueMarksheetRows(rows);
};

const extractRowsByLineJoin = text => {
  const rows = [];
  let pending = '';
  const codeInLinePattern = /\b[A-Z1]{1,3}[0-9IO]{3,4}[A-Z]?\b/i;
  text.split(/\r?\n/).map(line => line.trim().replace(/\s+/g, ' ')).forEach(line => {
    if (!line || /subject code|sl\.?\s*no|total credits|published on|sgpa|grade$/i.test(line)) return;
    if (codeInLinePattern.test(line.toUpperCase())) {
      if (pending) {
        const parsed = parseMarksheetRow(pending);
        if (parsed) rows.push(parsed);
      }
      pending = line;
      const parsed = parseMarksheetRow(pending);
      if (parsed) { rows.push(parsed); pending = ''; }
      return;
    }
    if (!pending) return;
    pending = `${pending} ${line}`.trim();
    const parsed = parseMarksheetRow(pending);
    if (parsed) { rows.push(parsed); pending = ''; }
  });
  if (pending) {
    const parsed = parseMarksheetRow(pending);
    if (parsed) rows.push(parsed);
  }
  return uniqueMarksheetRows(rows);
};

const extractMarksheetRows = text => {
  const chunkRows = extractRowsByCodeChunks(text);
  const lineRows = extractRowsByLineJoin(text);
  const combined = [...chunkRows];
  lineRows.forEach(row => {
    if (!combined.some(existing => existing.code === row.code)) combined.push(row);
  });
  return combined.length ? combined : (chunkRows.length >= lineRows.length ? chunkRows : lineRows);
};

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
  if (!card) return null;
  const row = subjectTpl.content.cloneNode(true);
  const subjectRow = row.querySelector('.subject-row');
  const select = row.querySelector('.grade');
  if (!subjectRow || !select) return null;
  select.innerHTML = '<option value="">Grade</option>' + gradeOptions(semesterNumber).map(([grade, point]) => `<option value="${point}">${grade} (${point})</option>`).join('');
  const subjectList = card.querySelector('.subject-list');
  if (!subjectList) return null;
  const totalBar = subjectList.querySelector('.credit-total-bar');
  if (totalBar) subjectList.insertBefore(row, totalBar); else subjectList.append(row);
  updateSemesterCreditTotal(card);
  return subjectRow;
};

const applyMarksheetRows = (card, rows) => {
  const semesterNumber = [...semesters.children].indexOf(card) + 1;
  let currentRows = [...card.querySelectorAll('.subject-row')];
  while (currentRows.length < rows.length) {
    const inserted = addSubject(card, semesterNumber);
    if (!inserted) throw new Error('Unable to add extra subject rows automatically.');
    currentRows = [...card.querySelectorAll('.subject-row')];
  }
  while (currentRows.length > rows.length) {
    currentRows[currentRows.length - 1].remove();
    currentRows = [...card.querySelectorAll('.subject-row')];
  }
  let skippedGrades = 0;
  let importedCredits = 0;
  rows.forEach((item, index) => {
    const row = currentRows[index];
    if (!row) throw new Error('Unable to create subject row from marksheet.');
    const subjectField = row.querySelector('.subject-name');
    const creditField = row.querySelector('.credits');
    const gradeField = row.querySelector('.grade');
    if (!subjectField || !creditField || !gradeField) throw new Error('Some subject fields are missing in this semester card.');
    subjectField.value = `${item.code} - ${item.subject}`;
    creditField.value = item.credit;
    importedCredits += item.credit;
    const gradeOption = [...gradeField.options].find(option => option.textContent.trim().toUpperCase().startsWith(`${item.grade} `) || option.textContent.trim().toUpperCase().startsWith(`${item.grade}(`));
    if (gradeOption) gradeField.value = gradeOption.value; else skippedGrades += 1;
  });
  updateSemesterCreditTotal(card);
  saveState();
  return { skippedGrades, importedCredits, semesterNumber };
};

const ensureMarksheetTools = () => {
  if (!window.Tesseract) throw new Error('Marksheet OCR is unavailable. Please refresh and try again.');
};

const runOcr = async (input, ocrConfig = {}) => {
  const result = await window.Tesseract.recognize(input, 'eng', ocrConfig);
  return result.data?.text || '';
};

const loadImageFromBlob = blob => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to read the uploaded image.')); };
  image.src = url;
});

const renderSourceCanvas = async source => {
  if (source instanceof HTMLCanvasElement) return source;
  if (source instanceof Blob) {
    const image = await loadImageFromBlob(source);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return canvas;
  }
  return null;
};

const preprocessCanvas = (canvas, threshold = null) => {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round((data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114));
    const value = threshold === null ? gray : (gray >= threshold ? 255 : 0);
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  ctx.putImageData(imageData, 0, 0);
  return out;
};

const mergeOcrTexts = texts => {
  const seen = new Set();
  const lines = [];
  texts.join('\n').split(/\r?\n/).forEach(line => {
    const normalized = line.trim().replace(/\s+/g, ' ');
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    lines.push(normalized);
  });
  return lines.join('\n');
};

const runOcrMultiPass = async source => {
  const texts = [];
  texts.push(await runOcr(source, { tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }));
  const canvas = await renderSourceCanvas(source);
  if (!canvas) return texts[0];
  const grayscale = preprocessCanvas(canvas);
  const thresholded = preprocessCanvas(canvas, 170);
  texts.push(await runOcr(grayscale, { tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }));
  texts.push(await runOcr(thresholded, { tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }));
  return mergeOcrTexts(texts);
};

const getPdfLib = () => window.pdfjsLib || window['pdfjs-dist/build/pdf'] || null;

const readTextFromMarksheet = async file => {
  ensureMarksheetTools();
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return runOcrMultiPass(file);
  const pdfLib = getPdfLib();
  if (!pdfLib) throw new Error('PDF reader is unavailable. Please refresh and try again.');
  if (!pdfLib.GlobalWorkerOptions.workerSrc) {
    pdfLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfLib.getDocument({ data }).promise;
  let textLayerOutput = '';
  let ocrOutput = '';
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    try {
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str || '').join(' ').trim();
      if (pageText) textLayerOutput += `\n${pageText}`;
    } catch (error) {
      textLayerOutput += '';
    }
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    ocrOutput += `\n${await runOcrMultiPass(canvas)}`;
  }
  const primaryText = textLayerOutput.trim().length > 50 ? textLayerOutput : '';
  return `${primaryText}\n${ocrOutput}`.trim();
};

const importMarksheet = async (card, input, triggerButton) => {
  const file = input.files?.[0];
  if (!file) { setSubjectError('Please choose a marksheet PDF or image file to upload.'); return; }
  setSubjectError('');
  const defaultLabel = triggerButton.textContent;
  triggerButton.disabled = true;
  triggerButton.textContent = 'Analyzing...';
  try {
    const text = await readTextFromMarksheet(file);
    const rows = extractMarksheetRows(text);
    if (!rows.length) throw new Error('Could not detect subject rows. Upload a clearer marksheet image or PDF.');
    const { skippedGrades } = applyMarksheetRows(card, rows);
    if (skippedGrades) {
      setSubjectError(`Imported ${rows.length} subjects. ${skippedGrades} grade${skippedGrades === 1 ? '' : 's'} could not be mapped automatically. Please verify uploaded data.`);
    }
  } catch (error) {
    setSubjectError(error?.message || 'Unable to import marksheet data right now.');
  } finally {
    triggerButton.disabled = false;
    triggerButton.textContent = defaultLabel;
    input.value = '';
  }
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
  if (event.target.matches('.add-subject')) {
    if (!card || !addSubject(card)) setSubjectError('Unable to add a subject row in this semester.');
  }
  if (event.target.matches('.upload-marksheet')) {
    if (!card) { setSubjectError('Unable to locate the selected semester for marksheet upload.'); return; }
    const marksheetInput = card.querySelector('.marksheet-upload-input');
    if (!marksheetInput) setSubjectError('Upload input is missing for this semester.');
    else marksheetInput.click();
  }
  if (event.target.matches('.remove-subject')) {
    const subjectRow = event.target.closest('.subject-row');
    if (subjectRow) {
      subjectRow.remove();
      if (card) updateSemesterCreditTotal(card);
    }
  }
  if (event.target.matches('.remove-semester')) {
    if (!card) { setSubjectError('Unable to remove this semester right now.'); return; }
    card.remove();
    [...semesters.children].forEach((semester, index) => {
      const name = semester.querySelector('.semester-name');
      if (/^Semester \d+$/.test(name.value)) name.value = `Semester ${index + 1}`;
    });
  }
  saveState();
});

semesters.addEventListener('change', async event => {
  if (!event.target.matches('.marksheet-upload-input')) return;
  const card = event.target.closest('.semester');
  const triggerButton = card?.querySelector('.upload-marksheet');
  if (!card || !triggerButton) { setSubjectError('Unable to process this marksheet upload.'); return; }
  await importMarksheet(card, event.target, triggerButton);
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
      const row = addSubject(element, index + 1);
      if (!row) throw new Error('Unable to restore saved subject row.');
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
