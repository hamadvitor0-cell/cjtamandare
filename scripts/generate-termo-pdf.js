const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "frontend", "docs");
const outputPath = path.join(outputDir, "termo-compromisso-cj.pdf");
const logoPath = path.join(root, "frontend", "img", "logo.jpg");

fs.mkdirSync(outputDir, { recursive: true });

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 34, bottom: 28, left: 34, right: 34 },
  info: {
    Title: "Termo de Compromisso - CJ",
    Author: "Centro da Juventude Almirante Tamandaré",
    Subject: "Termo para assinatura eletrônica gov.br"
  }
});

doc.pipe(fs.createWriteStream(outputPath));

const pageWidth = doc.page.width;
const left = 34;
const right = pageWidth - 34;
const contentWidth = right - left;
let y = 34;

function at(nextY) {
  y = nextY;
  doc.y = y;
}

function text(value, x, width, options = {}) {
  doc
    .font(options.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(options.size || 9.4)
    .fillColor(options.color || "#424852")
    .text(value, x, y, {
      width,
      align: options.align || "justify",
      lineGap: options.lineGap ?? 0.5,
      characterSpacing: options.characterSpacing || 0
    });
  y = doc.y;
}

function center(value, size = 10, options = {}) {
  text(value, left, contentWidth, {
    size,
    bold: options.bold !== false,
    align: "center",
    characterSpacing: options.characterSpacing || 0,
    color: options.color
  });
}

function sectionTitle(value) {
  y += 7;
  center(value, 13, { characterSpacing: 6, color: "#3f4651" });
  y += 3;
}

function line(x1, y1, x2, y2, width = 0.7) {
  doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(width).strokeColor("#596170").stroke();
}

function fieldLine(label, x, width) {
  doc.font("Helvetica").fontSize(9.2).fillColor("#555c67").text(label, x, y, { continued: true });
  const labelWidth = doc.widthOfString(label);
  line(x + labelWidth + 4, y + 9, x + width, y + 9, 0.55);
}

function numbered(items, x, width) {
  doc.font("Helvetica").fontSize(8.6).fillColor("#505762");
  items.forEach((item, index) => {
    doc.text(`${index + 1}. ${item}`, x, y, { width, align: "center", lineGap: 0.15 });
    y = doc.y;
  });
}

function paragraph(value, options = {}) {
  text(value, options.x || left + 12, options.width || contentWidth - 24, {
    size: options.size || 8.8,
    align: options.align || "justify",
    lineGap: options.lineGap ?? 0.35,
    bold: options.bold,
    color: options.color || "#555c67",
    characterSpacing: options.characterSpacing || 0
  });
}

doc.rect(12, 12, pageWidth - 24, doc.page.height - 24).lineWidth(0.7).strokeColor("#ded7bf").stroke();

doc.font("Helvetica-Bold").fontSize(22).fillColor("#4b515c").text("TERMO DE COMPROMISSO- CJ", left, y, {
  width: contentWidth,
  align: "center",
  characterSpacing: 8
});
y = doc.y + 9;
line(left, y, right, y, 1.2);
line(left, y + 4, right, y + 4, 1.2);
y += 24;

fieldLine("O Aluno (a)", left + 8, 420);
doc.font("Helvetica").fontSize(9.2).fillColor("#555c67").text("e seu responsável legal", left + 430, y, { width: 120, align: "right" });
y += 23;
fieldLine("", left + 8, 300);
doc.font("Helvetica").fontSize(9.2).fillColor("#555c67").text("através deste documento, toma ciência", left + 310, y, { width: 230, align: "right" });
y += 16;
paragraph("das normas do Centro da Juventude, e se comprometem a realizarem para o bom andamento das atividades da qual tenha escolhido. Contatos/Whats: (41)________-________ / (41)________-________.", { x: left + 8, width: contentWidth - 16, size: 8.9 });

center("Direitos:", 9.6, { color: "#555c67" });
numbered([
  "Participar das atividades ofertadas pelo Centro da Juventude;",
  "Usufruir das dependências conforme as normas e critérios estipulados;",
  "Ter acesso aos programas e políticas ofertadas pelo Centro;",
  "Opinar, e participar dos grupos onde se faz a gestão do Centro;"
], left + 110, contentWidth - 220);

y += 5;
center("Deveres:", 9.6, { color: "#555c67" });
numbered([
  "Respeitar colegas, professores, estagiários e oficineiros neste ambiente;",
  "Participar das atividades e ser assíduo não podendo atingir 3 faltas no mês, e quando faltar justificar aos professores ou à Coordenação do Centro através de atestado médico ou comunicado do responsável legal;",
  "Zelar pelos seus pertences, não esquecer nas dependências evitando extravios;",
  "Zelar pela segurança do Centro da Juventude, não trazendo objetos que traga riscos aos demais alunos e funcionários e também não trazer pessoas que não esteja devidamente matriculadas nas atividades;",
  "Comunicar a equipe de funcionários quaisquer irregularidades que vierem ocorrer no espaço ou durante as atividades;",
  "Durante os horários das atividades, só serão permitidas as saídas do ambiente de aula, com autorização do professor e sobre ser dispensado mais cedo apenas mediante pedido por escrito ou via telefone do responsável legal ou Instituição de Ensino;"
], left + 52, contentWidth - 104);

y += 8;
doc.roundedRect(left + 2, y, contentWidth - 4, 24, 4).lineWidth(0.8).strokeColor("#747b86").stroke();
doc.font("Helvetica-Bold").fontSize(8.4).fillColor("#555c67").text("O não cumprimento desse termo de compromisso implicará em afastamento temporário das atividade ou desligamento.", left + 10, y + 8, {
  width: contentWidth - 20,
  align: "center"
});
y += 36;

sectionTitle("SOBRE USO DE IMAGEM");
paragraph("Ao responsável, autoriza o uso de imagem e som do (a) seu (sua) filho (a), em qualquer material entre fotos e documentos para serem utilizados em divulgações, campanhas promocionais e institucionais do Centro da Juventude Governador José Richa, com sede à rua Deputado Max Rosemann n° 100, Jardim São Venâncio, bairro Cachoeira - Almirante Tamandaré - PR.", {
  x: left + 8,
  width: contentWidth - 16,
  size: 8.8
});
y += 5;
paragraph("A presente autorização é concedida a título gratuito, abrangendo o uso de imagem acima mencionada em todo território nacional e no exterior, sob qualquer forma e meios.", {
  x: left + 8,
  width: contentWidth - 16,
  size: 8.8,
  characterSpacing: 2.4
});

sectionTitle("SOBRE APTIDÃO FÍSICA");
paragraph("O participante da atividade ou seu representante legal, tem ciência que está em perfeita saúde e apto a participar de atividade física ou esportiva. No caso se existir algum problema de saúde deve ser comunicado no ato da matrícula e apresentar autorização médica para assim poder ser devidamente matriculado.", {
  x: left + 8,
  width: contentWidth - 16,
  size: 8.8,
  characterSpacing: 2.2
});

y += 24;
center("Almirante Tamandaré, _________ de ______________________________ de 2026.", 9.2, { color: "#555c67" });

y += 24;
line(left + 30, y + 18, left + 150, y + 18, 0.8);
if (fs.existsSync(logoPath)) {
  doc.image(logoPath, left + 205, y - 4, { width: 100, height: 70, fit: [100, 70] });
}
line(right - 170, y + 18, right - 20, y + 18, 0.8);

doc.font("Helvetica").fontSize(8.4).fillColor("#555c67").text("Requerente", left + 52, y + 23, { width: 86, align: "center" });
doc.font("Helvetica").fontSize(7.5).fillColor("#555c67").text("(Responsável pelo Aluno)", left + 35, y + 34, { width: 120, align: "center" });
doc.font("Helvetica").fontSize(7.5).fillColor("#555c67").text("Assinatura eletrônica gov.br", right - 160, y + 24, { width: 130, align: "center" });

y += 62;
doc.font("Helvetica-Bold").fontSize(8).fillColor("#3f4651").text("Orientação para inscrição online:", left + 8, y, { continued: true });
doc.font("Helvetica").fontSize(8).fillColor("#555c67").text(" assine este PDF no portal oficial gov.br, baixe o arquivo assinado e anexe-o no formulário. Se a assinatura eletrônica for inválida, a inscrição não será validada.", {
  width: contentWidth - 16,
  align: "justify"
});

doc.end();
