export const categoryColors = {
  Esportes: "#087a3d",
  "Dança e Movimento": "#1257a6",
  Música: "#f07f12",
  Educação: "#c9181d",
  Tecnologia: "#c9181d",
  Jogos: "#c9181d",
  "Artes e Cultura": "#5b2695"
};

export const workshops = [
  ["Futsal", "Esportes", "Treinos coletivos para desenvolver técnica, trabalho em equipe e convivência.", "12 a 18 anos", "Horários definidos pela secretaria", "FT"],
  ["Vôlei", "Esportes", "Fundamentos, jogos orientados e integração por meio do esporte.", "12 a 18 anos", "Horários definidos pela secretaria", "VL"],
  ["Basquete", "Esportes", "Aulas práticas com foco em coordenação, disciplina e participação coletiva.", "12 a 18 anos", "Horários definidos pela secretaria", "BQ"],
  ["Muay Thai", "Esportes", "Atividade física orientada para autocontrole, respeito e condicionamento.", "12 a 18 anos", "Horários definidos pela secretaria", "MT"],
  ["Judô", "Esportes", "Prática educativa com foco em disciplina, postura e desenvolvimento corporal.", "12 a 18 anos", "Horários definidos pela secretaria", "JD"],
  ["Capoeira", "Esportes", "Movimento, musicalidade e cultura brasileira em uma oficina inclusiva.", "12 a 18 anos", "Horários definidos pela secretaria", "CP"],
  ["Ginástica", "Dança e Movimento", "Consciência corporal, alongamento e expressão por meio do movimento.", "12 a 18 anos", "Horários definidos pela secretaria", "GN"],
  ["Dança Ritmos", "Dança e Movimento", "Aulas dinâmicas com diferentes estilos, coordenação e presença de palco.", "12 a 18 anos", "Horários definidos pela secretaria", "DR"],
  ["Ballet", "Dança e Movimento", "Base técnica, postura e expressão artística em ambiente acolhedor.", "12 a 18 anos", "Horários definidos pela secretaria", "BL"],
  ["Danças Urbanas", "Dança e Movimento", "Ritmos urbanos, criação coreográfica e protagonismo juvenil.", "12 a 18 anos", "Horários definidos pela secretaria", "DU"],
  ["Violão", "Música", "Introdução musical, acordes, repertório e prática coletiva.", "12 a 18 anos", "Horários definidos pela secretaria", "VI"],
  ["Canto Coral", "Música", "Técnica vocal, escuta, harmonia e apresentações em grupo.", "12 a 18 anos", "Horários definidos pela secretaria", "CC"],
  ["Bateria e Percussão", "Música", "Ritmo, coordenação e prática musical com instrumentos percussivos.", "12 a 18 anos", "Horários definidos pela secretaria", "BP"],
  ["Teclado", "Música", "Leitura musical inicial, harmonia e execução de repertório.", "12 a 18 anos", "Horários definidos pela secretaria", "TC"],
  ["Flauta Doce", "Música", "Prática instrumental para musicalização e desenvolvimento auditivo.", "12 a 18 anos", "Horários definidos pela secretaria", "FD"],
  ["Inglês", "Educação", "Comunicação básica, vocabulário cotidiano e apoio ao aprendizado.", "12 a 18 anos", "Horários definidos pela secretaria", "IN"],
  ["Informática", "Educação", "Noções digitais, uso seguro de tecnologia e ferramentas essenciais.", "12 a 18 anos", "Horários definidos pela secretaria", "IF"],
  ["Xadrez", "Educação", "Estratégia, concentração, raciocínio lógico e convivência.", "12 a 18 anos", "Horários definidos pela secretaria", "XZ"],
  ["Libras", "Educação", "Introdução à Língua Brasileira de Sinais e comunicação inclusiva.", "12 a 18 anos", "Horários definidos pela secretaria", "LB"],
  ["Pintura em Tela", "Artes e Cultura", "Criação visual, técnicas de pintura e expressão artística.", "12 a 18 anos", "Horários definidos pela secretaria", "PT"],
  ["Teatro", "Artes e Cultura", "Jogos cênicos, expressão corporal, voz e criação coletiva.", "12 a 18 anos", "Horários definidos pela secretaria", "TT"]
].map(([nome, categoria, descricao, faixaEtaria, horario, initials]) => ({
  nome,
  categoria,
  descricao,
  faixaEtaria,
  diasSemana: [],
  periodo: "a definir",
  horario,
  imagemUrl: "/img/oficinas.png",
  initials
}));

export const categories = ["Todas", ...Array.from(new Set(workshops.map((item) => item.categoria)))];

export const agenda = [
  {
    dia: "Inscrições 2026",
    color: "#0b4f91",
    eventos: [
      ["09 a 13/02", "Período exclusivo para alunos ativos de 2025"],
      ["A partir de 19/02", "Inscrições gerais para novos alunos"]
    ]
  },
  {
    dia: "Atendimento",
    color: "#087a3d",
    eventos: [
      ["8h30 às 12h", "Recebimento de documentação"],
      ["13h às 17h", "Orientação e confirmação"],
      ["18h às 19h30", "Atendimento estendido no período de inscrições"]
    ]
  },
  {
    dia: "Aulas",
    color: "#f07f12",
    eventos: [
      ["19/02", "Retorno previsto das atividades"],
      ["Semanal", "Grade por turma divulgada pela equipe do Centro"]
    ]
  }
];

export const galleryItems = [
  {
    src: "/img/oficinas.png",
    alt: "Quadro oficial com lista de oficinas do Centro da Juventude",
    caption: "Oficinas disponíveis"
  },
  {
    src: "/img/logo.jpg",
    alt: "Logo oficial do Centro da Juventude Almirante Tamandaré",
    caption: "Identidade oficial"
  }
];

export const collaborators = [
  {
    nome: "SESC Paraná",
    descricao: "O Sesc Paraná atua em áreas como ação social, cultura, educação, esporte e lazer, saúde, alimentação e turismo, ampliando o acesso da comunidade a serviços e atividades formativas.",
    siteUrl: "https://www.sescpr.com.br/",
    imagemUrl: "/img/sesc-parana.png",
    alt: "Logo do SESC Paraná",
    ordem: 1
  },
  {
    nome: "Secretaria Municipal de Cultura e Turismo",
    descricao: "A Secretaria de Cultura e Turismo de Almirante Tamandaré promove o desenvolvimento cultural, protege o patrimônio local e incentiva ações de turismo, eventos e valorização do Circuito da Natureza.",
    siteUrl: "https://tamandare.pr.gov.br/secretarias/cultura-e-turismo",
    imagemUrl: "",
    alt: "Secretaria Municipal de Cultura e Turismo de Almirante Tamandaré",
    ordem: 2
  }
];

export const testimonials = [];
